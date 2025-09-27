import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

// Updated: 2025-09-25 - Fix for production deployment

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
      const debugInfo = {
        designId: id,
        userId: user.id,
        designExists: !!designExists,
        designOwnerId: designExists?.user_id,
        isActive: designExists?.is_active,
        errorCode: designError?.code,
        errorMessage: designError?.message,
        timestamp: new Date().toISOString()
      };

      console.error('Design not found with filters:', {
        designId: id,
        userId: user.id,
        error: designError,
        designExistsData: designExists,
        fullDebugInfo: debugInfo
      });

      // More detailed error message based on what we found
      let errorMessage = 'Design not found';
      if (designExists && designExists.user_id !== user.id) {
        errorMessage = 'Design belongs to different user';
      } else if (designExists && !designExists.is_active) {
        errorMessage = 'Design has been deleted';
      } else if (!designExists) {
        errorMessage = 'Design does not exist in database';
      }

      return NextResponse.json(
        {
          error: errorMessage,
          debug: debugInfo
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

    const { id } = await params;
    const serviceSupabase = createServiceRoleClient();

    // First, get the design to check ownership and get slice paths for cleanup
    const { data: design, error: fetchError } = await serviceSupabase
      .from('edge_designs')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (fetchError || !design) {
      return NextResponse.json(
        { error: 'Design not found or access denied' },
        { status: 404 }
      );
    }

    console.log(`Deleting design: ${design.name} (ID: ${id}) for user: ${user.id}`);

    // Clean up stored slice files from storage if they exist
    if (design.slice_storage_paths && typeof design.slice_storage_paths === 'object') {
      console.log('Cleaning up stored slice files...');
      try {
        const slicePaths = design.slice_storage_paths;
        const filesToDelete: string[] = [];

        // Safely collect all slice file paths with null checks
        if (slicePaths.side?.raw && Array.isArray(slicePaths.side.raw)) {
          filesToDelete.push(...slicePaths.side.raw);
        }
        if (slicePaths.side?.masked && Array.isArray(slicePaths.side.masked)) {
          filesToDelete.push(...slicePaths.side.masked);
        }
        if (slicePaths.top?.raw && Array.isArray(slicePaths.top.raw)) {
          filesToDelete.push(...slicePaths.top.raw);
        }
        if (slicePaths.top?.masked && Array.isArray(slicePaths.top.masked)) {
          filesToDelete.push(...slicePaths.top.masked);
        }
        if (slicePaths.bottom?.raw && Array.isArray(slicePaths.bottom.raw)) {
          filesToDelete.push(...slicePaths.bottom.raw);
        }
        if (slicePaths.bottom?.masked && Array.isArray(slicePaths.bottom.masked)) {
          filesToDelete.push(...slicePaths.bottom.masked);
        }

        if (filesToDelete.length > 0) {
          console.log(`Deleting ${filesToDelete.length} slice files from storage`);
          const { error: storageError } = await serviceSupabase.storage
            .from('edge-images')
            .remove(filesToDelete);

          if (storageError) {
            console.error('Error cleaning up slice files:', storageError);
            // Don't fail the delete operation if slice cleanup fails
          } else {
            console.log('Successfully cleaned up slice files');
          }
        }
      } catch (cleanupError) {
        console.error('Error during slice cleanup:', cleanupError);
        // Continue with the design deletion even if cleanup fails
      }
    }

    // Also clean up the main design images
    try {
      const imagesToDelete: string[] = [];
      if (design.side_image_path) imagesToDelete.push(design.side_image_path);
      if (design.top_image_path) imagesToDelete.push(design.top_image_path);
      if (design.bottom_image_path) imagesToDelete.push(design.bottom_image_path);

      if (imagesToDelete.length > 0) {
        console.log(`Deleting ${imagesToDelete.length} main design images from storage`);
        const { error: mainImagesError } = await serviceSupabase.storage
          .from('edge-images')
          .remove(imagesToDelete);

        if (mainImagesError) {
          console.error('Error cleaning up main images:', mainImagesError);
          // Don't fail the delete operation if image cleanup fails
        } else {
          console.log('Successfully cleaned up main design images');
        }
      }
    } catch (imageCleanupError) {
      console.error('Error during main image cleanup:', imageCleanupError);
      // Continue with the design deletion even if cleanup fails
    }

    // Soft delete by setting is_active to false
    const { error: deleteError } = await serviceSupabase
      .from('edge_designs')
      .update({ is_active: false })
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteError) {
      throw deleteError;
    }

    console.log(`Successfully deleted design: ${design.name}`);
    return NextResponse.json({ success: true, message: 'Design deleted successfully' });

  } catch (error) {
    console.error('Edge design deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete edge design' },
      { status: 500 }
    );
  }
}