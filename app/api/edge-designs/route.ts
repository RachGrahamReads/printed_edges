import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

// GET: Fetch user's edge designs
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const serviceSupabase = createServiceRoleClient();

    const { data: designs, error: designsError } = await serviceSupabase
      .from('edge_designs')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (designsError) {
      throw designsError;
    }

    return NextResponse.json({ designs });

  } catch (error) {
    console.error('Edge designs fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch edge designs' },
      { status: 500 }
    );
  }
}

// POST: Create new edge design
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

    const { name, sideImagePath, topImagePath, bottomImagePath, topEdgeColor, bottomEdgeColor, edgeFiles } = await req.json();

    if (!name) {
      return NextResponse.json(
        { error: 'Design name is required' },
        { status: 400 }
      );
    }

    const serviceSupabase = createServiceRoleClient();

    // Upload edge images to user-specific storage if provided
    let finalSideImagePath = sideImagePath;
    let finalTopImagePath = topImagePath;
    let finalBottomImagePath = bottomImagePath;

    if (edgeFiles) {
      const designId = crypto.randomUUID();
      const basePath = `users/${user.id}/designs/${designId}`;

      // Upload images to user-specific paths
      if (edgeFiles.side) {
        const sideBuffer = Buffer.from(edgeFiles.side, 'base64');
        const { error: sideUploadError } = await serviceSupabase.storage
          .from('edge-images')
          .upload(`${basePath}/original/side.png`, sideBuffer, {
            contentType: 'image/png',
            upsert: true
          });

        if (!sideUploadError) {
          finalSideImagePath = `${basePath}/original/side.png`;
        }
      }

      if (edgeFiles.top) {
        const topBuffer = Buffer.from(edgeFiles.top, 'base64');
        const { error: topUploadError } = await serviceSupabase.storage
          .from('edge-images')
          .upload(`${basePath}/original/top.png`, topBuffer, {
            contentType: 'image/png',
            upsert: true
          });

        if (!topUploadError) {
          finalTopImagePath = `${basePath}/original/top.png`;
        }
      }

      if (edgeFiles.bottom) {
        const bottomBuffer = Buffer.from(edgeFiles.bottom, 'base64');
        const { error: bottomUploadError } = await serviceSupabase.storage
          .from('edge-images')
          .upload(`${basePath}/original/bottom.png`, bottomBuffer, {
            contentType: 'image/png',
            upsert: true
          });

        if (!bottomUploadError) {
          finalBottomImagePath = `${basePath}/original/bottom.png`;
        }
      }
    }

    const { data: newDesign, error: insertError } = await serviceSupabase
      .from('edge_designs')
      .insert({
        user_id: user.id,
        name,
        side_image_path: finalSideImagePath,
        top_image_path: finalTopImagePath,
        bottom_image_path: finalBottomImagePath,
        top_edge_color: topEdgeColor && topEdgeColor !== 'none' ? topEdgeColor : null,
        bottom_edge_color: bottomEdgeColor && bottomEdgeColor !== 'none' ? bottomEdgeColor : null,
        is_active: true
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return NextResponse.json({ design: newDesign });

  } catch (error) {
    console.error('Edge design creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create edge design' },
      { status: 500 }
    );
  }
}