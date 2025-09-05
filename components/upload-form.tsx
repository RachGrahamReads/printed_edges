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

export default function UploadForm() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setImageFile(null);
      setPdfFile(null);
      
      // Reset form inputs
      const form = e.target as HTMLFormElement;
      form.reset();
      
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

          <Button 
            type="submit" 
            disabled={!imageFile || !pdfFile || isUploading}
            className="w-full"
          >
            {isUploading ? "Uploading..." : "Upload Files"}
          </Button>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {uploadResult && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <h3 className="font-medium text-green-800 mb-2">Upload Successful!</h3>
              <div className="text-sm text-green-700 space-y-2">
                <div>
                  <strong>Image:</strong> {uploadResult.files.image.path}
                  <br />
                  <span className="text-xs">
                    {formatFileSize(uploadResult.files.image.size)} • {uploadResult.files.image.type}
                  </span>
                  {uploadResult.files.image.url && (
                    <div>
                      <a 
                        href={uploadResult.files.image.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-xs"
                      >
                        View Image
                      </a>
                    </div>
                  )}
                </div>
                <div>
                  <strong>PDF:</strong> {uploadResult.files.pdf.path}
                  <br />
                  <span className="text-xs">
                    {formatFileSize(uploadResult.files.pdf.size)} • {uploadResult.files.pdf.type}
                  </span>
                  {uploadResult.files.pdf.url && (
                    <div>
                      <a 
                        href={uploadResult.files.pdf.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-xs"
                      >
                        View PDF
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}