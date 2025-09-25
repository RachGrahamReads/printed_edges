import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Discount code is required' },
        { status: 400 }
      );
    }

    // First try to find it as a promotion code (case-insensitive)
    try {
      const promotionCodes = await stripe.promotionCodes.list({
        code: code.toUpperCase(), // Stripe promotion codes are case-insensitive
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

        return NextResponse.json({
          code: promoCode.code,
          discountType: coupon.percent_off ? 'percentage' : 'fixed_amount',
          discountValue: coupon.percent_off || (coupon.amount_off ? coupon.amount_off / 100 : 0),
          couponId: coupon.id,
          promoCodeId: promoCode.id,
        });
      }

      // If no promotion code found, try as a coupon ID (for backward compatibility)
      const coupon = await stripe.coupons.retrieve(code.toLowerCase());

      // Check if coupon is valid
      if (!coupon.valid) {
        return NextResponse.json(
          { error: 'Discount code is no longer valid' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        code: code.toUpperCase(),
        discountType: coupon.percent_off ? 'percentage' : 'fixed_amount',
        discountValue: coupon.percent_off || (coupon.amount_off ? coupon.amount_off / 100 : 0),
        couponId: coupon.id,
      });
    } catch (stripeError: any) {
      // If neither promotion code nor coupon exists, it's invalid
      return NextResponse.json(
        { error: 'Invalid discount code' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Error validating discount code:', error);
    return NextResponse.json(
      { error: 'Failed to validate discount code' },
      { status: 500 }
    );
  }
}