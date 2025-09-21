import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { code } = await req.json();

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Discount code is required' },
        { status: 400 }
      );
    }

    // Check if discount code exists and is valid
    const { data: discountCode, error } = await supabase
      .from('discount_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .single();

    if (error || !discountCode) {
      return NextResponse.json(
        { error: 'Invalid discount code' },
        { status: 404 }
      );
    }

    // Check if code has expired
    if (discountCode.expires_at && new Date(discountCode.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Discount code has expired' },
        { status: 400 }
      );
    }

    // Check if usage limit is reached
    if (discountCode.usage_limit && discountCode.usage_count >= discountCode.usage_limit) {
      return NextResponse.json(
        { error: 'Discount code usage limit reached' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      code: discountCode.code,
      discountType: discountCode.discount_type,
      discountValue: discountCode.discount_value,
      couponId: discountCode.stripe_coupon_id,
    });
  } catch (error) {
    console.error('Error validating discount code:', error);
    return NextResponse.json(
      { error: 'Failed to validate discount code' },
      { status: 500 }
    );
  }
}