"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface UploadResponse {
  message: string;
  files: {
    image: {
      path: string;
      url?: string;
      size: number;
      type: string;
    };
    pdf: {
      path: string;
      url?: string;
      size: number;
      type: string;
    };
  };
}

interface ProcessResponse {
  status: string;
  message: string;
  processedPdf: {
    path: string;
    url: string;
  };
}

interface PdfAnalysis {
  status: string;
  pageCount: number;
  dimensions: {
    widthInches: number;
    heightInches: number;
    widthPoints: number;
    heightPoints: number;
  };
}

export default function UploadForm() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [processResult, setProcessResult] = useState<ProcessResponse | null>(null);
  const [pdfAnalysis, setPdfAnalysis] = useState<PdfAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Processing options (numPages will be set from PDF analysis)
  const [pageType, setPageType] = useState("white");
  const [position, setPosition] = useState("right");
  
  // Get values from PDF analysis or defaults
  const trimWidth = pdfAnalysis?.dimensions.widthInches || 5;
  const trimHeight = pdfAnalysis?.dimensions.heightInches || 8;
  const numPages = pdfAnalysis?.pageCount || 30;
  
  // Constants for calculations
  const BLEED_INCHES = 0.125;
  const POINTS_PER_INCH = 72;
  const PAGE_THICKNESS = {
    "white": 0.0025,
    "cream": 0.0027,
    "color": 0.003,
    "bw": 0.0025
  };
  
  // Calculate required image dimensions
  const calculateImageDimensions = () => {
    const pageThickness = PAGE_THICKNESS[pageType as keyof typeof PAGE_THICKNESS];
    const totalThickness = pageThickness * numPages;
    const requiredWidth = totalThickness; // Image width = total thickness
    const requiredHeight = trimHeight + (BLEED_INCHES * 2); // Height + full bleed
    
    return {
      width: requiredWidth,
      height: requiredHeight,
      widthPixels: Math.round(requiredWidth * 300), // Assume 300 DPI
      heightPixels: Math.round(requiredHeight * 300)
    };
  };
  
  const imageDimensions = calculateImageDimensions();
  
  // Analyze PDF when file is selected
  const handlePdfSelect = async (file: File | null) => {
    setPdfFile(file);
    setPdfAnalysis(null);
    
    if (!file) return;
    
    setIsAnalyzing(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('pdf', file);
      
      const response = await fetch('/api/analyze-pdf', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze PDF');
      }
      
      setPdfAnalysis(data.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze PDF');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleProcess = async (imagePath: string, pdfPath: string) => {
    setIsProcessing(true);
    setError(null);
    setProcessResult(null);

    try {
      const response = await fetch("/api/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imagePath,
          pdfPath,
          numPages,
          pageType,
          position,
          mode: "single",
          trimWidth,
          trimHeight,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Processing failed");
      }

      setProcessResult(data);
      
      // Reset form after successful processing
      setImageFile(null);
      setPdfFile(null);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!imageFile || !pdfFile) {
      setError("Please select both an image and a PDF file");
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("pdf", pdfFile);

      const response = await fetch("/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setUploadResult(data);
      
      // Auto-process the files after successful upload
      await handleProcess(data.files.image.path, data.files.pdf.path);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>File Upload</CardTitle>
        <CardDescription>
          Upload your PDF, specify dimensions, and we'll calculate the required image size
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Step 1: PDF Upload */}
          <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-medium text-sm text-blue-900">Step 1: Upload Your PDF</h4>
            <div className="space-y-2">
              <Label htmlFor="pdf">PDF File (e.g. 5×8 inch)</Label>
              <Input
                id="pdf"
                type="file"
                accept="application/pdf"
                onChange={(e) => handlePdfSelect(e.target.files?.[0] || null)}
                disabled={isUploading}
              />
              {pdfFile && (
                <div className="space-y-2">
                  <p className="text-sm text-blue-600">
                    Selected: {pdfFile.name} ({formatFileSize(pdfFile.size)})
                  </p>
                  {isAnalyzing && (
                    <p className="text-sm text-blue-500 flex items-center gap-2">
                      <span className="animate-spin">⏳</span> Analyzing PDF...
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Detected PDF Information */}
          {pdfAnalysis && (
            <div className="space-y-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <h4 className="font-medium text-sm text-purple-900">Step 2: Detected PDF Information</h4>
              <div className="bg-white p-3 rounded border">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p><strong>Page Count:</strong> {pdfAnalysis.pageCount} pages</p>
                    <p><strong>Trim Size:</strong> {pdfAnalysis.dimensions.widthInches}" × {pdfAnalysis.dimensions.heightInches}"</p>
                  </div>
                  <div>
                    <p><strong>Width:</strong> {pdfAnalysis.dimensions.widthInches}" ({pdfAnalysis.dimensions.widthPoints}pts)</p>
                    <p><strong>Height:</strong> {pdfAnalysis.dimensions.heightInches}" ({pdfAnalysis.dimensions.heightPoints}pts)</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Image Requirements */}
          {pdfAnalysis && (
            <div className="space-y-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <h4 className="font-medium text-sm text-amber-900">Step 3: Required Image Dimensions</h4>
            <div className="bg-white p-3 rounded border">
              <div className="text-sm space-y-1">
                <p><strong>Required Image Size:</strong></p>
                <p>Width: {imageDimensions.width.toFixed(3)}" ({imageDimensions.widthPixels}px at 300 DPI)</p>
                <p>Height: {imageDimensions.height.toFixed(3)}" ({imageDimensions.heightPixels}px at 300 DPI)</p>
                <p className="text-xs text-gray-600 mt-2">
                  Width = {numPages} pages × {PAGE_THICKNESS[pageType as keyof typeof PAGE_THICKNESS]}" thickness<br/>
                  Height = {trimHeight}" + {BLEED_INCHES * 2}" full bleed
                </p>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="image">Upload Your Edge Image</Label>
              <Input
                id="image"
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                disabled={isUploading}
              />
              {imageFile && (
                <p className="text-sm text-amber-600">
                  Selected: {imageFile.name} ({formatFileSize(imageFile.size)})
                </p>
              )}
            </div>
            </div>
          )}

          {/* Step 4: Processing Options */}
          {pdfAnalysis && (
            <div className="space-y-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h4 className="font-medium text-sm text-gray-900">Step 4: Processing Options</h4>
            
            <div className="space-y-4">
              <div className="bg-white p-3 rounded border">
                <p className="text-sm"><strong>Detected Pages:</strong> {numPages} pages</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="pageType">Paper Type</Label>
                <select
                  id="pageType"
                  value={pageType}
                  onChange={(e) => setPageType(e.target.value)}
                  disabled={isUploading || isProcessing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="white">White Paper (0.0025" thickness)</option>
                  <option value="cream">Cream Paper (0.0027" thickness)</option>
                  <option value="color">Color Paper (0.003" thickness)</option>
                  <option value="bw">B&W Paper (0.0025" thickness)</option>
                </select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="position">Edge Position</Label>
              <select
                id="position"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                disabled={isUploading || isProcessing}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="right">Right</option>
                <option value="left">Left</option>
              </select>
            </div>
            </div>
          )}

          <Button 
            type="submit" 
            disabled={!imageFile || !pdfFile || !pdfAnalysis || isUploading || isProcessing || isAnalyzing}
            className="w-full"
          >
            {isAnalyzing ? "Analyzing PDF..." : isUploading ? "Uploading..." : isProcessing ? "Processing..." : "Upload & Process Files"}
          </Button>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {processResult && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <h3 className="font-medium text-green-800 mb-2">Processing Complete! 🎉</h3>
              <div className="text-sm text-green-700 space-y-2">
                <p>{processResult.message}</p>
                <div className="flex gap-2 mt-3">
                  <a 
                    href={processResult.processedPdf.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
                  >
                    📥 Download Processed PDF
                  </a>
                  <button
                    onClick={() => {
                      setProcessResult(null);
                      setUploadResult(null);
                      // Reset form
                      const form = document.querySelector('form') as HTMLFormElement;
                      form?.reset();
                    }}
                    className="inline-flex items-center px-3 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors"
                  >
                    🔄 Process Another File
                  </button>
                </div>
              </div>
            </div>
          )}

          {uploadResult && !processResult && !isProcessing && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
              <h3 className="font-medium text-blue-800 mb-2">Upload Successful!</h3>
              <div className="text-sm text-blue-700 space-y-2">
                <div>
                  <strong>Image:</strong> {uploadResult.files.image.path}
                  <br />
                  <span className="text-xs">
                    {formatFileSize(uploadResult.files.image.size)} • {uploadResult.files.image.type}
                  </span>
                </div>
                <div>
                  <strong>PDF:</strong> {uploadResult.files.pdf.path}
                  <br />
                  <span className="text-xs">
                    {formatFileSize(uploadResult.files.pdf.size)} • {uploadResult.files.pdf.type}
                  </span>
                </div>
              </div>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}