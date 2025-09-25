import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    console.log('Dashboard API: Starting request processing');

    // Use regular client for authentication
    const supabase = await createClient();
    console.log('Dashboard API: Supabase client created');

    // Get authenticated user
    console.log('Dashboard API: Getting user authentication');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    console.log('Dashboard API: Auth result:', {
      hasUser: !!user,
      userId: user?.id,
      authErrorCode: authError?.code,
      authErrorMessage: authError?.message
    });

    if (authError || !user) {
      console.log('Dashboard API: Authentication failed', {
        authError: {
          code: authError?.code,
          message: authError?.message,
          status: authError?.status
        },
        hasUser: !!user
      });
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

    console.log('Dashboard API: User authenticated:', user.id);

    // Get user profile data from public.users table using regular client
    // Since the user is authenticated, RLS should allow access to their own data
    const { data: userProfile, error: userProfileError } = await supabase
      .from('users')
      .select('first_name, surname, name, email')
      .eq('id', user.id)
      .single();

    if (userProfileError) {
      console.log('User profile not found in public.users, using auth data:', userProfileError);
    }

    // Get user credits with detailed error handling
    const { data: creditsData, error: creditsError } = await supabase
      .from('user_credits')
      .select('total_credits, used_credits, created_at, updated_at')
      .eq('user_id', user.id)
      .single();

    if (creditsError) {
      console.error('Credits fetch error - DETAILED:', {
        code: creditsError.code,
        message: creditsError.message,
        details: creditsError.details,
        hint: creditsError.hint,
        fullError: JSON.stringify(creditsError, null, 2)
      });
      console.error('User ID:', user.id);
      console.error('Query attempted: SELECT total_credits, used_credits, created_at, updated_at FROM user_credits WHERE user_id =', user.id);

      // If no credits record exists, create one
      if (creditsError.code === 'PGRST116' || creditsError.message.includes('No rows') || creditsError.message.includes('not found')) {
        console.log('Creating initial credits record for user:', user.id);

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
          console.error('Error creating credits record - DETAILED:', {
            code: insertError.code,
            message: insertError.message,
            details: insertError.details,
            hint: insertError.hint,
            fullError: JSON.stringify(insertError, null, 2)
          });

          // If insert fails, return a default credits object instead of erroring
          console.log('Using default credits fallback for user:', user.id);
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
              surname: userProfile?.surname || user.user_metadata?.surname,
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
    const { data: designsData, error: designsError } = await supabase
      .from('edge_designs')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (designsError) {
      console.error('Designs fetch error:', designsError);
    }

    // Get processing jobs count
    const { data: jobsData, error: jobsError } = await supabase
      .from('processing_jobs')
      .select('id')
      .eq('user_id', user.id);

    if (jobsError) {
      console.error('Jobs fetch error:', jobsError);
    }

    // Get recent purchases
    const { data: purchasesData, error: purchasesError } = await supabase
      .from('purchases')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (purchasesError) {
      console.error('Purchases fetch error:', purchasesError);
    }

    return NextResponse.json({
      credits: creditsData,
      user: {
        id: user.id,
        email: userProfile?.email || user.email,
        first_name: userProfile?.first_name || user.user_metadata?.first_name,
        surname: userProfile?.surname || user.user_metadata?.surname,
        name: userProfile?.name || user.user_metadata?.full_name,
        created_at: user.created_at
      },
      stats: {
        edgeDesigns: designsData?.length || 0,
        processingJobs: jobsData?.length || 0,
        recentPurchases: purchasesData || []
      }
    });

  } catch (error) {
    console.error('Dashboard API error (detailed):', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      error: error
    });
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}