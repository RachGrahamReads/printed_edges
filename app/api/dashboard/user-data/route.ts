import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

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

    // Use service role client for database operations (bypasses RLS)
    let serviceSupabase;
    try {
      console.log('Dashboard API: Creating service role client...');
      serviceSupabase = createServiceRoleClient();
      console.log('Dashboard API: Service role client created successfully');
    } catch (serviceError) {
      console.error('Dashboard API: Failed to create service role client:', {
        error: serviceError instanceof Error ? serviceError.message : 'Unknown error',
        stack: serviceError instanceof Error ? serviceError.stack : undefined,
        env_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        has_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      });
      return NextResponse.json(
        { error: 'Failed to initialize database client', details: serviceError instanceof Error ? serviceError.message : 'Unknown error' },
        { status: 500 }
      );
    }

    // Get user credits with detailed error handling
    const { data: creditsData, error: creditsError } = await serviceSupabase
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

        const { data: newCreditsData, error: insertError } = await serviceSupabase
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
              email: user.email,
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
    const { data: designsData, error: designsError } = await serviceSupabase
      .from('edge_designs')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (designsError) {
      console.error('Designs fetch error:', designsError);
    }

    // Get processing jobs count
    const { data: jobsData, error: jobsError } = await serviceSupabase
      .from('processing_jobs')
      .select('id')
      .eq('user_id', user.id);

    if (jobsError) {
      console.error('Jobs fetch error:', jobsError);
    }

    // Get recent purchases
    const { data: purchasesData, error: purchasesError } = await serviceSupabase
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
        email: user.email,
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