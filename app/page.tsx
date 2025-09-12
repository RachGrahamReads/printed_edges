"use client";

import { useState, useEffect } from "react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function Home() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [bookWidth, setBookWidth] = useState(6); // inches (auto-detected)
  const [bookHeight, setBookHeight] = useState(9); // inches (auto-detected)
  const [pageType, setPageType] = useState("bw");
  const [bleedType, setBleedType] = useState("add_bleed"); // "add_bleed" or "existing_bleed"
  const [showPreview, setShowPreview] = useState(false);
  const [viewMode, setViewMode] = useState<"2page" | "shelf" | "actual">("2page");
  const [processedPdfUrl, setProcessedPdfUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [useCustomDimensions, setUseCustomDimensions] = useState(false);

  const PAGE_THICKNESS = {
    "bw": 0.0032,
    "standard": 0.0032,
    "premium": 0.0037
  };

  const numLeaves = Math.ceil(totalPages / 2);
  const totalThickness = PAGE_THICKNESS[pageType as keyof typeof PAGE_THICKNESS] * numLeaves;

  // Load pages on demand when currentPage changes
  useEffect(() => {
    if (!pdfDocument) return;
    
    // Check if we need to load the current page (right side)
    if (currentPage <= totalPages && !pdfPages[currentPage - 1]) {
      loadMorePages(currentPage);
    }
    
    // Check if we need to load the previous page (left side)
    if (currentPage > 1 && !pdfPages[currentPage - 2]) {
      loadMorePages(currentPage - 1);
    }
  }, [currentPage, pdfDocument, totalPages, pdfPages]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setSelectedImage(e.target?.result as string);
        setShowPreview(false); // Reset preview when new image is uploaded
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePdfUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedPdf(file);
      setShowPreview(false);
      setProcessedPdfUrl(null); // Reset processed PDF
      
      // Load PDF for preview
      try {
        await loadPdfForPreview(file);
      } catch (error) {
        console.error('Error loading PDF for preview:', error);
      }
    }
  };

  const loadPdfForPreview = async (file: File) => {
    const fileUrl = URL.createObjectURL(file);
    
    // Load PDF.js
    const pdfjsLib = (window as any).pdfjsLib;
    if (!pdfjsLib) {
      // Load PDF.js if not already loaded
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      document.head.appendChild(script);
      
      await new Promise((resolve) => {
        script.onload = resolve;
      });
      
      (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const pdf = await (window as any).pdfjsLib.getDocument(fileUrl).promise;
    setPdfDocument(pdf);
    setTotalPages(pdf.numPages);
    
    // Auto-detect page dimensions from first page
    const firstPage = await pdf.getPage(1);
    const viewport = firstPage.getViewport({ scale: 1 });
    const widthInches = viewport.width / 72;
    const heightInches = viewport.height / 72;
    setBookWidth(Math.round(widthInches * 4) / 4);
    setBookHeight(Math.round(heightInches * 4) / 4);

    // Load first 20 pages
    for (let i = 1; i <= Math.min(20, pdf.numPages); i++) {
      await loadPage(pdf, i);
    }
  };

  const loadPage = async (pdf: any, pageNumber: number) => {
    try {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
      
      setPdfPages(prev => {
        const newPages = [...prev];
        newPages[pageNumber - 1] = canvas.toDataURL();
        return newPages;
      });
    } catch (error) {
      console.error(`Error loading page ${pageNumber}:`, error);
    }
  };

  const loadMorePages = async (startingFromPage: number) => {
    if (!pdfDocument) return;
    
    const endPage = Math.min(startingFromPage + 10, totalPages);
    
    for (let i = startingFromPage; i <= endPage; i++) {
      if (!pdfPages[i - 1]) {
        await loadPage(pdfDocument, i);
      }
    }
  };

  const processActualPdf = async () => {
    if (!selectedImageFile || !selectedPdf) return;

    setIsProcessing(true);
    try {
      // Create FormData to send files
      const formData = new FormData();
      formData.append('pdf', selectedPdf);
      formData.append('edge', selectedImageFile);
      formData.append('numPages', totalPages.toString());
      formData.append('pageType', pageType);
      formData.append('bleedType', bleedType);
      formData.append('trimWidth', bookWidth.toString());
      formData.append('trimHeight', bookHeight.toString());

      const response = await fetch('/api/process-preview', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (result.success) {
        setProcessedPdfUrl(result.pdfData);
        // Keep current view mode, download will appear in left panel
      } else {
        throw new Error(result.error || 'Failed to process PDF');
      }
    } catch (error) {
      console.error('Error processing PDF:', error);
      alert('Failed to process PDF: ' + (error as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const generatePreview = () => {
    setShowPreview(true);
    setViewMode("2page"); // Default to 2-page layout
  };

  const generateTemplate = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate template dimensions
    const templateWidth = totalThickness * 300; // Width in pixels at 300 DPI
    const templateHeight = (bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight) * 300; // Height in pixels at 300 DPI
    
    canvas.width = templateWidth;
    canvas.height = templateHeight;

    // Fill with light background
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, templateWidth, templateHeight);

    // Calculate zones
    const bleedMargin = 0.125 * 300; // 0.125" in pixels at 300 DPI
    const bufferMargin = 0.125 * 300; // Additional 0.125" buffer zone
    
    // Draw bleed zones (50% transparent red)
    ctx.fillStyle = 'rgba(220, 53, 69, 0.5)';
    // Top bleed zone
    ctx.fillRect(0, 0, templateWidth, bleedMargin);
    // Bottom bleed zone
    ctx.fillRect(0, templateHeight - bleedMargin, templateWidth, bleedMargin);
    
    // Draw buffer zones (50% transparent blue)
    ctx.fillStyle = 'rgba(0, 123, 255, 0.5)';
    // Top buffer zone
    ctx.fillRect(0, bleedMargin, templateWidth, bufferMargin);
    // Bottom buffer zone  
    ctx.fillRect(0, templateHeight - bleedMargin - bufferMargin, templateWidth, bufferMargin);
    
    // Draw main design area (safe zone) border
    ctx.strokeStyle = '#28a745';
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.strokeRect(0, bleedMargin + bufferMargin, templateWidth, templateHeight - (2 * (bleedMargin + bufferMargin)));

    // Add rotated text instructions (90 degrees)
    ctx.save();
    ctx.translate(templateWidth / 2, templateHeight / 2);
    ctx.rotate(Math.PI / 2); // 90 degrees
    
    // Calculate font sizes based on template width (narrow templates need smaller fonts)
    const baseFontSize = Math.max(Math.min(templateWidth / 8, 24), 10); // Scale with width, min 10px, max 24px
    const smallFontSize = Math.max(Math.min(templateWidth / 10, 18), 8); // Scale with width, min 8px, max 18px
    const lineSpacing = baseFontSize * 1.2; // Tighter line spacing
    
    ctx.fillStyle = '#495057';
    ctx.font = `${baseFontSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    
    ctx.fillText('Template', 0, -lineSpacing * 3);
    ctx.fillText(`${templateWidth} × ${templateHeight}px`, 0, -lineSpacing * 2);
    ctx.fillText(`${bookWidth}" × ${bookHeight}" • ${totalPages}p`, 0, -lineSpacing);
    
    ctx.font = `${smallFontSize}px Arial, sans-serif`;
    ctx.fillStyle = '#28a745';
    ctx.fillText('Safe area (green)', 0, lineSpacing * 0.5);
    ctx.fillStyle = '#dc3545';
    ctx.fillText('Bleed (red)', 0, lineSpacing * 1.5);
    ctx.fillStyle = '#007bff';
    ctx.fillText('Buffer (blue)', 0, lineSpacing * 2.5);
    
    ctx.restore();

    // Download the template
    const link = document.createElement('a');
    link.download = `edge-template-${bookWidth}x${bookHeight}-${totalPages}pages.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto p-8">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16 mb-8">
          <div className="w-full max-w-5xl flex justify-center items-center p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
              <Link href={"/"}>Printed Edges</Link>
            </div>
          </div>
        </nav>

        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">Custom Edge Generator</h1>
          <p className="text-lg text-muted-foreground">
            Upload your PDF and edge image to create custom printed edges for your book
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Left Column - Upload Form */}
          <Card>
            <CardHeader>
              <CardTitle>Create Your Custom Edge</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Step 1: PDF Upload or Custom Dimensions */}
              <div>
                <Label>1. Choose Input Method</Label>
                <div className="mt-2 space-y-3">
                  <div className="flex items-center space-x-2">
                    <input
                      id="uploadPdf"
                      type="radio"
                      name="inputMethod"
                      checked={!useCustomDimensions}
                      onChange={() => setUseCustomDimensions(false)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <Label htmlFor="uploadPdf" className="text-sm">Upload PDF file</Label>
                  </div>
                  
                  {!useCustomDimensions && (
                    <Input
                      id="pdf"
                      type="file"
                      accept="application/pdf"
                      onChange={handlePdfUpload}
                      className="ml-6"
                    />
                  )}
                  
                  <div className="flex items-center space-x-2">
                    <input
                      id="customDims"
                      type="radio"
                      name="inputMethod"
                      checked={useCustomDimensions}
                      onChange={() => setUseCustomDimensions(true)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <Label htmlFor="customDims" className="text-sm">Enter custom dimensions</Label>
                  </div>
                  
                  {useCustomDimensions && (
                    <div className="ml-6 space-y-2 bg-blue-50 p-3 rounded-lg border border-blue-200">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label htmlFor="customWidth" className="text-xs">Width (inches)</Label>
                          <Input
                            id="customWidth"
                            type="number"
                            step="0.25"
                            min="3"
                            max="12"
                            value={bookWidth}
                            onChange={(e) => setBookWidth(parseFloat(e.target.value) || 6)}
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <Label htmlFor="customHeight" className="text-xs">Height (inches)</Label>
                          <Input
                            id="customHeight"
                            type="number"
                            step="0.25"
                            min="4"
                            max="15"
                            value={bookHeight}
                            onChange={(e) => setBookHeight(parseFloat(e.target.value) || 9)}
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <Label htmlFor="customPages" className="text-xs">Page Count</Label>
                          <Input
                            id="customPages"
                            type="number"
                            step="2"
                            min="24"
                            max="800"
                            value={totalPages || 120}
                            onChange={(e) => setTotalPages(parseInt(e.target.value) || 120)}
                            className="text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Step 2: Options */}
              {((selectedPdf && totalPages > 0) || (useCustomDimensions && totalPages > 0)) && (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <input
                      id="hasBleed"
                      type="checkbox"
                      checked={bleedType === "existing_bleed"}
                      onChange={(e) => setBleedType(e.target.checked ? "existing_bleed" : "add_bleed")}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <Label htmlFor="hasBleed" className="text-sm">My document already has bleed</Label>
                  </div>

                  <div>
                    <Label htmlFor="pageType" className="text-sm">Print Type</Label>
                    <select
                      id="pageType"
                      value={pageType}
                      onChange={(e) => setPageType(e.target.value)}
                      className="w-full px-3 py-1 text-sm border border-gray-300 rounded-md"
                    >
                      <option value="bw">Black & White</option>
                      <option value="standard">Standard Color</option>
                      <option value="premium">Premium Color</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Step 3: Required Image Size (simplified) */}
              {((selectedPdf && totalPages > 0) || (useCustomDimensions && totalPages > 0)) && (
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Required Image Size:</p>
                      <p className="text-lg font-medium text-blue-700">
                        {(totalThickness * 300).toFixed(0)} × {((bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight) * 300).toFixed(0)}px
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const details = `Required Edge Image Details:

Width: ${(totalThickness * 300).toFixed(0)} pixels (${totalThickness.toFixed(4)}" at 300 DPI)
Height: ${((bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight) * 300).toFixed(0)} pixels (${(bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight).toFixed(2)}" at 300 DPI)

Your PDF: ${totalPages} pages (${numLeaves} leaves), ${bookWidth}" × ${bookHeight}"
Paper: ${pageType === "bw" ? "Black & White" : pageType === "standard" ? "Standard Color" : "Premium Color"}
Bleed: ${bleedType === "add_bleed" ? "Will add 0.125\" bleed" : "Using existing bleed"}

Calculation:
• Width = ${numLeaves} leaves × ${PAGE_THICKNESS[pageType as keyof typeof PAGE_THICKNESS]}" thickness
• Height = ${bookHeight}" ${bleedType === "add_bleed" ? "+ 0.25\" (bleed will be added)" : "(using existing bleed)"}`;
                          alert(details);
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        Details
                      </button>
                      <button
                        onClick={generateTemplate}
                        className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                      >
                        📄 Template
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Image Upload */}
              {((selectedPdf && totalPages > 0) || (useCustomDimensions && totalPages > 0)) && (
                <div>
                  <Label htmlFor="image">2. Upload Edge Image</Label>
                  <Input
                    id="image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                  />
                  {selectedImage && (
                    <p className="text-xs text-green-600 mt-1">✅ Image uploaded</p>
                  )}
                </div>
              )}

              {/* Preview Button */}
              {((selectedPdf && totalPages > 0) || (useCustomDimensions && totalPages > 0)) && selectedImage && (
                <Button
                  onClick={generatePreview}
                  variant="outline"
                  className="w-full"
                >
                  📖 Preview
                </Button>
              )}

              {/* Process Button */}
              {((selectedPdf && totalPages > 0) || (useCustomDimensions && totalPages > 0)) && selectedImage && (
                <div className="space-y-3">
                  <Button
                    onClick={processActualPdf}
                    disabled={isProcessing || useCustomDimensions}
                    className="w-full"
                    title={useCustomDimensions ? "Upload a PDF file and edge image to process" : ""}
                  >
                    {isProcessing ? "Processing..." : useCustomDimensions ? "🔄 Upload PDF & Image to Process" : "🔄 Process PDF"}
                  </Button>
                  
                  {/* Download section */}
                  {processedPdfUrl && (
                    <div className="mt-4 p-3 bg-green-100 rounded-lg border border-green-300">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-green-800">✅ Processing Complete!</p>
                          <p className="text-xs text-green-600">Your PDF is ready for download</p>
                        </div>
                        <a
                          href={processedPdfUrl}
                          download={`processed-${selectedPdf?.name || 'book'}.pdf`}
                          className="inline-flex items-center px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
                        >
                          📥 Download PDF
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Column - Preview */}
          <Card className="min-h-[600px]">
            <CardContent className="p-6">
              {!showPreview ? (
                <div className="h-full flex items-center justify-center text-center">
                  <div>
                    <p className="text-gray-500 mb-4">Upload files and click "Generate Preview" to see your custom edges</p>
                    <p className="text-xs text-gray-400">• Choose edge image file</p>
                    <p className="text-xs text-gray-400">• Choose PDF file</p>
                    <p className="text-xs text-gray-400">• Select paper type for accurate thickness calculations</p>
                    <p className="text-xs text-gray-400">• Click generate to see the preview with custom edges</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* View Mode Toggle */}
                  <div className="flex gap-2 justify-center">
                    <Button
                      size="sm"
                      variant={viewMode === "2page" ? "default" : "outline"}
                      onClick={() => setViewMode("2page")}
                    >
                      📖 2-Page View
                    </Button>
                    <Button
                      size="sm"
                      variant={viewMode === "shelf" ? "default" : "outline"}
                      onClick={() => setViewMode("shelf")}
                    >
                      📚 Shelf View
                    </Button>
                  </div>

                  {/* 2-Page View */}
                  {viewMode === "2page" && (
                    <div className="relative">
                      {/* Page Navigation */}
                      <div className="flex justify-between items-center mb-4">
                        <Button
                          size="sm"
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 2))}
                          disabled={currentPage <= 1}
                        >
                          ← Previous Spread
                        </Button>
                        <span className="text-sm font-medium">
                          {currentPage === 1 ? "Cover" : `Pages ${currentPage - 1} & ${currentPage}`}
                        </span>
                        <Button
                          size="sm"
                          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 2))}
                          disabled={currentPage >= totalPages}
                        >
                          Next Spread →
                        </Button>
                      </div>

                      {/* 2-Page Spread */}
                      <div className="flex justify-center gap-4 items-center">
                        {/* Left Page */}
                        <div
                          className="relative bg-white border-2 border-gray-300 shadow-lg"
                          style={{
                            width: `${Math.min(bookWidth * 25, 200)}px`,
                            height: `${Math.min(bookHeight * 25, 280)}px`,
                          }}
                        >
                          <div className="h-full bg-white overflow-hidden relative">
                            {currentPage > 1 && pdfPages.length > 0 && pdfPages[currentPage - 2] ? (
                              <img 
                                src={pdfPages[currentPage - 2]} 
                                alt={`PDF page ${currentPage - 1}`} 
                                className="w-full h-full object-contain"
                                style={{ filter: "contrast(1.1) brightness(0.98)" }}
                              />
                            ) : currentPage === 1 ? (
                              <div 
                                className="h-full bg-white flex items-center justify-center"
                                style={{
                                  filter: "contrast(1.1) brightness(0.98)" // Match PDF page filter
                                }}
                              >
                                {/* Blank page before page 1 */}
                              </div>
                            ) : useCustomDimensions ? (
                              <div 
                                className="h-full bg-white flex items-center justify-center"
                                style={{
                                  filter: "contrast(1.1) brightness(0.98)"
                                }}
                              >
                                <div className="text-xs text-gray-400 text-center">
                                  Page {currentPage - 1}<br/>Preview
                                </div>
                              </div>
                            ) : !pdfPages[currentPage - 2] && currentPage <= totalPages ? (
                              <div 
                                className="h-full bg-white flex items-center justify-center"
                                style={{
                                  filter: "contrast(1.1) brightness(0.98)" // Match PDF page filter
                                }}
                              >
                                <div className="text-xs text-gray-500 text-center">
                                  Loading page {currentPage - 1}...
                                </div>
                              </div>
                            ) : null}
                          </div>

                          {/* Left Edge Strip (only if not first page) */}
                          {currentPage > 1 && (
                            <div
                              className="absolute top-0"
                              style={{
                                left: `${Math.max(0.125 * 50, 6)}px`, // Position it to overlay the left page, not outside
                                width: `${Math.max(0.125 * 50, 6)}px`,
                                height: "100%",
                                backgroundImage: `url(${selectedImage})`,
                                backgroundSize: `${totalPages * Math.max(0.125 * 50, 6)}px 100%`, // Size image so each page slice fills the strip width
                                backgroundPosition: `${-(((currentPage-1) - 1) * Math.max(0.125 * 50, 6))}px center`, // Show slice for left page, stretched
                                backgroundRepeat: "no-repeat",
                                transform: "scaleX(-1) skewY(2deg)",
                                transformOrigin: "left center",
                              }}
                            />
                          )}
                        </div>

                        {/* Binding Gutter */}
                        <div className="w-2 bg-gray-400 h-64 rounded-sm shadow-inner"></div>

                        {/* Right Page */}
                        <div
                          className="relative bg-white border-2 border-gray-300 shadow-lg"
                          style={{
                            width: `${Math.min(bookWidth * 25, 200)}px`,
                            height: `${Math.min(bookHeight * 25, 280)}px`,
                          }}
                        >
                          {/* Right Page Content */}
                          <div className="h-full bg-white overflow-hidden relative">
                            {pdfPages.length > 0 && pdfPages[currentPage - 1] ? (
                              <img 
                                src={pdfPages[currentPage - 1]} 
                                alt={`PDF page ${currentPage}`} 
                                className="w-full h-full object-contain"
                                style={{ filter: "contrast(1.1) brightness(0.98)" }}
                              />
                            ) : useCustomDimensions ? (
                              <div 
                                className="h-full bg-white flex items-center justify-center"
                                style={{
                                  filter: "contrast(1.1) brightness(0.98)"
                                }}
                              >
                                <div className="text-xs text-gray-400 text-center">
                                  Page {currentPage}<br/>Preview
                                </div>
                              </div>
                            ) : !pdfPages[currentPage - 1] && currentPage <= totalPages ? (
                              <div 
                                className="h-full bg-white flex items-center justify-center"
                                style={{
                                  filter: "contrast(1.1) brightness(0.98)" // Match PDF page filter
                                }}
                              >
                                <div className="text-xs text-gray-500 text-center">
                                  Loading page {currentPage}...
                                </div>
                              </div>
                            ) : (
                              <div className="px-2 py-3 h-full text-gray-800 text-left text-xs">
                                <div>Page {currentPage} content...</div>
                              </div>
                            )}
                          </div>

                          {/* Right Edge Strip */}
                          <div
                            className="absolute top-0 right-0 h-full border-r border-gray-400"
                            style={{
                              width: `${Math.max(0.125 * 50, 6)}px`,
                              backgroundImage: `url(${selectedImage})`,
                              backgroundSize: `${totalPages * Math.max(0.125 * 50, 6)}px 100%`, // Size image so each page slice fills the strip width
                              backgroundPosition: `${-((currentPage - 1) * Math.max(0.125 * 50, 6))}px center`, // Show slice for right page, stretched
                              backgroundRepeat: "no-repeat",
                              transform: "skewY(-2deg)",
                              transformOrigin: "right center",
                            }}
                          />
                        </div>
                      </div>

                      <div className="text-center mt-4">
                        <div className="text-sm text-gray-600">
                          {currentPage === 1 ? "Front Cover" 
                            : `Pages ${currentPage - 1} & ${currentPage}`
                          } • With Custom Edges
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Shelf View */}
                  {viewMode === "shelf" && selectedImage && (
                    <div className="relative w-full flex justify-center items-center min-h-96 bg-gradient-to-b from-gray-50 to-gray-100 p-6 rounded-lg">
                      {/* Clean Book Mockup using the example image as base */}
                      <div className="relative">
                        
                        {/* Base Book Mockup */}
                        <div className="relative">
                          <img 
                            src="/paperback-3d.png" 
                            alt="Book mockup base" 
                            className="w-auto h-80 object-contain"
                          />
                          
                          {/* Your Custom Edge Image Overlay - Positioned on the book's edge */}
                          <div
                            className="absolute"
                            style={{
                              // Position precisely on the visible book edge
                              width: "4px", // Thinner edge strip to match book thickness
                              height: "220px", // Match the visible book content height
                              left: "78%", // More precise position on the actual book spine
                              top: "18%", // Align with book content area
                              backgroundImage: `url(${selectedImage})`,
                              backgroundSize: "100% 100%", // Stretch to fill the edge strip
                              backgroundPosition: "center",
                              backgroundRepeat: "no-repeat",
                              // Enhanced perspective warping to match the book's 3D angle
                              transform: "perspective(800px) rotateY(-25deg) rotateX(3deg) skewY(-1deg) scaleY(0.92) scaleX(0.8)",
                              transformOrigin: "left center",
                              clipPath: "polygon(0% 2%, 85% 0%, 100% 8%, 100% 92%, 85% 100%, 0% 98%)", // More dramatic taper for 3D effect
                              // Enhanced shadow/depth for realism
                              boxShadow: "inset -3px 0 6px rgba(0,0,0,0.4), 3px 0 8px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.2)"
                            }}
                          />
                        </div>

                        {/* Info Panel */}
                        <div className="absolute -right-48 top-1/2 transform -translate-y-1/2">
                          <div className="bg-white p-4 rounded-lg shadow-lg border max-w-xs">
                            <h3 className="font-semibold text-gray-800 mb-2">Your Custom Edge</h3>
                            <div className="text-sm text-gray-600 space-y-1">
                              <p>📚 {totalPages} pages</p>
                              <p>📐 {bookWidth}" × {bookHeight}"</p>
                              <p>🎨 Custom edge design applied</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-16 mt-16">
          <ThemeSwitcher />
        </footer>
      </div>
    </main>
  );
}
