import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
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

    const { newName } = await req.json();

    if (!newName || typeof newName !== 'string' || !newName.trim()) {
      return NextResponse.json(
        { error: 'Valid design name is required' },
        { status: 400 }
      );
    }

    // Handle both async and sync params for Next.js compatibility
    const params = context.params;
    const { id } = params instanceof Promise ? await params : params;

    const serviceSupabase = createServiceRoleClient();

    // Verify the design belongs to the user
    const { data: existingDesign, error: fetchError } = await serviceSupabase
      .from('edge_designs')
      .select('user_id, name')
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (fetchError || !existingDesign) {
      return NextResponse.json(
        { error: 'Design not found or access denied' },
        { status: 404 }
      );
    }

    // Update the design name (removed updated_at since column doesn't exist)
    const { data: updatedDesign, error: updateError } = await serviceSupabase
      .from('edge_designs')
      .update({
        name: newName.trim()
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating design name:', updateError);
      return NextResponse.json(
        { error: 'Failed to update design name' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      design: updatedDesign
    });

  } catch (error) {
    console.error('Error renaming design:', error);
    return NextResponse.json(
      { error: 'Failed to rename design' },
      { status: 500 }
    );
  }
}