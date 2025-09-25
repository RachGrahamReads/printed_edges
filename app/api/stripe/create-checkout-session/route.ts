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

    // Validate discount code if provided - using Stripe Promotion Code/Coupon validation
    let discountCouponId = null;
    let discountCodeData = null;

    if (discountCode) {
      try {
        // First try to find it as a promotion code (case-insensitive)
        const promotionCodes = await stripe.promotionCodes.list({
          code: discountCode.toUpperCase(),
          limit: 1,
        });

        if (promotionCodes.data.length > 0) {
          const promoCode = promotionCodes.data[0];
          const coupon = promoCode.coupon;

          // Check if promotion code is active
          if (!promoCode.active) {
            return NextResponse.json(
              { error: 'Discount code is no longer active' },
              { status: 400 }
            );
          }

          // Check if coupon is valid
          if (!coupon.valid) {
            return NextResponse.json(
              { error: 'Discount code is no longer valid' },
              { status: 400 }
            );
          }

          discountCouponId = coupon.id;
          discountCodeData = {
            discount_type: coupon.percent_off ? 'percentage' : 'fixed_amount',
            discount_value: coupon.percent_off || (coupon.amount_off ? coupon.amount_off / 100 : 0),
            code: promoCode.code
          };
        } else {
          // If no promotion code found, try as a coupon ID (for backward compatibility)
          const coupon = await stripe.coupons.retrieve(discountCode.toLowerCase());

          // Check if coupon is valid
          if (!coupon.valid) {
            return NextResponse.json(
              { error: 'Discount code is no longer valid' },
              { status: 400 }
            );
          }

          discountCouponId = coupon.id;
          discountCodeData = {
            discount_type: coupon.percent_off ? 'percentage' : 'fixed_amount',
            discount_value: coupon.percent_off || (coupon.amount_off ? coupon.amount_off / 100 : 0),
            code: discountCode.toUpperCase()
          };
        }
      } catch (error: any) {
        // If neither promotion code nor coupon exists, it's invalid
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
            : Math.round(discountCodeData.discount_value * 100) // Convert dollars to cents
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