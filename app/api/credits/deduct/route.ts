import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export async function POST(req: NextRequest) {
  try {
    // Use regular client for authentication
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Use service role client for database operations
    const serviceSupabase = createServiceRoleClient();

    // Get current credits
    const { data: creditsData, error: creditsError } = await serviceSupabase
      .from('user_credits')
      .select('total_credits, used_credits')
      .eq('user_id', user.id)
      .single();

    if (creditsError) {
      return NextResponse.json(
        { error: 'Failed to fetch credits' },
        { status: 500 }
      );
    }

    const availableCredits = creditsData.total_credits - creditsData.used_credits;

    // Check if user has credits to deduct
    if (availableCredits <= 0) {
      return NextResponse.json(
        { error: 'No credits available to deduct' },
        { status: 400 }
      );
    }

    // Deduct one credit
    const { data: updatedCredits, error: updateError } = await serviceSupabase
      .from('user_credits')
      .update({
        used_credits: creditsData.used_credits + 1,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .select('total_credits, used_credits')
      .single();

    if (updateError) {
      throw updateError;
    }

    const newAvailableCredits = updatedCredits.total_credits - updatedCredits.used_credits;

    return NextResponse.json({
      success: true,
      creditsDeducted: 1,
      remainingCredits: newAvailableCredits,
      totalCredits: updatedCredits.total_credits,
      usedCredits: updatedCredits.used_credits
    });

  } catch (error) {
    console.error('Credits deduction error:', error);
    return NextResponse.json(
      { error: 'Failed to deduct credits' },
      { status: 500 }
    );
  }
}