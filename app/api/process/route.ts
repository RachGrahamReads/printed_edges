import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

interface ProcessRequest {
  imagePath: string;
  pdfPath: string;
  trimWidth?: number;
  trimHeight?: number;
  numPages?: number;
  pageType?: string;
  position?: string;
  mode?: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: ProcessRequest = await request.json();
    const { 
      imagePath, 
      pdfPath, 
      trimWidth = 5, 
      trimHeight = 8, 
      numPages = 30, 
      pageType = "white",
      position = "right",
      mode = "single"
    } = body;

    if (!imagePath || !pdfPath) {
      return NextResponse.json(
        { error: "Both image and PDF paths are required" },
        { status: 400 }
      );
    }

    // Get signed URLs for the uploaded files to send to Python service
    const { data: imageUrl, error: imageUrlError } = await supabase.storage
      .from("user-uploads")
      .createSignedUrl(imagePath, 3600); // 1 hour expiry

    const { data: pdfUrl, error: pdfUrlError } = await supabase.storage
      .from("user-uploads")
      .createSignedUrl(pdfPath, 3600); // 1 hour expiry

    if (imageUrlError || pdfUrlError || !imageUrl || !pdfUrl) {
      return NextResponse.json(
        { error: "Failed to create signed URLs for files" },
        { status: 500 }
      );
    }

    // Call Python processing service
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || "http://localhost:5001";
    const processResponse = await fetch(`${pythonServiceUrl}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pdf_path: pdfUrl.signedUrl,
        edge_path: imageUrl.signedUrl,
        trim_width: trimWidth,
        trim_height: trimHeight,
        num_pages: numPages,
        page_type: pageType,
        position: position,
        mode: mode,
      }),
    });

    if (!processResponse.ok) {
      throw new Error(`Python service error: ${processResponse.statusText}`);
    }

    // Python service returns the processed PDF as a file
    const processedPdfBuffer = await processResponse.arrayBuffer();

    // Generate unique filename for processed PDF
    const timestamp = Date.now();
    const processedPdfPath = `${user.id}/processed_${timestamp}.pdf`;

    // Upload processed PDF back to Supabase storage
    const { error: uploadError } = await supabase.storage
      .from("user-uploads")
      .upload(processedPdfPath, processedPdfBuffer, {
        contentType: "application/pdf",
        duplex: "half",
      });

    if (uploadError) {
      console.error("Error uploading processed PDF:", uploadError);
      return NextResponse.json(
        { error: "Failed to save processed PDF" },
        { status: 500 }
      );
    }

    // Create signed URL for the processed PDF
    const { data: processedPdfUrl, error: urlError } = await supabase.storage
      .from("user-uploads")
      .createSignedUrl(processedPdfPath, 3600); // 1 hour expiry

    if (urlError || !processedPdfUrl) {
      return NextResponse.json(
        { error: "Failed to create download URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "success",
      message: "PDF processed successfully",
      processedPdf: {
        path: processedPdfPath,
        url: processedPdfUrl.signedUrl,
      },
    });

  } catch (error) {
    console.error("Processing error:", error);
    return NextResponse.json(
      { error: "Internal server error during processing" },
      { status: 500 }
    );
  }
}