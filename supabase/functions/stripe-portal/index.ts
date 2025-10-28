import Stripe from 'npm:stripe@14.21.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestBody {
  userId: string;
  customerId?: string;
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

    const { userId, customerId: providedCustomerId } = await req.json() as RequestBody;

    if (!userId) {
      throw new Error('Missing required fields');
    }

    console.log(`Creating customer portal session for user: ${userId}`);
    
    // Use the provided customerId if available
    let customerId = providedCustomerId;
    
    // If no customerId was provided, look it up in the database
    if (!customerId) {
      const { data, error } = await supabase
        .from('stripe_customers')
        .select('customer_id')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error fetching customer ID:', error);
        throw new Error(`Customer not found for user ${userId}`);
      }

      customerId = data.customer_id;
    }

    console.log(`Using Stripe customer: ${customerId}`);

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${req.headers.get('origin')}/premium?portal_return=true`,
    });

    console.log(`Portal session created: ${session.id}`);
    
    return new Response(
      JSON.stringify({ url: session.url }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error creating portal session:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});