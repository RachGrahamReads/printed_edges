import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin';
import { stripe } from '@/lib/stripe';

export async function GET(req: NextRequest) {
  try {
    // Check admin access
    await requireAdmin();

    const supabase = await createClient();

    // Get all discount codes
    const { data: discountCodes, error } = await supabase
      .from('discount_codes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching discount codes:', error);
      throw error;
    }

    return NextResponse.json({
      discountCodes: discountCodes || [],
    });
  } catch (error: any) {
    console.error('Admin discount codes API error:', error);

    if (error.message.includes('Unauthorized') || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message.includes('Unauthorized') ? 401 : 403 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch discount codes' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // Check admin access
    const adminUser = await requireAdmin();

    const body = await req.json();
    const {
      code,
      name,
      description,
      discountType,
      discountValue,
      usageLimit,
      expiresAt,
    } = body;

    // Validate input
    if (!code || !name || !discountType || !discountValue) {
      return NextResponse.json(
        { error: 'Missing required fields: code, name, discountType, discountValue' },
        { status: 400 }
      );
    }

    if (discountType === 'percentage' && (discountValue < 1 || discountValue > 100)) {
      return NextResponse.json(
        { error: 'Percentage discount must be between 1 and 100' },
        { status: 400 }
      );
    }

    if (discountType === 'fixed_amount' && discountValue < 1) {
      return NextResponse.json(
        { error: 'Fixed amount discount must be greater than 0' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check if code already exists
    const { data: existingCode } = await supabase
      .from('discount_codes')
      .select('id')
      .eq('code', code.toUpperCase())
      .single();

    if (existingCode) {
      return NextResponse.json(
        { error: 'Discount code already exists' },
        { status: 400 }
      );
    }

    // Create Stripe coupon
    const stripeCouponData: any = {
      id: code.toLowerCase().replace(/[^a-z0-9]/g, ''),
      name: name,
      metadata: {
        created_by: adminUser.email,
        internal_code: code,
      },
    };

    if (discountType === 'percentage') {
      stripeCouponData.percent_off = discountValue;
    } else {
      stripeCouponData.amount_off = discountValue; // Amount in cents
      stripeCouponData.currency = 'usd';
    }

    if (usageLimit) {
      stripeCouponData.max_redemptions = usageLimit;
    }

    if (expiresAt) {
      stripeCouponData.redeem_by = Math.floor(new Date(expiresAt).getTime() / 1000);
    }

    let stripeCoupon;
    try {
      stripeCoupon = await stripe.coupons.create(stripeCouponData);
    } catch (stripeError: any) {
      console.error('Error creating Stripe coupon:', stripeError);
      return NextResponse.json(
        { error: `Failed to create Stripe coupon: ${stripeError.message}` },
        { status: 400 }
      );
    }

    // Create discount code in database using the function
    const { data: discountCode, error: dbError } = await supabase.rpc('create_discount_code', {
      p_code: code.toUpperCase(),
      p_name: name,
      p_description: description || '',
      p_discount_type: discountType,
      p_discount_value: discountValue,
      p_usage_limit: usageLimit || null,
      p_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      p_admin_id: adminUser.id,
    });

    if (dbError) {
      // If database creation fails, delete the Stripe coupon
      try {
        await stripe.coupons.del(stripeCoupon.id);
      } catch (cleanupError) {
        console.error('Error cleaning up Stripe coupon:', cleanupError);
      }

      console.error('Error creating discount code:', dbError);
      throw dbError;
    }

    // Update the record with the Stripe coupon ID
    const { error: updateError } = await supabase
      .from('discount_codes')
      .update({ stripe_coupon_id: stripeCoupon.id })
      .eq('id', discountCode);

    if (updateError) {
      console.error('Error updating discount code with Stripe ID:', updateError);
    }

    // Fetch the created discount code
    const { data: createdCode } = await supabase
      .from('discount_codes')
      .select('*')
      .eq('id', discountCode)
      .single();

    return NextResponse.json({
      success: true,
      discountCode: createdCode,
      stripeCoupon: {
        id: stripeCoupon.id,
        name: stripeCoupon.name,
        percent_off: stripeCoupon.percent_off,
        amount_off: stripeCoupon.amount_off,
      },
    });
  } catch (error: any) {
    console.error('Admin create discount code API error:', error);

    if (error.message.includes('Unauthorized') || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message.includes('Unauthorized') ? 401 : 403 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create discount code' },
      { status: 500 }
    );
  }
}