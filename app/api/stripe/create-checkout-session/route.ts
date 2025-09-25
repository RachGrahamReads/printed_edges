import { NextRequest, NextResponse } from 'next/server';
import { stripe, PRODUCTS } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { purchaseType, discountCode } = await req.json();

    // Validate purchase type
    if (!['single_image', 'three_images'].includes(purchaseType)) {
      return NextResponse.json(
        { error: 'Invalid purchase type' },
        { status: 400 }
      );
    }

    const product = purchaseType === 'single_image' ? PRODUCTS.SINGLE_IMAGE : PRODUCTS.THREE_IMAGES;

    // Get price details from Stripe
    const priceData = await stripe.prices.retrieve(product.priceId);
    const productAmount = priceData.unit_amount || 0;

    // Validate discount code if provided - using Stripe-only validation
    let discountCouponId = null;
    let discountCodeData = null;

    if (discountCode) {
      try {
        // Try to retrieve the coupon directly from Stripe
        const coupon = await stripe.coupons.retrieve(discountCode.toLowerCase());

        // Check if coupon is valid (not deleted and not redeemed beyond limits)
        if (coupon.valid) {
          discountCouponId = coupon.id;
          // Store basic info for purchase record
          discountCodeData = {
            discount_type: coupon.percent_off ? 'percentage' : 'fixed_amount',
            discount_value: coupon.percent_off || coupon.amount_off || 0,
            code: discountCode.toUpperCase()
          };
        } else {
          return NextResponse.json(
            { error: 'Discount code is no longer valid' },
            { status: 400 }
          );
        }
      } catch (error: any) {
        // If coupon doesn't exist in Stripe, it's invalid
        return NextResponse.json(
          { error: 'Invalid discount code' },
          { status: 400 }
        );
      }
    }

    // Get or create Stripe customer
    let stripeCustomerId = null;

    // Check if user already has a Stripe customer ID
    const { data: userData } = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (userData?.stripe_customer_id) {
      stripeCustomerId = userData.stripe_customer_id;
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });

      stripeCustomerId = customer.id;

      // Save Stripe customer ID to database
      await supabase
        .from('users')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', user.id);
    }

    // Create Stripe checkout session
    const sessionConfig: any = {
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: product.priceId,
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.get('origin')}/dashboard?payment=success&credits=${product.credits}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get('origin')}/pricing?payment=cancelled`,
      metadata: {
        user_id: user.id,
        purchase_type: purchaseType,
        credits: product.credits.toString(),
        discount_code: discountCode || '',
      },
    };

    // Apply discount coupon if provided
    if (discountCouponId) {
      sessionConfig.discounts = [
        {
          coupon: discountCouponId,
        },
      ];
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    // Create pending purchase record
    await supabase
      .from('purchases')
      .insert({
        user_id: user.id,
        stripe_session_id: session.id,
        amount: productAmount,
        purchase_type: purchaseType,
        credits_granted: product.credits,
        status: 'pending',
        discount_code: discountCode || null,
        discount_amount: discountCodeData ? (
          discountCodeData.discount_type === 'percentage'
            ? Math.round(productAmount * discountCodeData.discount_value / 100)
            : discountCodeData.discount_value
        ) : null,
      });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}