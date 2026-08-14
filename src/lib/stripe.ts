import { supabase, supabaseUrl } from './supabase';

interface CheckoutOptions {
  priceId: string;
}

export async function createCheckoutSession({ priceId }: CheckoutOptions) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    console.log('Creating checkout session for price:', priceId);

    const response = await fetch(
      `${supabaseUrl}/functions/v1/stripe-checkout`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ priceId }),
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

export async function createPortalSession() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    console.log('Creating portal session');

    const response = await fetch(
      `${supabaseUrl}/functions/v1/stripe-portal`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
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