import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const pdfFile = formData.get("pdf") as File | null;

    if (!pdfFile) {
      return NextResponse.json(
        { error: "PDF file is required" },
        { status: 400 }
      );
    }

    // Validate file type
    if (pdfFile.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Invalid file type. Only PDF files are allowed" },
        { status: 400 }
      );
    }

    // Convert file to buffer for analysis
    const pdfBuffer = await pdfFile.arrayBuffer();
    
    // Call Python service to analyze PDF
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || "http://localhost:5001";
    
    // Create a temporary FormData to send to Python service
    const analysisFormData = new FormData();
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
    analysisFormData.append('pdf', blob, pdfFile.name);

    const response = await fetch(`${pythonServiceUrl}/analyze-pdf`, {
      method: "POST",
      body: analysisFormData,
    });

    if (!response.ok) {
      throw new Error(`Python service error: ${response.statusText}`);
    }

    const analysisResult = await response.json();

    return NextResponse.json({
      status: "success",
      analysis: analysisResult,
    });

  } catch (error) {
    console.error("PDF analysis error:", error);
    return NextResponse.json(
      { error: "Failed to analyze PDF" },
      { status: 500 }
    );
  }
}