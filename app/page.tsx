"use client";

import { useState, useEffect, useCallback } from "react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import JSZip from 'jszip';
import { processPDFWithSupabase } from '@/lib/supabase';

export default function Home() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [edgeType, setEdgeType] = useState<"side-only" | "all-edges">("side-only");
  const [topEdgeImage, setTopEdgeImage] = useState<string | null>(null);
  const [topEdgeImageFile, setTopEdgeImageFile] = useState<File | null>(null);
  const [bottomEdgeImage, setBottomEdgeImage] = useState<string | null>(null);
  const [bottomEdgeImageFile, setBottomEdgeImageFile] = useState<File | null>(null);
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

  const handleTopEdgeUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setTopEdgeImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setTopEdgeImage(e.target?.result as string);
        setShowPreview(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBottomEdgeUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setBottomEdgeImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setBottomEdgeImage(e.target?.result as string);
        setShowPreview(false);
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

  const loadMorePages = useCallback(async (startingFromPage: number) => {
    if (!pdfDocument) return;
    
    const endPage = Math.min(startingFromPage + 10, totalPages);
    
    for (let i = startingFromPage; i <= endPage; i++) {
      if (!pdfPages[i - 1]) {
        await loadPage(pdfDocument, i);
      }
    }
  }, [pdfDocument, totalPages, pdfPages]);

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
  }, [currentPage, pdfDocument, totalPages, pdfPages, loadMorePages]);

  const processActualPdf = async () => {
    if (!selectedPdf) return;

    // Validate edge files based on edge type
    if (edgeType === 'side-only' && !selectedImageFile) {
      alert('Please upload a side edge image');
      return;
    }
    if (edgeType === 'all-edges' && (!topEdgeImageFile && !selectedImageFile && !bottomEdgeImageFile)) {
      alert('Please upload at least one edge image (top, side, or bottom)');
      return;
    }

    setIsProcessing(true);
    try {
      // Check if we should use Supabase (when NEXT_PUBLIC_SUPABASE_URL is set)
      const useSupabase = typeof window !== 'undefined' &&
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      // Use Vercel Python API route
      const edgeFiles: any = {};
      if (edgeType === 'side-only') {
        edgeFiles.side = selectedImageFile;
      } else {
        if (topEdgeImageFile) edgeFiles.top = topEdgeImageFile;
        if (selectedImageFile) edgeFiles.side = selectedImageFile;
        if (bottomEdgeImageFile) edgeFiles.bottom = bottomEdgeImageFile;
      }

      const result = await processPDFWithSupabase(
        selectedPdf,
        edgeFiles,
        {
          numPages: totalPages,
          pageType,
          bleedType: bleedType as 'add_bleed' | 'existing_bleed',
          edgeType
        }
      );

      // Convert the result to a data URL for download
      const blob = new Blob([result], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setProcessedPdfUrl(url);
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

  const createTemplate = (width: number, height: number, edgeType: string, rotate: boolean = false) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = width;
    canvas.height = height;

    // Fill with light background
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, width, height);

    // Calculate zones
    const bleedMargin = 0.125 * 300; // 0.125" in pixels at 300 DPI
    const bufferMargin = 0.125 * 300; // Additional 0.125" buffer zone
    
    // Draw bleed zones (50% transparent red)
    ctx.fillStyle = 'rgba(220, 53, 69, 0.5)';
    if (edgeType === 'side') {
      // For side edge: bleed on top and bottom
      ctx.fillRect(0, 0, width, bleedMargin);
      ctx.fillRect(0, height - bleedMargin, width, bleedMargin);
    } else {
      // For top/bottom edge: bleed on left and right
      ctx.fillRect(0, 0, bleedMargin, height);
      ctx.fillRect(width - bleedMargin, 0, bleedMargin, height);
    }
    
    // Draw buffer zones (50% transparent blue)
    ctx.fillStyle = 'rgba(0, 123, 255, 0.5)';
    if (edgeType === 'side') {
      ctx.fillRect(0, bleedMargin, width, bufferMargin);
      ctx.fillRect(0, height - bleedMargin - bufferMargin, width, bufferMargin);
    } else {
      ctx.fillRect(bleedMargin, 0, bufferMargin, height);
      ctx.fillRect(width - bleedMargin - bufferMargin, 0, bufferMargin, height);
    }
    
    // Draw main design area (safe zone) border
    ctx.strokeStyle = '#28a745';
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    if (edgeType === 'side') {
      ctx.strokeRect(0, bleedMargin + bufferMargin, width, height - (2 * (bleedMargin + bufferMargin)));
    } else {
      ctx.strokeRect(bleedMargin + bufferMargin, 0, width - (2 * (bleedMargin + bufferMargin)), height);
    }

    // Add text instructions
    ctx.save();
    ctx.translate(width / 2, height / 2);
    if (rotate) {
      ctx.rotate(Math.PI / 2); // 90 degrees for side templates
    }
    
    // Calculate font sizes based on template dimensions
    const maxDimension = Math.max(width, height);
    const baseFontSize = Math.max(Math.min(maxDimension / 20, 24), 10);
    const smallFontSize = Math.max(Math.min(maxDimension / 25, 18), 8);
    const lineSpacing = baseFontSize * 1.2;
    
    ctx.fillStyle = '#495057';
    ctx.font = `${baseFontSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    
    const edgeName = edgeType.charAt(0).toUpperCase() + edgeType.slice(1);
    ctx.fillText(`${edgeName} Edge Template`, 0, -lineSpacing * 2);
    ctx.fillText(`${width} × ${height}px`, 0, -lineSpacing);
    ctx.fillText(`${bookWidth}" × ${bookHeight}" • ${totalPages}p`, 0, 0);
    
    ctx.font = `${smallFontSize}px Arial, sans-serif`;
    ctx.fillStyle = '#28a745';
    ctx.fillText('Safe area (green)', 0, lineSpacing);
    ctx.fillStyle = '#dc3545';
    ctx.fillText('Bleed (red)', 0, lineSpacing * 2);
    ctx.fillStyle = '#007bff';
    ctx.fillText('Buffer (blue)', 0, lineSpacing * 3);
    
    ctx.restore();

    return canvas.toDataURL('image/png');
  };

  const generateTemplate = async () => {
    const zip = new JSZip();
    
    if (edgeType === "side-only") {
      // Generate only side edge template
      const sideWidth = totalThickness * 300;
      const sideHeight = (bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight) * 300;
      const sideTemplate = createTemplate(sideWidth, sideHeight, 'side', true);
      
      if (sideTemplate) {
        // Remove the data:image/png;base64, prefix
        const base64Data = sideTemplate.split(',')[1];
        zip.file(`side-edge-${bookWidth}x${bookHeight}-${totalPages}pages.png`, base64Data, {base64: true});
      }
    } else {
      // Generate templates for all edges
      const sideWidth = totalThickness * 300;
      const sideHeight = (bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight) * 300;
      const topBottomWidth = (bleedType === "add_bleed" ? bookWidth + 0.25 : bookWidth) * 300;
      const topBottomHeight = totalThickness * 300;
      
      // Create side template
      const sideTemplate = createTemplate(sideWidth, sideHeight, 'side', true);
      if (sideTemplate) {
        const base64Data = sideTemplate.split(',')[1];
        zip.file(`side-edge-${bookWidth}x${bookHeight}-${totalPages}pages.png`, base64Data, {base64: true});
      }
      
      // Create top template
      const topTemplate = createTemplate(topBottomWidth, topBottomHeight, 'top', false);
      if (topTemplate) {
        const base64Data = topTemplate.split(',')[1];
        zip.file(`top-edge-${bookWidth}x${bookHeight}-${totalPages}pages.png`, base64Data, {base64: true});
      }
      
      // Create bottom template
      const bottomTemplate = createTemplate(topBottomWidth, topBottomHeight, 'bottom', false);
      if (bottomTemplate) {
        const base64Data = bottomTemplate.split(',')[1];
        zip.file(`bottom-edge-${bookWidth}x${bookHeight}-${totalPages}pages.png`, base64Data, {base64: true});
      }
    }
    
    // Add README file with instructions
    const readmeContent = `Edge Templates for ${bookWidth}" × ${bookHeight}" Book (${totalPages} pages)

${edgeType === "side-only" ? "Side-only Mode:" : "All-edges Mode:"}
${edgeType === "side-only" ? 
  `- side-edge: ${(totalThickness * 300).toFixed(0)} × ${((bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight) * 300).toFixed(0)}px` :
  `- top-edge: ${((bleedType === "add_bleed" ? bookWidth + 0.25 : bookWidth) * 300).toFixed(0)} × ${(totalThickness * 300).toFixed(0)}px
- side-edge: ${(totalThickness * 300).toFixed(0)} × ${((bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight) * 300).toFixed(0)}px
- bottom-edge: ${((bleedType === "add_bleed" ? bookWidth + 0.25 : bookWidth) * 300).toFixed(0)} × ${(totalThickness * 300).toFixed(0)}px`}

Book Details:
- Dimensions: ${bookWidth}" × ${bookHeight}"
- Pages: ${totalPages} (${numLeaves} leaves)
- Paper Type: ${pageType === "bw" ? "Black & White" : pageType === "standard" ? "Standard Color" : "Premium Color"}
- Total Thickness: ${totalThickness.toFixed(4)}"
- Bleed: ${bleedType === "add_bleed" ? "0.125\" bleed will be added" : "Using existing bleed in PDF"}

Template Color Guide:
- Green border: Safe design area
- Red zones: Bleed area (0.125")
- Blue zones: Buffer area (0.125")

Create your edge designs within the safe area (green) for best results.
The bleed and buffer areas ensure proper coverage during printing and cutting.
`;
    
    zip.file('README.txt', readmeContent);
    
    // Generate and download zip
    try {
      const zipBlob = await zip.generateAsync({type: 'blob'});
      const link = document.createElement('a');
      link.download = `edge-templates-${bookWidth}x${bookHeight}-${totalPages}pages.zip`;
      link.href = URL.createObjectURL(zipBlob);
      link.click();
      
      // Clean up object URL
      setTimeout(() => URL.revokeObjectURL(link.href), 100);
    } catch (error) {
      console.error('Error generating zip:', error);
      alert('Failed to generate template zip file');
    }
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

              {/* Step 2: Edge Type Selection */}
              {((selectedPdf && totalPages > 0) || (useCustomDimensions && totalPages > 0)) && (
                <div className="space-y-3">
                  <Label>2. Choose Edge Type</Label>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <input
                        id="sideOnly"
                        type="radio"
                        name="edgeType"
                        checked={edgeType === "side-only"}
                        onChange={() => setEdgeType("side-only")}
                        className="w-4 h-4 text-blue-600"
                      />
                      <Label htmlFor="sideOnly" className="text-sm">Side edges only</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <input
                        id="allEdges"
                        type="radio"
                        name="edgeType"
                        checked={edgeType === "all-edges"}
                        onChange={() => setEdgeType("all-edges")}
                        className="w-4 h-4 text-blue-600"
                      />
                      <Label htmlFor="allEdges" className="text-sm">All edges (top, side, bottom)</Label>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Options */}
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

              {/* Step 4: Required Image Size (simplified) */}
              {((selectedPdf && totalPages > 0) || (useCustomDimensions && totalPages > 0)) && (
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Required Image Sizes:</p>
                      {edgeType === "side-only" ? (
                        <p className="text-lg font-medium text-blue-700">
                          Side: {(totalThickness * 300).toFixed(0)} × {((bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight) * 300).toFixed(0)}px
                        </p>
                      ) : (
                        <div className="text-sm text-blue-700 space-y-1">
                          <p>Top: {((bleedType === "add_bleed" ? bookWidth + 0.25 : bookWidth) * 300).toFixed(0)} × {(totalThickness * 300).toFixed(0)}px</p>
                          <p>Side: {(totalThickness * 300).toFixed(0)} × {((bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight) * 300).toFixed(0)}px</p>
                          <p>Bottom: {((bleedType === "add_bleed" ? bookWidth + 0.25 : bookWidth) * 300).toFixed(0)} × {(totalThickness * 300).toFixed(0)}px</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const details = edgeType === "side-only" ? 
                            `Required Edge Image Details:

Side Edge Image:
Width: ${(totalThickness * 300).toFixed(0)} pixels (${totalThickness.toFixed(4)}" at 300 DPI)
Height: ${((bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight) * 300).toFixed(0)} pixels (${(bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight).toFixed(2)}" at 300 DPI)

Your PDF: ${totalPages} pages (${numLeaves} leaves), ${bookWidth}" × ${bookHeight}"
Paper: ${pageType === "bw" ? "Black & White" : pageType === "standard" ? "Standard Color" : "Premium Color"}
Bleed: ${bleedType === "add_bleed" ? "Will add 0.125\" bleed" : "Using existing bleed"}

Calculation:
• Width = ${numLeaves} leaves × ${PAGE_THICKNESS[pageType as keyof typeof PAGE_THICKNESS]}" thickness
• Height = ${bookHeight}" ${bleedType === "add_bleed" ? "+ 0.25\" (bleed will be added)" : "(using existing bleed)"}` :

                            `Required Edge Image Details:

Top Edge Image:
Width: ${((bleedType === "add_bleed" ? bookWidth + 0.25 : bookWidth) * 300).toFixed(0)} pixels (${(bleedType === "add_bleed" ? bookWidth + 0.25 : bookWidth).toFixed(2)}" at 300 DPI)
Height: ${(totalThickness * 300).toFixed(0)} pixels (${totalThickness.toFixed(4)}" at 300 DPI)

Side Edge Image:
Width: ${(totalThickness * 300).toFixed(0)} pixels (${totalThickness.toFixed(4)}" at 300 DPI)
Height: ${((bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight) * 300).toFixed(0)} pixels (${(bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight).toFixed(2)}" at 300 DPI)

Bottom Edge Image:
Width: ${((bleedType === "add_bleed" ? bookWidth + 0.25 : bookWidth) * 300).toFixed(0)} pixels (${(bleedType === "add_bleed" ? bookWidth + 0.25 : bookWidth).toFixed(2)}" at 300 DPI)
Height: ${(totalThickness * 300).toFixed(0)} pixels (${totalThickness.toFixed(4)}" at 300 DPI)

Your PDF: ${totalPages} pages (${numLeaves} leaves), ${bookWidth}" × ${bookHeight}"
Paper: ${pageType === "bw" ? "Black & White" : pageType === "standard" ? "Standard Color" : "Premium Color"}
Bleed: ${bleedType === "add_bleed" ? "Will add 0.125\" bleed" : "Using existing bleed"}

Calculations:
• Book thickness = ${numLeaves} leaves × ${PAGE_THICKNESS[pageType as keyof typeof PAGE_THICKNESS]}" thickness = ${totalThickness.toFixed(4)}"
• Top/Bottom width = ${bookWidth}" ${bleedType === "add_bleed" ? "+ 0.25\" (bleed)" : "(existing bleed)"}
• Side height = ${bookHeight}" ${bleedType === "add_bleed" ? "+ 0.25\" (bleed)" : "(existing bleed)"}`;
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
                        📦 Templates
                      </button>
                    </div>
                  </div>
                </div>
              )}


              {/* Step 5: Image Upload(s) */}
              {((selectedPdf && totalPages > 0) || (useCustomDimensions && totalPages > 0)) && (
                <div className="space-y-4">
                  {edgeType === "side-only" ? (
                    <div>
                      <Label htmlFor="sideImage">5. Upload Side Edge Image</Label>
                      <Input
                        id="sideImage"
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                      />
                      {selectedImage && (
                        <p className="text-xs text-green-600 mt-1">✅ Side edge uploaded</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Label>5. Upload Edge Images (choose which edges you want)</Label>
                      
                      <div>
                        <Label htmlFor="topImage" className="text-sm">Top Edge Image <span className="text-gray-500">(optional)</span></Label>
                        <Input
                          id="topImage"
                          type="file"
                          accept="image/*"
                          onChange={handleTopEdgeUpload}
                          className="mt-1"
                        />
                        {topEdgeImage && (
                          <p className="text-xs text-green-600 mt-1">✅ Top edge uploaded</p>
                        )}
                      </div>
                      
                      <div>
                        <Label htmlFor="sideImageAll" className="text-sm">Side Edge Image <span className="text-gray-500">(optional)</span></Label>
                        <Input
                          id="sideImageAll"
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="mt-1"
                        />
                        {selectedImage && (
                          <p className="text-xs text-green-600 mt-1">✅ Side edge uploaded</p>
                        )}
                      </div>
                      
                      <div>
                        <Label htmlFor="bottomImage" className="text-sm">Bottom Edge Image <span className="text-gray-500">(optional)</span></Label>
                        <Input
                          id="bottomImage"
                          type="file"
                          accept="image/*"
                          onChange={handleBottomEdgeUpload}
                          className="mt-1"
                        />
                        {bottomEdgeImage && (
                          <p className="text-xs text-green-600 mt-1">✅ Bottom edge uploaded</p>
                        )}
                      </div>
                      
                      {!topEdgeImage && !selectedImage && !bottomEdgeImage && (
                        <p className="text-xs text-amber-600">Please upload at least one edge image</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Preview Button */}
              {((selectedPdf && totalPages > 0) || (useCustomDimensions && totalPages > 0)) && 
               ((edgeType === "side-only" && selectedImage) || 
                (edgeType === "all-edges" && (selectedImage || topEdgeImage || bottomEdgeImage))) && (
                <Button
                  onClick={generatePreview}
                  variant="outline"
                  className="w-full"
                >
                  📖 Preview
                </Button>
              )}

              {/* Process Button */}
              {((selectedPdf && totalPages > 0) || (useCustomDimensions && totalPages > 0)) && 
               ((edgeType === "side-only" && selectedImage) || 
                (edgeType === "all-edges" && (selectedImage || topEdgeImage || bottomEdgeImage))) && (
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
                      🖼️ Edge Image
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

                          {/* Top Edge Strip for Left Page (only if top edge image is uploaded) */}
                          {edgeType === "all-edges" && topEdgeImage && (
                            <div
                              className="absolute top-0 left-0 w-full border-t border-gray-400"
                              style={{
                                height: `${Math.max(0.125 * 50, 6)}px`,
                                backgroundImage: `url(${topEdgeImage})`,
                                backgroundSize: `100% ${totalPages * Math.max(0.125 * 50, 6)}px`, // Size image so each page slice fills the strip height
                                backgroundPosition: `center ${-(((currentPage-1) - 1) * Math.max(0.125 * 50, 6))}px`, // Show slice for left page, stretched
                                backgroundRepeat: "no-repeat",
                                transform: "scaleX(-1) skewX(1deg)", // Mirror horizontally for left page
                                transformOrigin: "center top",
                                zIndex: 10,
                              }}
                            />
                          )}

                          {/* Bottom Edge Strip for Left Page (only if bottom edge image is uploaded) */}
                          {edgeType === "all-edges" && bottomEdgeImage && (
                            <div
                              className="absolute bottom-0 left-0 w-full border-b border-gray-400"
                              style={{
                                height: `${Math.max(0.125 * 50, 6)}px`,
                                backgroundImage: `url(${bottomEdgeImage})`,
                                backgroundSize: `100% ${totalPages * Math.max(0.125 * 50, 6)}px`, // Size image so each page slice fills the strip height
                                backgroundPosition: `center ${-(((currentPage-1) - 1) * Math.max(0.125 * 50, 6))}px`, // Show slice for left page, stretched
                                backgroundRepeat: "no-repeat",
                                transform: "scaleX(-1) skewX(-1deg)", // Mirror horizontally for left page
                                transformOrigin: "center bottom",
                                zIndex: 10,
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

                          {/* Top Edge Strip (only if top edge image is uploaded) */}
                          {edgeType === "all-edges" && topEdgeImage && (
                            <div
                              className="absolute top-0 left-0 w-full border-t border-gray-400"
                              style={{
                                height: `${Math.max(0.125 * 50, 6)}px`,
                                backgroundImage: `url(${topEdgeImage})`,
                                backgroundSize: `100% ${totalPages * Math.max(0.125 * 50, 6)}px`, // Size image so each page slice fills the strip height
                                backgroundPosition: `center ${-((currentPage - 1) * Math.max(0.125 * 50, 6))}px`, // Show slice for right page
                                backgroundRepeat: "no-repeat",
                                transform: "skewX(1deg)",
                                transformOrigin: "center top",
                                zIndex: 10,
                              }}
                            />
                          )}

                          {/* Bottom Edge Strip (only if bottom edge image is uploaded) */}
                          {edgeType === "all-edges" && bottomEdgeImage && (
                            <div
                              className="absolute bottom-0 left-0 w-full border-b border-gray-400"
                              style={{
                                height: `${Math.max(0.125 * 50, 6)}px`,
                                backgroundImage: `url(${bottomEdgeImage})`,
                                backgroundSize: `100% ${totalPages * Math.max(0.125 * 50, 6)}px`, // Size image so each page slice fills the strip height
                                backgroundPosition: `center ${-((currentPage - 1) * Math.max(0.125 * 50, 6))}px`, // Show slice for right page
                                backgroundRepeat: "no-repeat",
                                transform: "skewX(-1deg)",
                                transformOrigin: "center bottom",
                                zIndex: 10,
                              }}
                            />
                          )}
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

                  {/* Edge Image View */}
                  {viewMode === "shelf" && (selectedImage || topEdgeImage || bottomEdgeImage) && (
                    <div className="w-full bg-gradient-to-b from-gray-50 to-gray-100 p-6 rounded-lg">
                      <div className="flex flex-col items-center space-y-6">
                        <h3 className="text-lg font-medium text-gray-800 mb-4">Your Edge Design</h3>
                        
                        <div className="flex flex-col items-center space-y-4 max-w-4xl w-full">
                          {/* Top Edge */}
                          {topEdgeImage && (
                            <div className="flex flex-col items-center space-y-2">
                              <span className="text-sm font-medium text-gray-600">Top Edge</span>
                              <img 
                                src={topEdgeImage} 
                                alt="Top edge design" 
                                className="max-w-full max-h-32 object-contain rounded-lg shadow-lg border border-gray-200 bg-white"
                              />
                            </div>
                          )}
                          
                          {/* Side Edge */}
                          {selectedImage && (
                            <div className="flex flex-col items-center space-y-2">
                              <span className="text-sm font-medium text-gray-600">Side Edge</span>
                              <img 
                                src={selectedImage} 
                                alt="Side edge design" 
                                className="max-w-full max-h-64 object-contain rounded-lg shadow-lg border border-gray-200 bg-white"
                              />
                            </div>
                          )}
                          
                          {/* Bottom Edge */}
                          {bottomEdgeImage && (
                            <div className="flex flex-col items-center space-y-2">
                              <span className="text-sm font-medium text-gray-600">Bottom Edge</span>
                              <img 
                                src={bottomEdgeImage} 
                                alt="Bottom edge design" 
                                className="max-w-full max-h-32 object-contain rounded-lg shadow-lg border border-gray-200 bg-white"
                              />
                            </div>
                          )}
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
