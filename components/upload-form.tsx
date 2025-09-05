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

export default function UploadForm() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [processResult, setProcessResult] = useState<ProcessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Processing options
  const [numPages, setNumPages] = useState(30);
  const [pageType, setPageType] = useState("white");
  const [position, setPosition] = useState("right");

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
          trimWidth: 5,
          trimHeight: 8,
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
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>File Upload</CardTitle>
        <CardDescription>
          Upload an image and a PDF file to Supabase storage
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="image">Image File</Label>
            <Input
              id="image"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              disabled={isUploading}
            />
            {imageFile && (
              <p className="text-sm text-gray-600">
                Selected: {imageFile.name} ({formatFileSize(imageFile.size)})
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="pdf">PDF File</Label>
            <Input
              id="pdf"
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
              disabled={isUploading}
            />
            {pdfFile && (
              <p className="text-sm text-gray-600">
                Selected: {pdfFile.name} ({formatFileSize(pdfFile.size)})
              </p>
            )}
          </div>

          {/* Processing Options */}
          <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-sm text-gray-900">Processing Options</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="numPages">Number of Pages</Label>
                <Input
                  id="numPages"
                  type="number"
                  value={numPages}
                  onChange={(e) => setNumPages(parseInt(e.target.value) || 30)}
                  min="1"
                  max="1000"
                  disabled={isUploading || isProcessing}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="pageType">Page Type</Label>
                <select
                  id="pageType"
                  value={pageType}
                  onChange={(e) => setPageType(e.target.value)}
                  disabled={isUploading || isProcessing}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="white">White</option>
                  <option value="cream">Cream</option>
                  <option value="color">Color</option>
                  <option value="bw">Black & White</option>
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

          <Button 
            type="submit" 
            disabled={!imageFile || !pdfFile || isUploading || isProcessing}
            className="w-full"
          >
            {isUploading ? "Uploading..." : isProcessing ? "Processing..." : "Upload & Process Files"}
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