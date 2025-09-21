import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // Get metadata from session
        const userId = session.metadata?.user_id;
        const credits = parseInt(session.metadata?.credits || '0');
        const purchaseType = session.metadata?.purchase_type;
        const discountCode = session.metadata?.discount_code;

        if (!userId) {
          console.error('No user ID in session metadata');
          return NextResponse.json({ error: 'No user ID' }, { status: 400 });
        }

        // Update purchase status
        const { error: purchaseError } = await supabase
          .from('purchases')
          .update({
            status: 'completed',
            stripe_payment_intent_id: session.payment_intent as string,
            completed_at: new Date().toISOString(),
          })
          .eq('stripe_session_id', session.id);

        if (purchaseError) {
          console.error('Error updating purchase:', purchaseError);
          throw purchaseError;
        }

        // Grant credits to user
        const { error: creditError } = await supabase.rpc('grant_credits', {
          p_user_id: userId,
          p_credits: credits,
          p_purchase_id: null, // We could pass the purchase ID here if needed
        });

        if (creditError) {
          console.error('Error granting credits:', creditError);
          throw creditError;
        }

        // Track discount code usage if one was used
        if (discountCode) {
          // First get current usage count
          const { data: currentDiscount } = await supabase
            .from('discount_codes')
            .select('usage_count')
            .eq('code', discountCode)
            .single();

          if (currentDiscount) {
            const { error: discountError } = await supabase
              .from('discount_codes')
              .update({
                usage_count: (currentDiscount.usage_count || 0) + 1,
                last_used_at: new Date().toISOString(),
              })
              .eq('code', discountCode);

            if (discountError) {
              console.error('Error updating discount code usage:', discountError);
            } else {
              console.log(`Updated usage count for discount code: ${discountCode}`);
            }
          }
        }

        console.log(`Successfully granted ${credits} credits to user ${userId}`);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;

        // Update purchase status to failed
        const { error } = await supabase
          .from('purchases')
          .update({
            status: 'failed',
          })
          .eq('stripe_payment_intent_id', paymentIntent.id);

        if (error) {
          console.error('Error updating failed purchase:', error);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}