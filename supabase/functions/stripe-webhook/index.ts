import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey, stripe-signature',
};

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const stripe = new Stripe(stripeSecret, {
  appInfo: {
    name: 'Bolt Integration',
    version: '1.0.0',
  },
});

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  try {
    console.log("🎯 Webhook received");
    
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      console.error('❌ No signature found');
      return new Response('No signature found', { status: 400 });
    }

    const body = await req.text();
    console.log('📦 Raw webhook body received');

    let event: Stripe.Event;

    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
      console.log('✅ Webhook signature verified');
    } catch (error: any) {
      console.error(`❌ Webhook signature verification failed: ${error.message}`);
      return new Response(`Webhook signature verification failed: ${error.message}`, { status: 400 });
    }

    console.log(`📣 Event type: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('💳 Processing checkout session:', session.id);
        
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const userId = session.metadata?.user_id;
        
        if (!customerId) {
          console.error('❌ No customer ID found in session');
          return new Response('No customer ID found in session', { status: 400 });
        }

        console.log(`👤 User ID from metadata: ${userId}, Customer ID: ${customerId}, Subscription ID: ${subscriptionId}`);
        
        if (userId) {
          const { data: existingCustomer } = await supabase
            .from('stripe_customers')
            .select('*')
            .eq('customer_id', customerId)
            .maybeSingle();
            
          if (!existingCustomer) {
            console.log(`⚠️ Customer ${customerId} not found in database, creating entry for user ${userId}`);
            const { error: customerError } = await supabase
              .from('stripe_customers')
              .insert([
                { user_id: userId, customer_id: customerId }
              ]);
              
            if (customerError) {
              console.error('❌ Error creating customer record:', customerError);
            } else {
              console.log('✅ Customer record created successfully');
            }
          } else {
            console.log(`✅ Found existing customer record for ${customerId}`);
          }
        }
        
        if (subscriptionId) {
          try {
            console.log('🔄 Retrieving full subscription details:', subscriptionId);
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            
            console.log('📝 Subscription status:', subscription.status);
            console.log('💰 Price ID:', subscription.items.data[0]?.price.id);
            console.log('📅 Current period start:', subscription.current_period_start);
            console.log('📅 Current period end:', subscription.current_period_end);
            
            const { data, error } = await supabase.rpc('process_stripe_webhook_event', { 
              event_type: event.type,
              customer_id: customerId,
              subscription_id: subscriptionId,
              status: subscription.status,
              price_id: subscription.items.data[0]?.price.id,
              current_period_start: subscription.current_period_start,
              current_period_end: subscription.current_period_end
            });
            
            if (error) {
              console.error('❌ Error processing checkout.session.completed with full subscription data:', error);
              throw error;
            }
            
            console.log('✅ Subscription processed successfully with full data:', data);
          } catch (subError) {
            console.error('❌ Error retrieving subscription details:', subError);
            
            console.log('⚠️ Falling back to basic premium activation');
            const { data: activationData, error: activationError } = await supabase.rpc('activate_premium_for_stripe_customer', {
              customer_id_param: customerId
            });

            if (activationError) {
              console.error('❌ Error with fallback activation:', activationError);
              throw activationError;
            }

            console.log('✅ Fallback activation successful:', activationData);
          }
        } else {
          console.log('⚠️ No subscription ID found, using direct premium activation');
          const { data: activationData, error: activationError } = await supabase.rpc('activate_premium_for_stripe_customer', {
            customer_id_param: customerId
          });
          
          if (activationError) {
            console.error('❌ Error with direct activation:', activationError);
            throw activationError;
          }
          
          console.log('✅ Direct activation successful:', activationData);
        }
        
        try {
          const { data: syncData, error: syncError } = await supabase.rpc('sync_customer_subscription_status', { 
            customer_id_input: customerId
          });
          
          if (syncError) {
            console.error('⚠️ Warning: Error syncing subscription status:', syncError);
          } else {
            console.log('✅ Explicitly synced subscription status:', syncData);
          }
        } catch (syncError) {
          console.error('⚠️ Error in explicit subscription sync:', syncError);
        }
        break;
      }
      
      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('🔔 New subscription created:', subscription.id);
        
        const { data, error } = await supabase.rpc('process_stripe_webhook_event', {
          event_type: event.type,
          customer_id: subscription.customer as string,
          subscription_id: subscription.id,
          status: subscription.status,
          price_id: subscription.items.data[0]?.price.id,
          current_period_start: subscription.current_period_start,
          current_period_end: subscription.current_period_end
        });
        
        if (error) {
          console.error('❌ Error processing customer.subscription.created:', error);
          throw error;
        }
        
        console.log('✅ New subscription processed successfully:', data);
        
        const { data: syncData, error: syncError } = await supabase.rpc('sync_customer_subscription_status', { 
          customer_id_input: subscription.customer as string
        });
        
        if (syncError) {
          console.error('⚠️ Warning: Error syncing subscription status:', syncError);
        } else {
          console.log('✅ Explicitly synced subscription status:', syncData);
        }
        break;
      }
      
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('🔄 Subscription updated:', subscription.id, 'Status:', subscription.status);
        
        const { data, error } = await supabase.rpc('process_stripe_webhook_event', {
          event_type: event.type,
          customer_id: subscription.customer as string,
          subscription_id: subscription.id,
          status: subscription.status,
          price_id: subscription.items.data[0]?.price.id,
          current_period_start: subscription.current_period_start,
          current_period_end: subscription.current_period_end
        });
        
        if (error) {
          console.error('❌ Error processing customer.subscription.updated:', error);
          throw error;
        }
        
        console.log('✅ Subscription update processed successfully:', data);
        
        const { data: syncData, error: syncError } = await supabase.rpc('sync_customer_subscription_status', { 
          customer_id_input: subscription.customer as string
        });
        
        if (syncError) {
          console.error('⚠️ Warning: Error syncing subscription status:', syncError);
        } else {
          console.log('✅ Explicitly synced subscription status:', syncData);
        }
        break;
      }
      
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;

        if (invoice.subscription) {
          console.log('💰 Invoice payment succeeded for subscription:', invoice.subscription);

          try {
            // Fetch full subscription to get the updated current_period_end after renewal
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);

            console.log('📅 Renewal period end:', subscription.current_period_end);
            console.log('📝 Subscription status:', subscription.status);

            const { data, error } = await supabase.rpc('process_stripe_webhook_event', {
              event_type: event.type,
              customer_id: invoice.customer as string,
              subscription_id: invoice.subscription as string,
              status: subscription.status,
              price_id: subscription.items.data[0]?.price.id,
              current_period_start: subscription.current_period_start,
              current_period_end: subscription.current_period_end
            });

            if (error) {
              console.error('❌ Error processing invoice.payment_succeeded:', error);
              throw error;
            }

            console.log('✅ Invoice payment processed successfully with real period data:', data);
          } catch (subError) {
            console.error('❌ Error retrieving subscription for invoice.payment_succeeded:', subError);
            // Fallback: process without period data (keeps existing values via COALESCE)
            const { data, error } = await supabase.rpc('process_stripe_webhook_event', {
              event_type: event.type,
              customer_id: invoice.customer as string,
              subscription_id: invoice.subscription as string
            });
            if (error) {
              console.error('❌ Fallback processing also failed:', error);
              throw error;
            }
            console.log('✅ Invoice payment processed (fallback):', data);
          }

          const { data: syncData, error: syncError } = await supabase.rpc('sync_customer_subscription_status', {
            customer_id_input: invoice.customer as string
          });

          if (syncError) {
            console.error('⚠️ Warning: Error syncing subscription status:', syncError);
          } else {
            console.log('✅ Explicitly synced subscription status:', syncData);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('🗑️ Subscription deleted/canceled:', subscription.id);

        const { data, error } = await supabase.rpc('process_stripe_webhook_event', {
          event_type: event.type,
          customer_id: subscription.customer as string,
          subscription_id: subscription.id,
          status: 'canceled'
        });

        if (error) {
          console.error('❌ Error processing customer.subscription.deleted:', error);
          throw error;
        }

        console.log('✅ Subscription deletion processed successfully:', data);

        const { data: syncData, error: syncError } = await supabase.rpc('sync_customer_subscription_status', {
          customer_id_input: subscription.customer as string
        });

        if (syncError) {
          console.error('⚠️ Warning: Error syncing subscription status:', syncError);
        } else {
          console.log('✅ User downgraded to free:', syncData);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;

        if (invoice.subscription) {
          console.log('❌ Invoice payment failed for subscription:', invoice.subscription);

          const { data, error } = await supabase.rpc('process_stripe_webhook_event', {
            event_type: event.type,
            customer_id: invoice.customer as string,
            subscription_id: invoice.subscription as string,
            status: 'past_due'
          });

          if (error) {
            console.error('❌ Error processing invoice.payment_failed:', error);
          } else {
            console.log('⚠️ Subscription marked as past_due:', data);
          }
        }
        break;
      }
    }

    return Response.json({ received: true }, { headers: corsHeaders });
  } catch (error: any) {
    console.error('❌ Error processing webhook:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});