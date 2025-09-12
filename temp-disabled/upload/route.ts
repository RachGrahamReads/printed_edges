import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const imageFile = formData.get("image") as File | null;
    const pdfFile = formData.get("pdf") as File | null;

    if (!imageFile || !pdfFile) {
      return NextResponse.json(
        { error: "Both image and PDF files are required" },
        { status: 400 }
      );
    }

    // Validate file types
    const imageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    const pdfTypes = ["application/pdf"];

    if (!imageTypes.includes(imageFile.type)) {
      return NextResponse.json(
        { error: "Invalid image type. Only JPEG, PNG, GIF, and WebP are allowed" },
        { status: 400 }
      );
    }

    if (!pdfTypes.includes(pdfFile.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only PDF files are allowed" },
        { status: 400 }
      );
    }

    // Validate file sizes (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (imageFile.size > maxSize || pdfFile.size > maxSize) {
      return NextResponse.json(
        { error: "File size too large. Maximum 10MB per file" },
        { status: 400 }
      );
    }

    // Skip bucket listing check - anon key doesn't have permissions
    // The bucket 'user-uploads' exists, so proceed with upload

    // Generate unique file names
    const timestamp = Date.now();
    const imageExtension = imageFile.name.split('.').pop();
    const pdfExtension = pdfFile.name.split('.').pop();
    
    const imagePath = `${user.id}/${timestamp}_image.${imageExtension}`;
    const pdfPath = `${user.id}/${timestamp}_pdf.${pdfExtension}`;

    // Upload image file
    const imageBuffer = await imageFile.arrayBuffer();
    const { error: imageError } = await supabase.storage
      .from("user-uploads")
      .upload(imagePath, imageBuffer, {
        contentType: imageFile.type,
        duplex: "half",
      });

    if (imageError) {
      console.error("Error uploading image:", imageError);
      return NextResponse.json(
        { error: "Failed to upload image" },
        { status: 500 }
      );
    }

    // Upload PDF file
    const pdfBuffer = await pdfFile.arrayBuffer();
    const { error: pdfError } = await supabase.storage
      .from("user-uploads")
      .upload(pdfPath, pdfBuffer, {
        contentType: pdfFile.type,
        duplex: "half",
      });

    if (pdfError) {
      console.error("Error uploading PDF:", pdfError);
      // Clean up the image that was successfully uploaded
      await supabase.storage.from("user-uploads").remove([imagePath]);
      return NextResponse.json(
        { error: "Failed to upload PDF" },
        { status: 500 }
      );
    }

    // Get signed URLs for the uploaded files (optional, for immediate access)
    const { data: imageUrl } = await supabase.storage
      .from("user-uploads")
      .createSignedUrl(imagePath, 3600); // 1 hour expiry

    const { data: pdfUrl } = await supabase.storage
      .from("user-uploads")
      .createSignedUrl(pdfPath, 3600); // 1 hour expiry

    return NextResponse.json({
      message: "Files uploaded successfully",
      files: {
        image: {
          path: imagePath,
          url: imageUrl?.signedUrl,
          size: imageFile.size,
          type: imageFile.type,
        },
        pdf: {
          path: pdfPath,
          url: pdfUrl?.signedUrl,
          size: pdfFile.size,
          type: pdfFile.type,
        },
      },
    });

  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}