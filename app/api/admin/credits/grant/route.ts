import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin';

export async function POST(req: NextRequest) {
  try {
    // Check admin access
    const adminUser = await requireAdmin();

    const body = await req.json();
    const { userId, credits, reason } = body;

    if (!userId || typeof credits !== 'number' || credits <= 0) {
      return NextResponse.json(
        { error: 'Invalid request: userId and positive credits required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Use the admin function to grant credits
    const { error } = await supabase.rpc('admin_grant_credits', {
      p_user_id: userId,
      p_credits: credits,
      p_admin_id: adminUser.id,
    });

    if (error) {
      console.error('Error granting credits:', error);
      throw error;
    }

    // Get updated user credits for response
    const { data: updatedCredits, error: creditsError } = await supabase
      .from('user_credits')
      .select('total_credits, used_credits')
      .eq('user_id', userId)
      .single();

    if (creditsError) {
      console.error('Error fetching updated credits:', creditsError);
    }

    console.log(`Admin ${adminUser.email} granted ${credits} credits to user ${userId}${reason ? ` (${reason})` : ''}`);

    return NextResponse.json({
      success: true,
      message: `Successfully granted ${credits} credits`,
      credits: updatedCredits,
    });
  } catch (error: any) {
    console.error('Admin grant credits API error:', error);

    if (error.message.includes('Unauthorized') || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message.includes('Unauthorized') ? 401 : 403 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to grant credits' },
      { status: 500 }
    );
  }
}