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

    // Validate discount code if provided
    let discountCouponId = null;
    let discountCodeData = null;

    if (discountCode) {
      const { data: discount, error: discountError } = await supabase
        .from('discount_codes')
        .select('*')
        .eq('code', discountCode.toUpperCase())
        .eq('is_active', true)
        .single();

      if (discountError || !discount) {
        return NextResponse.json(
          { error: 'Invalid discount code' },
          { status: 400 }
        );
      }

      // Check if code has expired
      if (discount.expires_at && new Date(discount.expires_at) < new Date()) {
        return NextResponse.json(
          { error: 'Discount code has expired' },
          { status: 400 }
        );
      }

      // Check if usage limit is reached
      if (discount.usage_limit && discount.usage_count >= discount.usage_limit) {
        return NextResponse.json(
          { error: 'Discount code usage limit reached' },
          { status: 400 }
        );
      }

      discountCouponId = discount.stripe_coupon_id;
      discountCodeData = discount;
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
          price_data: {
            currency: 'usd',
            product_data: {
              name: product.name,
              description: `Get ${product.credits} edge design credit${product.credits > 1 ? 's' : ''} to create stunning custom edges for your books`,
            },
            unit_amount: product.price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.get('origin')}/dashboard?payment=success&credits=${product.credits}`,
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
        amount: product.price,
        purchase_type: purchaseType,
        credits_granted: product.credits,
        status: 'pending',
        discount_code: discountCode || null,
        discount_amount: discountCodeData ? (
          discountCodeData.discount_type === 'percentage'
            ? Math.round(product.price * discountCodeData.discount_value / 100)
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