import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

// GET: Fetch a specific edge design
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log('=== EDGE DESIGNS API DEBUG ===');
    console.log('Requested design ID:', id);

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    console.log('Auth result:', {
      hasUser: !!user,
      userId: user?.id,
      authError: authError?.message
    });

    if (authError || !user) {
      console.log('Authentication failed, returning 401');
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    console.log('Fetching design with ID:', id, 'for user:', user.id);

    const serviceSupabase = createServiceRoleClient();

    // First, let's check if the design exists at all (without user_id filter)
    const { data: designExists, error: existsError } = await serviceSupabase
      .from('edge_designs')
      .select('id, user_id, is_active')
      .eq('id', id)
      .single();

    console.log('Design existence check:', {
      exists: !!designExists,
      designData: designExists,
      error: existsError
    });

    // Now try the full query with all filters
    const { data: design, error: designError } = await serviceSupabase
      .from('edge_designs')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    console.log('Full design query result:', {
      design: design ? { id: design.id, name: design.name, user_id: design.user_id, is_active: design.is_active } : null,
      error: designError
    });

    if (designError || !design) {
      console.error('Design not found with filters:', {
        designId: id,
        userId: user.id,
        error: designError,
        designExistsData: designExists
      });
      return NextResponse.json(
        {
          error: 'Design not found or access denied',
          debug: {
            designId: id,
            userId: user.id,
            designExists: !!designExists,
            designOwnerId: designExists?.user_id,
            isActive: designExists?.is_active
          }
        },
        { status: 404 }
      );
    }

    console.log('Successfully found design, returning data');
    return NextResponse.json({ design });

  } catch (error) {
    console.error('Error fetching design:', error);
    return NextResponse.json(
      { error: 'Failed to fetch design' },
      { status: 500 }
    );
  }
}

// DELETE: Remove edge design
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Await params as required by Next.js 15
    const { id } = await params;

    const serviceSupabase = createServiceRoleClient();

    // Soft delete by setting is_active to false
    const { error: deleteError } = await serviceSupabase
      .from('edge_designs')
      .update({ is_active: false })
      .eq('id', id)
      .eq('user_id', user.id); // Ensure user can only delete their own designs

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Edge design deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete edge design' },
      { status: 500 }
    );
  }
}