import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { createAndStoreDesignSlices, createAndStoreDesignMaskedSlices } from '@/lib/edge-slicer';

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
    console.log('Save-with-PDF-data API: Starting request');

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    console.log('Save-with-PDF-data API: Auth check', {
      hasUser: !!user,
      userId: user?.id,
      authError: authError?.message
    });

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const requestData = await req.json();
    console.log('Save-with-PDF-data API: Request data', {
      name: requestData.name,
      hasEdgeFiles: !!requestData.edgeFiles,
      edgeFileTypes: requestData.edgeFiles ? Object.keys(requestData.edgeFiles) : [],
      pdfWidth: requestData.pdfWidth,
      pdfHeight: requestData.pdfHeight,
      pageCount: requestData.pageCount,
      bleedType: requestData.bleedType,
      edgeType: requestData.edgeType
    });

    const {
      name,
      edgeFiles,
      pdfWidth,
      pdfHeight,
      pageCount,
      bleedType,
      edgeType,
      designId,
      sliceStoragePaths
    } = requestData;

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

    console.log('Save-with-PDF-data API: Creating service client and paths');

    const serviceSupabase = createServiceRoleClient();
    const finalDesignId = designId || crypto.randomUUID();
    const basePath = `users/${user.id}/designs/${finalDesignId}`;

    console.log('Save-with-PDF-data API: Using design paths', {
      designId: finalDesignId,
      providedDesignId: !!designId,
      basePath,
      hasSlicePaths: !!sliceStoragePaths
    });

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

    // Handle slice storage paths - use provided or create new
    console.log('Save-with-PDF-data API: Handling slice storage paths');
    let finalSliceStoragePaths = sliceStoragePaths || null;

    // Only create slices if not provided from processing
    if (!sliceStoragePaths) {
      console.log('No slice paths provided, creating slices for regeneration...');

      try {
        // Prepare edge images for slicing (convert from stored paths to base64)
        const edgeImagesForSlicing: any = {};

      if (finalSideImagePath) {
        // Download the stored side image and convert to base64
        const { data: sideData, error: sideDownloadError } = await serviceSupabase.storage
          .from('edge-images')
          .download(finalSideImagePath);

        if (sideDownloadError) {
          console.error('Failed to download side image for slicing:', sideDownloadError);
        } else {
          const sideBuffer = Buffer.from(await sideData.arrayBuffer());
          edgeImagesForSlicing.side = { base64: sideBuffer.toString('base64') };
        }
      }

      if (finalTopImagePath) {
        if (topEdgeColor) {
          // It's a color value
          edgeImagesForSlicing.top = { color: topEdgeColor };
        } else {
          // It's an image file
          const { data: topData, error: topDownloadError } = await serviceSupabase.storage
            .from('edge-images')
            .download(finalTopImagePath);

          if (topDownloadError) {
            console.error('Failed to download top image for slicing:', topDownloadError);
          } else {
            const topBuffer = Buffer.from(await topData.arrayBuffer());
            edgeImagesForSlicing.top = { base64: topBuffer.toString('base64') };
          }
        }
      }

      if (finalBottomImagePath) {
        if (bottomEdgeColor) {
          // It's a color value
          edgeImagesForSlicing.bottom = { color: bottomEdgeColor };
        } else {
          // It's an image file
          const { data: bottomData, error: bottomDownloadError } = await serviceSupabase.storage
            .from('edge-images')
            .download(finalBottomImagePath);

          if (bottomDownloadError) {
            console.error('Failed to download bottom image for slicing:', bottomDownloadError);
          } else {
            const bottomBuffer = Buffer.from(await bottomData.arrayBuffer());
            edgeImagesForSlicing.bottom = { base64: bottomBuffer.toString('base64') };
          }
        }
      }

      // Calculate PDF dimensions
      const BLEED_INCHES = 0.125;
      const POINTS_PER_INCH = 72;
      const BLEED_POINTS = BLEED_INCHES * POINTS_PER_INCH;

      const trimWidthPoints = (pdfWidth || 6) * POINTS_PER_INCH;
      const trimHeightPoints = (pdfHeight || 9) * POINTS_PER_INCH;

      let finalPdfWidth = trimWidthPoints;
      let finalPdfHeight = trimHeightPoints;

      if (bleedType === 'add_bleed') {
        finalPdfWidth = trimWidthPoints + BLEED_POINTS;
        finalPdfHeight = trimHeightPoints + (2 * BLEED_POINTS);
      }

      // Create slices with design-specific paths
      const rawSlicesPaths = await createAndStoreDesignSlices(edgeImagesForSlicing, {
        numPages: pageCount || 1,
        pageType: 'standard',
        edgeType: edgeType || 'side-only',
        trimWidth: pdfWidth || 6,
        trimHeight: pdfHeight || 9,
        scaleMode: 'fill',
        pdfDimensions: { width: finalPdfWidth, height: finalPdfHeight }
      }, designId, user.id);

      console.log(`Created raw slices - Side: ${rawSlicesPaths.side?.raw.length || 0}, Top: ${rawSlicesPaths.top?.raw.length || 0}, Bottom: ${rawSlicesPaths.bottom?.raw.length || 0}`);

      // Create masked slices
      const maskedSlicesPaths = await createAndStoreDesignMaskedSlices(rawSlicesPaths, {
        numPages: pageCount || 1,
        pageType: 'standard',
        edgeType: edgeType || 'side-only',
        trimWidth: pdfWidth || 6,
        trimHeight: pdfHeight || 9,
        scaleMode: 'fill',
        pdfDimensions: { width: finalPdfWidth, height: finalPdfHeight }
      }, designId, user.id);

      console.log(`✅ Created masked slices - Side: ${maskedSlicesPaths.side?.masked.length || 0}, Top: ${maskedSlicesPaths.top?.masked.length || 0}, Bottom: ${maskedSlicesPaths.bottom?.masked.length || 0}`);

        finalSliceStoragePaths = maskedSlicesPaths;
        console.log('✅ Slice storage paths created for database insert:', {
          hasSlicePaths: !!finalSliceStoragePaths,
          hasSliceData: !!(finalSliceStoragePaths && Object.keys(finalSliceStoragePaths).length > 0)
        });

      } catch (slicingError) {
        console.error('❌ Failed to create slices for design:', slicingError);
        console.error('Slicing error stack:', slicingError instanceof Error ? slicingError.stack : slicingError);
        console.error('Error details:', {
          designId: finalDesignId,
          userId: user.id,
          hasEdgeImages: {
            side: !!edgeImagesForSlicing.side,
            top: !!edgeImagesForSlicing.top,
            bottom: !!edgeImagesForSlicing.bottom
          }
        });
        // Don't fail the entire operation if slicing fails
        // The design will still work for initial processing, just not for fast regeneration
      }
    } else {
      console.log('✅ Using provided slice storage paths from processing');
    }

    // Insert the edge design with PDF data using the specific design ID
    console.log('Save-with-PDF-data API: Inserting design to database', {
      designId: finalDesignId,
      userId: user.id,
      name: name.trim(),
      hasSideImage: !!finalSideImagePath,
      hasTopImage: !!finalTopImagePath,
      hasBottomImage: !!finalBottomImagePath,
      topEdgeColor,
      bottomEdgeColor,
      pdfWidth,
      pdfHeight,
      pageCount,
      bleedType,
      edgeType
    });

    // Now that columns have been added, save all the PDF data including slice paths
    const insertData = {
      id: finalDesignId, // Use the final design ID (provided or generated)
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
      slice_storage_paths: finalSliceStoragePaths, // Store final slice paths for fast regeneration
      is_active: true
    };

    console.log('Save-with-PDF-data API: Final insert data (full schema)', insertData);

    const { data: newDesign, error: insertError } = await serviceSupabase
      .from('edge_designs')
      .insert(insertData)
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
    console.error('Error saving edge design with PDF data - DETAILED:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      error: error,
      name: error instanceof Error ? error.name : undefined
    });

    return NextResponse.json(
      {
        error: 'Failed to save edge design with PDF data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}