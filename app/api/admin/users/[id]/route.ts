import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check admin access
    await requireAdmin();

    const supabase = await createClient();
    const userId = params.id;

    // Get user details
    const { data: user, error: userError } = await supabase
      .from('admin_user_overview')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('Error fetching user:', userError);
      throw userError;
    }

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get user's purchases (handle gracefully if table is empty or has issues)
    let purchases = [];
    try {
      const { data: purchaseData, error: purchasesError } = await supabase
        .from('purchases')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (purchasesError) {
        console.error('Error fetching purchases:', purchasesError);
        // Continue with empty array instead of failing
      } else {
        purchases = purchaseData || [];
      }
    } catch (error) {
      console.error('Failed to fetch purchases:', error);
      purchases = [];
    }

    // Get user's processing jobs (handle gracefully if table is empty or has issues)
    let jobs = [];
    try {
      const { data: jobData, error: jobsError } = await supabase
        .from('processing_jobs')
        .select(`
          *,
          edge_designs (
            name
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (jobsError) {
        console.error('Error fetching jobs:', jobsError);
        // Continue with empty array instead of failing
      } else {
        jobs = jobData || [];
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
      jobs = [];
    }

    // Get user's edge designs (handle gracefully if table is empty or has issues)
    let edgeDesigns = [];
    try {
      const { data: designData, error: edgeDesignsError } = await supabase
        .from('edge_designs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (edgeDesignsError) {
        console.error('Error fetching edge designs:', edgeDesignsError);
        // Continue with empty array instead of failing
      } else {
        edgeDesigns = designData || [];
      }
    } catch (error) {
      console.error('Failed to fetch edge designs:', error);
      edgeDesigns = [];
    }

    return NextResponse.json({
      user,
      purchases,
      jobs,
      edgeDesigns,
    });
  } catch (error: any) {
    console.error('Admin user details API error:', error);

    if (error.message.includes('Unauthorized') || error.message.includes('Forbidden')) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message.includes('Unauthorized') ? 401 : 403 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch user details' },
      { status: 500 }
    );
  }
}