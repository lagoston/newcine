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
  appInfo: { name: 'Bolt Integration', version: '1.0.0' },
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Structured log helper — every line has event_id for cross-referencing with Stripe dashboard
function log(level: 'INFO' | 'WARN' | 'ERROR', eventId: string, message: string, data?: unknown) {
  const entry = {
    level,
    event_id: eventId,
    ts: new Date().toISOString(),
    message,
    ...(data !== undefined ? { data } : {}),
  };
  if (level === 'ERROR') {
    console.error(JSON.stringify(entry));
  } else if (level === 'WARN') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    console.error(JSON.stringify({ level: 'ERROR', message: 'No stripe-signature header' }));
    return new Response('No signature found', { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
  } catch (err: any) {
    console.error(JSON.stringify({ level: 'ERROR', message: 'Signature verification failed', error: err.message }));
    return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 });
  }

  const eid = event.id;

  log('INFO', eid, 'Webhook received', {
    type: event.type,
    created: new Date(event.created * 1000).toISOString(),
    livemode: event.livemode,
  });

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const userId = session.metadata?.user_id;

        log('INFO', eid, 'checkout.session.completed', {
          session_id: session.id,
          customer_id: customerId,
          subscription_id: subscriptionId,
          user_id: userId,
        });

        if (!customerId) {
          log('ERROR', eid, 'No customer_id in checkout session');
          return new Response('No customer ID found in session', { status: 400 });
        }

        if (userId) {
          const { data: existing } = await supabase
            .from('stripe_customers')
            .select('customer_id')
            .eq('customer_id', customerId)
            .maybeSingle();

          if (!existing) {
            log('WARN', eid, 'Customer not in DB — creating', { customer_id: customerId, user_id: userId });
            const { error: insErr } = await supabase
              .from('stripe_customers')
              .insert([{ user_id: userId, customer_id: customerId }]);
            if (insErr) {
              log('ERROR', eid, 'Failed to create stripe_customers record', { error: insErr });
            } else {
              log('INFO', eid, 'stripe_customers record created');
            }
          }
        }

        if (subscriptionId) {
          log('INFO', eid, 'Retrieving full subscription from Stripe', { subscription_id: subscriptionId });
          let processed = false;

          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            log('INFO', eid, 'Subscription retrieved', {
              status: sub.status,
              current_period_start: sub.current_period_start,
              current_period_end: sub.current_period_end,
              period_end_readable: new Date(sub.current_period_end * 1000).toISOString(),
            });

            const { data, error } = await supabase.rpc('process_stripe_webhook_event', {
              event_type: event.type,
              customer_id: customerId,
              subscription_id: subscriptionId,
              status: sub.status,
              price_id: sub.items.data[0]?.price.id,
              current_period_start: sub.current_period_start,
              current_period_end: sub.current_period_end,
            });

            if (error) {
              log('ERROR', eid, 'process_stripe_webhook_event failed', { error });
              throw error;
            }

            log('INFO', eid, 'process_stripe_webhook_event succeeded', { result: data });
            processed = true;
          } catch (subErr: any) {
            log('ERROR', eid, 'Failed to retrieve subscription — using fallback activation', {
              error: subErr?.message ?? subErr,
            });

            const { data, error } = await supabase.rpc('activate_premium_for_stripe_customer', {
              customer_id_param: customerId,
            });

            if (error) {
              log('ERROR', eid, 'Fallback activate_premium_for_stripe_customer failed', { error });
              throw error;
            }

            log('WARN', eid, 'Fallback activation succeeded (period dates not updated)', { result: data });
            processed = true;
          }

          if (processed) {
            const { data: syncData, error: syncErr } = await supabase.rpc('sync_customer_subscription_status', {
              customer_id_input: customerId,
            });
            if (syncErr) {
              log('WARN', eid, 'sync_customer_subscription_status failed', { error: syncErr });
            } else {
              log('INFO', eid, 'sync_customer_subscription_status succeeded', { result: syncData });
            }
          }
        } else {
          log('WARN', eid, 'No subscription_id — using direct activation', { customer_id: customerId });
          const { data, error } = await supabase.rpc('activate_premium_for_stripe_customer', {
            customer_id_param: customerId,
          });
          if (error) {
            log('ERROR', eid, 'activate_premium_for_stripe_customer failed', { error });
            throw error;
          }
          log('INFO', eid, 'Direct activation succeeded', { result: data });
        }
        break;
      }

      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription;
        log('INFO', eid, 'customer.subscription.created', {
          subscription_id: sub.id,
          customer_id: sub.customer,
          status: sub.status,
          current_period_end: sub.current_period_end,
          period_end_readable: new Date(sub.current_period_end * 1000).toISOString(),
        });

        const { data, error } = await supabase.rpc('process_stripe_webhook_event', {
          event_type: event.type,
          customer_id: sub.customer as string,
          subscription_id: sub.id,
          status: sub.status,
          price_id: sub.items.data[0]?.price.id,
          current_period_start: sub.current_period_start,
          current_period_end: sub.current_period_end,
        });

        if (error) {
          log('ERROR', eid, 'process_stripe_webhook_event failed', { error });
          throw error;
        }
        log('INFO', eid, 'process_stripe_webhook_event succeeded', { result: data });

        const { data: syncData, error: syncErr } = await supabase.rpc('sync_customer_subscription_status', {
          customer_id_input: sub.customer as string,
        });
        if (syncErr) {
          log('WARN', eid, 'sync_customer_subscription_status failed', { error: syncErr });
        } else {
          log('INFO', eid, 'sync_customer_subscription_status succeeded', { result: syncData });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        log('INFO', eid, 'customer.subscription.updated', {
          subscription_id: sub.id,
          customer_id: sub.customer,
          status: sub.status,
          current_period_start: sub.current_period_start,
          current_period_end: sub.current_period_end,
          period_end_readable: new Date(sub.current_period_end * 1000).toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
        });

        const { data, error } = await supabase.rpc('process_stripe_webhook_event', {
          event_type: event.type,
          customer_id: sub.customer as string,
          subscription_id: sub.id,
          status: sub.status,
          price_id: sub.items.data[0]?.price.id,
          current_period_start: sub.current_period_start,
          current_period_end: sub.current_period_end,
        });

        if (error) {
          log('ERROR', eid, 'process_stripe_webhook_event failed', { error });
          throw error;
        }
        log('INFO', eid, 'process_stripe_webhook_event succeeded', { result: data });

        const { data: syncData, error: syncErr } = await supabase.rpc('sync_customer_subscription_status', {
          customer_id_input: sub.customer as string,
        });
        if (syncErr) {
          log('WARN', eid, 'sync_customer_subscription_status failed', { error: syncErr });
        } else {
          log('INFO', eid, 'sync_customer_subscription_status succeeded', { result: syncData });
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;

        log('INFO', eid, 'invoice.payment_succeeded', {
          invoice_id: invoice.id,
          customer_id: invoice.customer,
          subscription_id: invoice.subscription,
          billing_reason: invoice.billing_reason,  // 'subscription_cycle' on renewal, 'subscription_create' on first
          amount_paid: invoice.amount_paid,
        });

        if (!invoice.subscription) {
          log('WARN', eid, 'invoice.payment_succeeded has no subscription_id — skipping');
          break;
        }

        const subscriptionId = invoice.subscription as string;
        const customerId = invoice.customer as string;

        log('INFO', eid, 'Retrieving full subscription from Stripe to get updated period', {
          subscription_id: subscriptionId,
        });

        let subRetrieved = false;
        try {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          subRetrieved = true;

          log('INFO', eid, 'Subscription retrieved successfully', {
            status: sub.status,
            current_period_start: sub.current_period_start,
            current_period_end: sub.current_period_end,
            period_end_readable: new Date(sub.current_period_end * 1000).toISOString(),
          });

          const { data, error } = await supabase.rpc('process_stripe_webhook_event', {
            event_type: event.type,
            customer_id: customerId,
            subscription_id: subscriptionId,
            status: sub.status,
            price_id: sub.items.data[0]?.price.id,
            current_period_start: sub.current_period_start,
            current_period_end: sub.current_period_end,
          });

          if (error) {
            log('ERROR', eid, 'process_stripe_webhook_event failed', { error });
            throw error;
          }

          log('INFO', eid, 'process_stripe_webhook_event succeeded — period_end updated', { result: data });
        } catch (subErr: any) {
          // If we already retrieved the sub but the RPC failed, re-throw — don't silently skip
          if (subRetrieved) {
            log('ERROR', eid, 'process_stripe_webhook_event threw after successful sub retrieval', {
              error: subErr?.message ?? subErr,
            });
            throw subErr;
          }

          // Subscription retrieval itself failed — fallback WITHOUT period data
          // IMPORTANT: current_period_end will NOT be updated (COALESCE keeps old value).
          // The subscription status is still valid via is_premium_active() trusting status='active'.
          log('ERROR', eid, 'stripe.subscriptions.retrieve failed — fallback WITHOUT period update', {
            error: subErr?.message ?? subErr,
            warning: 'current_period_end will remain stale in DB',
          });

          const { data, error } = await supabase.rpc('process_stripe_webhook_event', {
            event_type: event.type,
            customer_id: customerId,
            subscription_id: subscriptionId,
            // Intentionally omitting period fields — COALESCE keeps existing values
          });

          if (error) {
            log('ERROR', eid, 'Fallback process_stripe_webhook_event also failed', { error });
            throw error;
          }

          log('WARN', eid, 'Fallback process succeeded — period_end NOT updated, check Stripe for actual renewal date', {
            result: data,
          });
        }

        const { data: syncData, error: syncErr } = await supabase.rpc('sync_customer_subscription_status', {
          customer_id_input: customerId,
        });
        if (syncErr) {
          log('WARN', eid, 'sync_customer_subscription_status failed', { error: syncErr });
        } else {
          log('INFO', eid, 'sync_customer_subscription_status succeeded', { result: syncData });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        log('INFO', eid, 'customer.subscription.deleted', {
          subscription_id: sub.id,
          customer_id: sub.customer,
          current_period_end: sub.current_period_end,
          period_end_readable: new Date(sub.current_period_end * 1000).toISOString(),
        });

        const { data, error } = await supabase.rpc('process_stripe_webhook_event', {
          event_type: event.type,
          customer_id: sub.customer as string,
          subscription_id: sub.id,
          status: 'canceled',
        });

        if (error) {
          log('ERROR', eid, 'process_stripe_webhook_event failed', { error });
          throw error;
        }
        log('INFO', eid, 'process_stripe_webhook_event succeeded — subscription canceled', { result: data });

        const { data: syncData, error: syncErr } = await supabase.rpc('sync_customer_subscription_status', {
          customer_id_input: sub.customer as string,
        });
        if (syncErr) {
          log('WARN', eid, 'sync_customer_subscription_status failed', { error: syncErr });
        } else {
          log('INFO', eid, 'sync_customer_subscription_status succeeded — user downgraded', { result: syncData });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        log('WARN', eid, 'invoice.payment_failed', {
          invoice_id: invoice.id,
          customer_id: invoice.customer,
          subscription_id: invoice.subscription,
          attempt_count: invoice.attempt_count,
          next_payment_attempt: invoice.next_payment_attempt,
        });

        if (!invoice.subscription) {
          log('WARN', eid, 'invoice.payment_failed has no subscription_id — skipping');
          break;
        }

        const { data, error } = await supabase.rpc('process_stripe_webhook_event', {
          event_type: event.type,
          customer_id: invoice.customer as string,
          subscription_id: invoice.subscription as string,
          status: 'past_due',
        });

        if (error) {
          log('ERROR', eid, 'process_stripe_webhook_event failed', { error });
        } else {
          log('WARN', eid, 'Subscription marked as past_due', { result: data });
        }
        break;
      }

      default: {
        log('INFO', eid, `Unhandled event type — ignored`, { type: event.type });
        break;
      }
    }

    log('INFO', eid, 'Webhook processing complete');
    return Response.json({ received: true }, { headers: corsHeaders });

  } catch (err: any) {
    log('ERROR', eid ?? 'unknown', 'Unhandled exception — returning 500', {
      error: err?.message ?? String(err),
      stack: err?.stack,
    });
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});
