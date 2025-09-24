import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export async function GET(req: NextRequest) {
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

    // Get user credits (lightweight query - only credits data)
    const { data: creditsData, error: creditsError } = await serviceSupabase
      .from('user_credits')
      .select('total_credits, used_credits')
      .eq('user_id', user.id)
      .single();

    if (creditsError) {
      // If no credits record exists, return default values
      if (creditsError.code === 'PGRST116' || creditsError.message.includes('No rows')) {
        return NextResponse.json({
          hasCredits: false,
          availableCredits: 0,
          totalCredits: 0,
          usedCredits: 0
        });
      }

      throw creditsError;
    }

    const availableCredits = creditsData.total_credits - creditsData.used_credits;

    return NextResponse.json({
      hasCredits: availableCredits > 0,
      availableCredits,
      totalCredits: creditsData.total_credits,
      usedCredits: creditsData.used_credits
    });

  } catch (error) {
    console.error('Credits check error:', error);
    return NextResponse.json(
      { error: 'Failed to check credits' },
      { status: 500 }
    );
  }
}