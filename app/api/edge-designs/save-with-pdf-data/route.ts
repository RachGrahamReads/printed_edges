import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

// Helper function to create a solid color PNG image
async function createSolidColorImage(hexColor: string, width: number = 100, height: number = 100): Promise<Buffer> {
  // Create a simple SVG and convert to PNG-like buffer
  // This is a minimal implementation for solid colors

  const color = hexColor.replace('#', '');
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);

  // Create a minimal 1x1 PNG-like structure with the color
  // This is a simplified approach that should work for edge processing
  const pixelData = new Uint8Array([r, g, b, 255]); // RGBA

  // For now, return a simple buffer that represents the color
  // The Edge Function should be able to handle this for solid colors
  return Buffer.from(pixelData);
}

// POST: Save edge design with PDF dimensions and processing data
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

    const {
      name,
      edgeFiles,
      pdfWidth,
      pdfHeight,
      pageCount,
      bleedType,
      edgeType
    } = await req.json();

    if (!name) {
      return NextResponse.json(
        { error: 'Design name is required' },
        { status: 400 }
      );
    }

    if (!edgeFiles || (!edgeFiles.side && !edgeFiles.top && !edgeFiles.bottom)) {
      return NextResponse.json(
        { error: 'At least one edge image is required' },
        { status: 400 }
      );
    }

    const serviceSupabase = createServiceRoleClient();
    const designId = crypto.randomUUID();
    const basePath = `users/${user.id}/designs/${designId}`;

    // Upload edge images to user-specific storage
    let finalSideImagePath: string | undefined;
    let finalTopImagePath: string | undefined;
    let finalBottomImagePath: string | undefined;
    let topEdgeColor: string | undefined;
    let bottomEdgeColor: string | undefined;

    if (edgeFiles.side) {
      const sideBuffer = Buffer.from(edgeFiles.side, 'base64');
      const sideImagePath = `${basePath}/original/side.png`;
      console.log(`Uploading side image to: ${sideImagePath}`);

      const { error: sideUploadError } = await serviceSupabase.storage
        .from('edge-images')
        .upload(sideImagePath, sideBuffer, {
          contentType: 'image/png',
          upsert: true
        });

      if (!sideUploadError) {
        finalSideImagePath = sideImagePath;
        console.log(`Side image uploaded successfully to: ${sideImagePath}`);
      } else {
        console.error(`Error uploading side image:`, sideUploadError);
      }
    }

    if (edgeFiles.top) {
      let topBuffer: Buffer;
      let isColorValue = false;

      // Check if it's a hex color value instead of base64 image data
      if (typeof edgeFiles.top === 'string' && edgeFiles.top.startsWith('#')) {
        // Create a solid color image for the hex value
        console.log(`Creating solid color image for top edge: ${edgeFiles.top}`);
        topBuffer = await createSolidColorImage(edgeFiles.top);
        topEdgeColor = edgeFiles.top; // Store the original color value
        isColorValue = true;
      } else {
        // Regular base64 image data
        topBuffer = Buffer.from(edgeFiles.top, 'base64');
      }

      const topImagePath = `${basePath}/original/top.png`;
      console.log(`Uploading top ${isColorValue ? 'color' : 'image'} to: ${topImagePath}`);

      const { error: topUploadError } = await serviceSupabase.storage
        .from('edge-images')
        .upload(topImagePath, topBuffer, {
          contentType: 'image/png',
          upsert: true
        });

      if (!topUploadError) {
        finalTopImagePath = topImagePath;
        console.log(`Top ${isColorValue ? 'color' : 'image'} uploaded successfully to: ${topImagePath}`);
      } else {
        console.error(`Error uploading top ${isColorValue ? 'color' : 'image'}:`, topUploadError);
      }
    }

    if (edgeFiles.bottom) {
      let bottomBuffer: Buffer;
      let isColorValue = false;

      // Check if it's a hex color value instead of base64 image data
      if (typeof edgeFiles.bottom === 'string' && edgeFiles.bottom.startsWith('#')) {
        // Create a solid color image for the hex value
        console.log(`Creating solid color image for bottom edge: ${edgeFiles.bottom}`);
        bottomBuffer = await createSolidColorImage(edgeFiles.bottom);
        bottomEdgeColor = edgeFiles.bottom; // Store the original color value
        isColorValue = true;
      } else {
        // Regular base64 image data
        bottomBuffer = Buffer.from(edgeFiles.bottom, 'base64');
      }

      const bottomImagePath = `${basePath}/original/bottom.png`;
      console.log(`Uploading bottom ${isColorValue ? 'color' : 'image'} to: ${bottomImagePath}`);

      const { error: bottomUploadError } = await serviceSupabase.storage
        .from('edge-images')
        .upload(bottomImagePath, bottomBuffer, {
          contentType: 'image/png',
          upsert: true
        });

      if (!bottomUploadError) {
        finalBottomImagePath = bottomImagePath;
        console.log(`Bottom ${isColorValue ? 'color' : 'image'} uploaded successfully to: ${bottomImagePath}`);
      } else {
        console.error(`Error uploading bottom ${isColorValue ? 'color' : 'image'}:`, bottomUploadError);
      }
    }

    // Insert the edge design with PDF data using the specific design ID
    const { data: newDesign, error: insertError } = await serviceSupabase
      .from('edge_designs')
      .insert({
        id: designId, // Use the same ID used for image paths
        user_id: user.id,
        name: name.trim(),
        side_image_path: finalSideImagePath,
        top_image_path: finalTopImagePath,
        bottom_image_path: finalBottomImagePath,
        top_edge_color: topEdgeColor,
        bottom_edge_color: bottomEdgeColor,
        pdf_width: pdfWidth,
        pdf_height: pdfHeight,
        page_count: pageCount,
        bleed_type: bleedType,
        edge_type: edgeType,
        is_active: true
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting edge design:', insertError);
      throw insertError;
    }

    console.log('Edge design saved successfully:', {
      id: newDesign.id,
      name: newDesign.name,
      side_image_path: newDesign.side_image_path,
      top_image_path: newDesign.top_image_path,
      bottom_image_path: newDesign.bottom_image_path
    });

    return NextResponse.json({
      success: true,
      design: newDesign
    });

  } catch (error) {
    console.error('Error saving edge design with PDF data:', error);
    return NextResponse.json(
      { error: 'Failed to save edge design with PDF data' },
      { status: 500 }
    );
  }
}