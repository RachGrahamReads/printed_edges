import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

// POST: Get signed URL for edge design image (secure, user-specific access)
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { imagePath } = await req.json();

    if (!imagePath) {
      return NextResponse.json(
        { error: 'Image path is required' },
        { status: 400 }
      );
    }

    // Verify that the image path belongs to the authenticated user
    // Expected format: users/{user_id}/designs/{design_id}/original/{type}.png
    const expectedUserPath = `users/${user.id}/`;
    if (!imagePath.startsWith(expectedUserPath)) {
      console.error(`Access denied: User ${user.id} tried to access ${imagePath}`);
      return NextResponse.json(
        { error: 'Access denied: You can only access your own images' },
        { status: 403 }
      );
    }

    // Additional verification: check if the design belongs to the user by matching the image path
    const serviceSupabase = createServiceRoleClient();
    const { data: design, error: designError } = await serviceSupabase
      .from('edge_designs')
      .select('id, side_image_path, top_image_path, bottom_image_path')
      .eq('user_id', user.id)
      .or(`side_image_path.eq.${imagePath},top_image_path.eq.${imagePath},bottom_image_path.eq.${imagePath}`);

    if (designError || !design || design.length === 0) {
      console.error(`Design verification failed for user ${user.id}, image path ${imagePath}:`, designError);
      return NextResponse.json(
        { error: 'Access denied: Image not found or not owned by user' },
        { status: 403 }
      );
    }

    console.log(`Design verification successful for user ${user.id}, design ${design[0].id}`);

    console.log(`Creating secure signed URL for user ${user.id}: ${imagePath}`);

    // Create signed URL using the same service role client
    const { data, error } = await serviceSupabase.storage
      .from('edge-images')
      .createSignedUrl(imagePath, 60 * 60); // 1 hour expiry

    if (error) {
      console.error('Error creating signed URL:', error);
      return NextResponse.json(
        { error: 'Failed to create signed URL', details: error.message },
        { status: 500 }
      );
    }

    console.log(`Signed URL created successfully for user ${user.id}`);
    return NextResponse.json({
      signedUrl: data.signedUrl
    });

  } catch (error) {
    console.error('Error in get-image-url API:', error);
    return NextResponse.json(
      { error: 'Failed to get image URL' },
      { status: 500 }
    );
  }
}