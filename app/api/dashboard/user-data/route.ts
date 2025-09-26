import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    // Use regular client for authentication
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          error: 'Authentication required',
          details: authError ? {
            code: authError.code,
            message: authError.message
          } : 'No user session found'
        },
        { status: 401 }
      );
    }

    // Get user profile data from public.users table using regular client
    // Since the user is authenticated, RLS should allow access to their own data
    const { data: userProfile, error: userProfileError } = await supabase
      .from('users')
      .select('first_name, last_name, name, email')
      .eq('id', user.id)
      .single();

    // Get user credits
    const { data: creditsData, error: creditsError } = await supabase
      .from('user_credits')
      .select('total_credits, used_credits, created_at, updated_at')
      .eq('user_id', user.id)
      .single();

    if (creditsError) {

      // If no credits record exists, create one
      if (creditsError.code === 'PGRST116' || creditsError.message.includes('No rows') || creditsError.message.includes('not found')) {
        const { data: newCreditsData, error: insertError } = await supabase
          .from('user_credits')
          .insert({
            user_id: user.id,
            total_credits: 0,
            used_credits: 0
          })
          .select('total_credits, used_credits, created_at, updated_at')
          .single();

        if (insertError) {
          // If insert fails, return a default credits object instead of erroring
          return NextResponse.json({
            credits: {
              total_credits: 0,
              used_credits: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            },
            user: {
              id: user.id,
              email: userProfile?.email || user.email,
              first_name: userProfile?.first_name || user.user_metadata?.first_name,
              last_name: userProfile?.last_name || user.user_metadata?.surname,
              name: userProfile?.name || user.user_metadata?.full_name,
              created_at: user.created_at
            },
            stats: {
              edgeDesigns: 0,
              processingJobs: 0,
              recentPurchases: []
            }
          });
        }

        return NextResponse.json({
          credits: newCreditsData,
          user: {
            id: user.id,
            email: user.email,
            created_at: user.created_at
          }
        });
      }

      return NextResponse.json(
        { error: 'Failed to fetch credits', details: creditsError },
        { status: 500 }
      );
    }

    // Get edge designs count
    const { data: designsData } = await supabase
      .from('edge_designs')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true);

    // Get processing jobs count
    const { data: jobsData } = await supabase
      .from('processing_jobs')
      .select('id')
      .eq('user_id', user.id);

    // Get recent purchases
    const { data: purchasesData } = await supabase
      .from('purchases')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    const responseData = {
      credits: creditsData,
      user: {
        id: user.id,
        email: userProfile?.email || user.email,
        first_name: userProfile?.first_name || user.user_metadata?.first_name,
        last_name: userProfile?.last_name || user.user_metadata?.surname,
        name: userProfile?.name || user.user_metadata?.full_name,
        created_at: user.created_at
      },
      stats: {
        edgeDesigns: designsData?.length || 0,
        processingJobs: jobsData?.length || 0,
        recentPurchases: purchasesData || []
      }
    };

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Dashboard API error:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}