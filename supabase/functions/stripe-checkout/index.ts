import Stripe from 'npm:stripe@14.21.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestBody {
  priceId: string;
  userId: string;
  email: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { priceId, userId, email } = await req.json() as RequestBody;

    if (!priceId || !userId || !email) {
      throw new Error('Missing required fields');
    }

    console.log(`Creating checkout for user: ${userId}, email: ${email}, priceId: ${priceId}`);
    
    // Check if user is already premium
    const { data: ticketData, error: ticketError } = await supabase
      .from('user_tickets')
      .select('plan_type')
      .eq('user_id', userId)
      .single();

    if (ticketError && ticketError.code !== 'PGRST116') {
      throw ticketError;
    }

    if (ticketData?.plan_type === 'premium') {
      return new Response(
        JSON.stringify({ error: 'User already has premium access' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      );
    }

    // Try to get existing customer ID for this user
    const { data: customerData, error: customerError } = await supabase
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', userId)
      .single();
    
    // Get or create a customer
    let customerId: string;
    
    if (customerError && customerError.code !== 'PGRST116') {
      console.error('Error checking for existing customer:', customerError);
      throw customerError;
    }
    
    if (customerData?.customer_id) {
      // Use existing customer
      console.log(`Using existing Stripe customer: ${customerData.customer_id}`);
      customerId = customerData.customer_id;
    } else {
      // Create a new customer
      console.log(`Creating new Stripe customer for user: ${userId}`);
      const customer = await stripe.customers.create({
        email,
        metadata: {
          user_id: userId
        }
      });
      customerId = customer.id;
      
      // Save the new customer ID to our database
      const { error: insertError } = await supabase
        .from('stripe_customers')
        .insert([
          { user_id: userId, customer_id: customerId }
        ]);
        
      if (insertError) {
        console.error('Error saving customer to database:', insertError);
        throw insertError;
      }
      
      console.log(`Created and saved new Stripe customer: ${customerId}`);
      
      // Verify the customer was actually inserted
      const { data: verifyData, error: verifyError } = await supabase
        .from('stripe_customers')
        .select('customer_id')
        .eq('user_id', userId)
        .single();
        
      if (verifyError) {
        console.error('Error verifying customer record:', verifyError);
        throw new Error(`Customer record verification failed: ${verifyError.message}`);
      }
      
      if (!verifyData || verifyData.customer_id !== customerId) {
        console.error('Customer verification failed. Record not found or ID mismatch');
        throw new Error('Customer record verification failed');
      }
      
      console.log(`Verified customer record exists in database: ${customerId}`);
    }

    // Check subscription status - using correct column name 'status' instead of 'subscription_status'
    const { data: subData, error: subError } = await supabase
      .from('stripe_subscriptions')
      .select('status')
      .eq('customer_id', customerId)
      .maybeSingle();

    if (subError && subError.code !== 'PGRST116') {
      throw subError;
    }

    if (subData?.status === 'active') {
      return new Response(
        JSON.stringify({ error: 'User already has an active subscription' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      );
    }

    console.log('Creating checkout session...');
    
    // Determine if this is monthly or yearly plan
    const isPremiumMonthly = priceId === 'price_1RKVHvElYXeJYKCBWjxJgaub';
    const planType = isPremiumMonthly ? 'monthly' : 'yearly';
    
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${req.headers.get('origin')}/premium?success=true&session_id={CHECKOUT_SESSION_ID}&plan=${planType}`,
      cancel_url: `${req.headers.get('origin')}/premium`,
      metadata: {
        user_id: userId,
      },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
    });

    console.log(`Checkout session created: ${checkoutSession.id}`);
    
    return new Response(
      JSON.stringify({ 
        url: checkoutSession.url,
        customerId: customerId // Include the customer ID in the response
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});