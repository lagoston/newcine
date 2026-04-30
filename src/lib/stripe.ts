import { supabase, supabaseUrl, supabaseAnonKey } from './supabase';

interface CheckoutOptions {
  priceId: string;
  userId: string;
  email: string;
}

export async function createCheckoutSession({ priceId, userId, email }: CheckoutOptions) {
  try {
    // We'll let the edge function handle the customer creation/verification
    // rather than checking for it here first to avoid race conditions
    
    console.log('Creating checkout session for:', { priceId, userId });
    
    const response = await fetch(
      `${supabaseUrl}/functions/v1/stripe-checkout`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ priceId, userId, email }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create checkout session');
    }

    const { url, customerId } = await response.json();
    
    // Store the customerId in sessionStorage so it's available when we return from Stripe
    if (customerId) {
      console.log('Storing customer ID in session storage:', customerId);
      sessionStorage.setItem('stripe_customer_id', customerId);
    }
    
    return url;
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw new Error(`Checkout session creation failed: ${error.message}`);
  }
}

export async function createPortalSession(userId: string) {
  try {
    // Try to get customerId from session storage first
    const storedCustomerId = sessionStorage.getItem('stripe_customer_id');
    let customerId = null;
    
    if (storedCustomerId) {
      console.log('Using stored customer ID:', storedCustomerId);
      customerId = storedCustomerId;
    } else {
      // Fall back to DB query if not in session storage
      try {
        console.log('Fetching customer ID from database for user:', userId);
        const { data, error } = await supabase
          .from('stripe_customers')
          .select('customer_id')
          .eq('user_id', userId)
          .maybeSingle();
          
        if (error && error.code !== 'PGRST116') {
          throw error;
        }
        
        if (data?.customer_id) {
          customerId = data.customer_id;
          sessionStorage.setItem('stripe_customer_id', customerId);
        }
      } catch (dbError) {
        console.error('Error fetching customer ID from database:', dbError);
        // Continue without customerId - the edge function will handle this
      }
    }
    
    console.log(`Creating portal session for user: ${userId}, customer: ${customerId || 'unknown'}`);
    
    const response = await fetch(
      `${supabaseUrl}/functions/v1/stripe-portal`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          userId,
          customerId // Pass the customerId if we have it
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create portal session');
    }

    const { url } = await response.json();
    return url;
  } catch (error) {
    console.error('Error creating portal session:', error);
    throw new Error(`Portal session creation failed: ${error.message}`);
  }
}