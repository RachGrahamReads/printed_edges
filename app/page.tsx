"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { processPDFWithChunking } from '@/lib/process-with-chunking';
import JSZip from 'jszip';

export default function Home() {
  const [sideEdgeImage, setSideEdgeImage] = useState<string | null>(null);
  const [sideEdgeImageFile, setSideEdgeImageFile] = useState<File | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const edgeType = "all-edges"; // Always use all-edges mode with mitred corners
  const [scaleMode, setScaleMode] = useState<'stretch' | 'fit' | 'fill' | 'none' | 'extend-sides'>('fill');
  const [showScaleModeInfo, setShowScaleModeInfo] = useState(false);
  const scaleModeInfoRef = useRef<HTMLDivElement>(null);
  const topEdgeCanvasRef = useRef<HTMLCanvasElement>(null);
  const sideEdgeCanvasRef = useRef<HTMLCanvasElement>(null);
  const bottomEdgeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [topEdgeImage, setTopEdgeImage] = useState<string | null>(null);
  const [topEdgeImageFile, setTopEdgeImageFile] = useState<File | null>(null);
  const [bottomEdgeImage, setBottomEdgeImage] = useState<string | null>(null);
  const [bottomEdgeImageFile, setBottomEdgeImageFile] = useState<File | null>(null);
  const [bookWidth, setBookWidth] = useState(6); // inches (auto-detected)
  const [bookHeight, setBookHeight] = useState(9); // inches (auto-detected)
  const [bleedType, setBleedType] = useState("add_bleed"); // "add_bleed" or "existing_bleed"
  const [showPreview, setShowPreview] = useState(false);
  const [viewMode, setViewMode] = useState<"2page" | "shelf" | "actual">("2page");
  const [processedPdfUrl, setProcessedPdfUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [useCustomDimensions, setUseCustomDimensions] = useState(false);

  const numLeaves = Math.ceil(totalPages / 2);

  // Edge preview rendering function
  const renderEdgePreview = useCallback((
    imageUrl: string,
    edgeType: 'side' | 'top' | 'bottom',
    canvasRef: React.RefObject<HTMLCanvasElement | null>
  ) => {
    // Use requestAnimationFrame for better timing
    requestAnimationFrame(() => {
      if (!canvasRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      try {
        // Set proportional canvas dimensions based on book dimensions and page count first
        if (edgeType === 'side') {
          // Side edge: height proportional to book dimensions, variable width based on page count
          canvas.height = (bookHeight / bookWidth) * 300;
          const actualRatio = numLeaves / (bookHeight * 285.7);
          canvas.width = Math.max(actualRatio * canvas.height, 20); // minimum 20px width
        } else {
          // Top/bottom edge: fixed width, variable height based on page count ratio
          canvas.width = 300;
          const actualRatio = numLeaves / (bookWidth * 285.7);
          canvas.height = Math.max(actualRatio * 300, 20); // minimum 20px height
        }

        // Clear canvas and show loading state
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Show loading text
        ctx.fillStyle = '#6b7280';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Loading...', canvas.width / 2, canvas.height / 2);

        const img = new Image();

        img.onload = () => {
          try {
            // Clear canvas again
            ctx.fillStyle = '#f8f9fa';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Apply scale mode logic
            let drawWidth, drawHeight, drawX, drawY;

            switch (scaleMode) {
              case 'stretch':
                // Stretch to fill entire canvas
                drawWidth = canvas.width;
                drawHeight = canvas.height;
                drawX = 0;
                drawY = 0;
                break;

              case 'fill':
                // Scale to fill while maintaining aspect ratio (may crop)
                const fillScale = Math.max(canvas.width / img.width, canvas.height / img.height);
                drawWidth = img.width * fillScale;
                drawHeight = img.height * fillScale;
                drawX = (canvas.width - drawWidth) / 2;
                drawY = (canvas.height - drawHeight) / 2;
                break;

              case 'fit':
                // Scale to fit while maintaining aspect ratio (may have empty space)
                const fitScale = Math.min(canvas.width / img.width, canvas.height / img.height);
                drawWidth = img.width * fitScale;
                drawHeight = img.height * fitScale;
                drawX = (canvas.width - drawWidth) / 2;
                drawY = (canvas.height - drawHeight) / 2;
                break;

              case 'none':
                // Show image size relative to actual book edge dimensions
                // Calculate actual book edge dimensions at 285.7 DPI
                const actualEdgeWidth = edgeType === 'side' ?
                  numLeaves :
                  Math.round(bookWidth * 285.7);
                const actualEdgeHeight = edgeType === 'side' ?
                  Math.round(bookHeight * 285.7) :
                  numLeaves;

                // Calculate what portion of the actual edge the image covers
                const imageToEdgeRatioX = img.width / actualEdgeWidth;
                const imageToEdgeRatioY = img.height / actualEdgeHeight;

                // Apply that ratio to our canvas
                drawWidth = imageToEdgeRatioX * canvas.width;
                drawHeight = imageToEdgeRatioY * canvas.height;
                drawX = (canvas.width - drawWidth) / 2;
                drawY = (canvas.height - drawHeight) / 2;
                break;

              case 'extend-sides':
                // Apply 'fit' logic first to get centered content
                const extendFitScale = Math.min(canvas.width / img.width, canvas.height / img.height);
                const fittedWidth = img.width * extendFitScale;
                const fittedHeight = img.height * extendFitScale;
                const fittedX = (canvas.width - fittedWidth) / 2;
                const fittedY = (canvas.height - fittedHeight) / 2;

                // Draw the fitted content
                ctx.drawImage(img, fittedX, fittedY, fittedWidth, fittedHeight);

                // Extend edges to fill remaining space
                if (fittedX > 0) {
                  // Extend left edge
                  ctx.drawImage(img, 0, 0, 1, img.height, 0, fittedY, fittedX, fittedHeight);
                  // Extend right edge
                  ctx.drawImage(img, img.width - 1, 0, 1, img.height, fittedX + fittedWidth, fittedY, canvas.width - fittedX - fittedWidth, fittedHeight);
                }
                if (fittedY > 0) {
                  // Extend top edge
                  ctx.drawImage(img, 0, 0, img.width, 1, 0, 0, canvas.width, fittedY);
                  // Extend bottom edge
                  ctx.drawImage(img, 0, img.height - 1, img.width, 1, 0, fittedY + fittedHeight, canvas.width, canvas.height - fittedY - fittedHeight);
                }
                return; // Skip the main drawImage call below

              default:
                drawWidth = canvas.width;
                drawHeight = canvas.height;
                drawX = 0;
                drawY = 0;
            }

            // Draw the image (except for extend-sides which handles its own drawing)
            ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
          } catch (error) {
            console.error('Error drawing image to canvas:', error);
            // Show error state
            ctx.fillStyle = '#f8f9fa';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#ef4444';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Error loading image', canvas.width / 2, canvas.height / 2);
          }
        };

        img.onerror = () => {
          console.error('Failed to load image:', imageUrl);
          // Show error state
          ctx.fillStyle = '#f8f9fa';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#ef4444';
          ctx.font = '12px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('Failed to load image', canvas.width / 2, canvas.height / 2);
        };

        img.src = imageUrl;
      } catch (error) {
        console.error('Error in renderEdgePreview:', error);
      }
    });
  }, [scaleMode, numLeaves, bookWidth, bookHeight, bleedType]);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSideEdgeImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setSideEdgeImage(e.target?.result as string);
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

  // Close scale mode info when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (scaleModeInfoRef.current && !scaleModeInfoRef.current.contains(event.target as Node)) {
        setShowScaleModeInfo(false);
      }
    }

    if (showScaleModeInfo) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showScaleModeInfo]);

  // Update edge previews when images or scale mode changes
  useEffect(() => {
    if (topEdgeImage && numLeaves > 0) {
      renderEdgePreview(topEdgeImage, 'top', topEdgeCanvasRef);
    }
  }, [topEdgeImage, scaleMode, numLeaves, bookWidth, bookHeight, bleedType, showPreview, viewMode, renderEdgePreview]);

  useEffect(() => {
    if (sideEdgeImage && numLeaves > 0) {
      renderEdgePreview(sideEdgeImage, 'side', sideEdgeCanvasRef);
    }
  }, [sideEdgeImage, scaleMode, numLeaves, bookWidth, bookHeight, bleedType, showPreview, viewMode, renderEdgePreview]);

  useEffect(() => {
    if (bottomEdgeImage && numLeaves > 0) {
      renderEdgePreview(bottomEdgeImage, 'bottom', bottomEdgeCanvasRef);
    }
  }, [bottomEdgeImage, scaleMode, numLeaves, bookWidth, bookHeight, bleedType, showPreview, viewMode, renderEdgePreview]);

  const processActualPdf = async () => {
    if (!selectedPdf) return;

    // Validate that at least one edge image is uploaded
    if (!topEdgeImageFile && !sideEdgeImageFile && !bottomEdgeImageFile) {
      alert('Please upload at least one edge image (top, side, or bottom)');
      return;
    }

    setIsProcessing(true);
    try {
      // Using Supabase for processing (production setup)

      // Prepare edge files (always all-edges mode)
      const edgeFiles: any = {};
      if (topEdgeImageFile) edgeFiles.top = topEdgeImageFile;
      if (sideEdgeImageFile) edgeFiles.side = sideEdgeImageFile;
      if (bottomEdgeImageFile) edgeFiles.bottom = bottomEdgeImageFile;

      // Use chunking workflow for all PDFs (now with storage-based slicing)
      const result = await processPDFWithChunking(
        selectedPdf,
        edgeFiles,
        {
          numPages: totalPages,
          pageType: 'standard', // Fixed value since we no longer use page type calculations
          bleedType: bleedType as 'add_bleed' | 'existing_bleed',
          edgeType,
          trimWidth: bookWidth,
          trimHeight: bookHeight,
          scaleMode
        },
        (progress) => setProcessingProgress(progress)
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

  // Preview helper functions that match the real PDF processing logic
  const calculatePreviewSamplingRegion = useCallback((
    imgWidth: number,
    imgHeight: number,
    numLeaves: number,
    orientation: 'vertical' | 'horizontal',
    scaleMode: 'stretch' | 'fit' | 'fill' | 'none' | 'extend-sides',
    centerMode: 'start' | 'center' | 'end' = 'center'
  ) => {
    if (scaleMode === 'stretch') {
      // Use entire image, stretched to fit
      return { x: 0, y: 0, width: imgWidth, height: imgHeight };
    }

    if (scaleMode === 'none') {
      // Use image as-is, just apply centering
      if (orientation === 'vertical') {
        const startX = centerMode === 'start' ? 0 :
                      centerMode === 'end' ? Math.max(0, imgWidth - numLeaves) :
                      Math.max(0, Math.floor((imgWidth - numLeaves) / 2));
        return {
          x: startX,
          y: 0,
          width: Math.min(numLeaves, imgWidth),
          height: imgHeight
        };
      } else {
        const startY = centerMode === 'start' ? 0 :
                      centerMode === 'end' ? Math.max(0, imgHeight - numLeaves) :
                      Math.max(0, Math.floor((imgHeight - numLeaves) / 2));
        return {
          x: 0,
          y: startY,
          width: imgWidth,
          height: Math.min(numLeaves, imgHeight)
        };
      }
    }

    if (scaleMode === 'fit') {
      // Scale to fit within required dimensions while maintaining aspect ratio
      if (orientation === 'vertical') {
        // For side edges: scale to fit within both numLeaves width AND imgHeight constraint
        const scaleX = numLeaves / imgWidth;
        const scaleY = 1; // No height constraint for side edges typically
        const scale = Math.min(scaleX, scaleY, 1); // Don't upscale

        const fittedWidth = imgWidth * scale;
        const fittedHeight = imgHeight * scale;

        // Center the fitted content
        const startX = Math.max(0, Math.floor((imgWidth - fittedWidth) / 2));
        const startY = Math.max(0, Math.floor((imgHeight - fittedHeight) / 2));

        return { x: startX, y: startY, width: fittedWidth, height: fittedHeight };
      } else {
        // For top/bottom edges: scale to fit within both imgWidth AND numLeaves height constraint
        const scaleX = 1; // No width constraint for top/bottom edges typically
        const scaleY = numLeaves / imgHeight;
        const scale = Math.min(scaleX, scaleY, 1); // Don't upscale

        const fittedWidth = imgWidth * scale;
        const fittedHeight = imgHeight * scale;

        // Center the fitted content
        const startX = Math.max(0, Math.floor((imgWidth - fittedWidth) / 2));
        const startY = Math.max(0, Math.floor((imgHeight - fittedHeight) / 2));

        return { x: startX, y: startY, width: fittedWidth, height: fittedHeight };
      }
    }

    // 'fill' mode: scale to fill exactly, maintaining aspect ratio (may crop)
    if (scaleMode === 'fill') {
      if (orientation === 'vertical') {
        // For side edges: scale to fill numLeaves width, may crop height
        const scaleToFillWidth = numLeaves / imgWidth;
        const scaledHeight = imgHeight * scaleToFillWidth;

        // Center vertically if scaled height is larger than available
        const startY = scaledHeight > imgHeight ?
          Math.floor((scaledHeight - imgHeight) / 2) : 0;

        return { x: 0, y: startY, width: numLeaves, height: imgHeight };
      } else {
        // For top/bottom edges: scale to fill numLeaves height, may crop width
        const scaleToFillHeight = numLeaves / imgHeight;
        const scaledWidth = imgWidth * scaleToFillHeight;

        // Center horizontally if scaled width is larger than available
        const startX = scaledWidth > imgWidth ?
          Math.floor((scaledWidth - imgWidth) / 2) : 0;

        return { x: startX, y: 0, width: imgWidth, height: numLeaves };
      }
    }

    // 'extend-sides' mode: like fit, but will extend edges to fill gaps
    if (orientation === 'vertical') {
      // Use fit logic for the core content
      const scaleX = numLeaves / imgWidth;
      const scale = Math.min(scaleX, 1);
      const fittedWidth = imgWidth * scale;

      // Center the fitted content
      const startX = Math.max(0, Math.floor((imgWidth - fittedWidth) / 2));

      return { x: startX, y: 0, width: fittedWidth, height: imgHeight };
    } else {
      // Use fit logic for the core content
      const scaleY = numLeaves / imgHeight;
      const scale = Math.min(scaleY, 1);
      const fittedHeight = imgHeight * scale;

      // Center the fitted content
      const startY = Math.max(0, Math.floor((imgHeight - fittedHeight) / 2));

      return { x: 0, y: startY, width: imgWidth, height: fittedHeight };
    }
  }, []);

  const calculatePreviewContentRange = useCallback((
    samplingRegion: { x: number; y: number; width: number; height: number },
    numLeaves: number,
    orientation: 'vertical' | 'horizontal',
    scaleMode: 'stretch' | 'fit' | 'fill' | 'none' | 'extend-sides'
  ) => {
    // For 'stretch' and 'fill': all leaves have content
    if (scaleMode === 'stretch' || scaleMode === 'fill') {
      return { start: 0, end: numLeaves - 1, effectiveLeaves: numLeaves };
    }

    // For 'extend-sides': calculate fit content range, then extend to fill all leaves
    if (scaleMode === 'extend-sides') {
      // Calculate how many leaves would fit within the sampling region (like 'fit' mode)
      const effectiveLeaves = orientation === 'vertical'
        ? Math.min(samplingRegion.width, numLeaves)
        : Math.min(samplingRegion.height, numLeaves);

      // Center the content within the total number of leaves
      const contentStart = Math.floor((numLeaves - effectiveLeaves) / 2);
      const contentEnd = contentStart + effectiveLeaves - 1;

      return { start: contentStart, end: contentEnd, effectiveLeaves };
    }

    // For 'fit' and 'none': calculate actual content range
    if (orientation === 'vertical') {
      // For side edges: calculate how many leaves the fitted image actually covers
      // samplingRegion.width is the fitted image width in pixels
      // numLeaves is the total leaves needed (1 pixel per leaf in ideal case)
      const effectiveLeaves = Math.min(Math.floor(samplingRegion.width), numLeaves);

      // Center the content within available leaves
      const contentStart = Math.floor((numLeaves - effectiveLeaves) / 2);
      const contentEnd = contentStart + effectiveLeaves - 1;

      return { start: contentStart, end: Math.max(contentStart, contentEnd), effectiveLeaves };
    } else {
      // For top/bottom edges: calculate how many leaves the fitted image actually covers
      // samplingRegion.height is the fitted image height in pixels
      // numLeaves is the total leaves needed (1 pixel per leaf in ideal case)
      const effectiveLeaves = Math.min(Math.floor(samplingRegion.height), numLeaves);

      // Center the content within available leaves
      const contentStart = Math.floor((numLeaves - effectiveLeaves) / 2);
      const contentEnd = contentStart + effectiveLeaves - 1;

      return { start: contentStart, end: Math.max(contentStart, contentEnd), effectiveLeaves };
    }
  }, []);

  const calculatePreviewLeafPosition = useCallback((
    leafIndex: number,
    numLeaves: number,
    contentRange: { start: number; end: number; effectiveLeaves: number },
    scaleMode: 'stretch' | 'fit' | 'fill' | 'none' | 'extend-sides'
  ) => {
    if (scaleMode === 'extend-sides') {
      // For extend-sides: map content leaves within sampling region, extend edges to fill
      if (leafIndex < contentRange.start) {
        // Before content: use first pixel (0.0) of the sampling region
        return 0.0;
      } else if (leafIndex > contentRange.end) {
        // After content: use last pixel (1.0) of the sampling region
        return 1.0;
      } else {
        // Within content: map proportionally within the sampling region
        const contentLeafIndex = leafIndex - contentRange.start;
        const totalContentLeaves = contentRange.effectiveLeaves;
        return totalContentLeaves > 1 ? contentLeafIndex / (totalContentLeaves - 1) : 0.5;
      }
    } else {
      // Standard behavior for other modes
      return leafIndex / Math.max(1, numLeaves - 1);
    }
  }, []);

  // Helper function that simulates 1px slice extraction for preview
  const getEdgeBackgroundStyle = useCallback((
    edgeType: 'side' | 'top' | 'bottom',
    imageUrl: string,
    pageIndex: number,
    stripWidth: number,
    stripHeight: number
  ) => {
    // Calculate which leaf this page belongs to (2 pages per leaf)
    const leafIndex = Math.floor(pageIndex / 2);

    // Simulate realistic image dimensions that differ from "perfect" requirements
    // This allows scale modes to show different behaviors
    const actualImageWidth = edgeType === 'side' ?
      Math.max(numLeaves * 1.5, 100) : // Side image wider than needed (common scenario)
      ((bleedType === "add_bleed" ? bookWidth + 0.25 : bookWidth) * 285.7 * 1.2); // Top/bottom wider than needed

    const actualImageHeight = edgeType === 'side' ?
      ((bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight) * 285.7 * 0.8) : // Side image shorter than ideal
      Math.max(numLeaves * 1.8, 80); // Top/bottom taller than needed

    const orientation = edgeType === 'side' ? 'vertical' : 'horizontal';

    // Calculate sampling region - what part of the actual image we use
    const samplingRegion = calculatePreviewSamplingRegion(
      actualImageWidth,
      actualImageHeight,
      numLeaves,
      orientation,
      scaleMode
    );

    // Calculate content range - which leaves have content vs empty
    const contentRange = calculatePreviewContentRange(
      samplingRegion,
      numLeaves,
      orientation,
      scaleMode
    );

    // Check if this leaf is outside content range (for fit/none modes)
    if ((scaleMode === 'fit' || scaleMode === 'none') &&
        (leafIndex < contentRange.start || leafIndex > contentRange.end)) {
      // Return empty/transparent style for leaves outside content range
      return {
        backgroundColor: 'transparent',
        backgroundImage: 'none'
      };
    }

    // Calculate leaf position within the sampling region
    const leafPosition = calculatePreviewLeafPosition(
      leafIndex,
      numLeaves,
      contentRange,
      scaleMode
    );

    const baseStyles: React.CSSProperties = {
      backgroundImage: `url(${imageUrl})`
    };

    if (edgeType === 'side') {
      // For side edges: extract 1px vertical slice and tile horizontally

      // Calculate the exact pixel position within the sampling region
      const slicePixelX = samplingRegion.x + (leafPosition * samplingRegion.width);

      // Scale the image to a reasonable size that allows pixel-level precision
      // We want each pixel in the image to be distinguishable in the preview
      const pixelScale = Math.max(2, stripWidth / 4); // Make each image pixel at least 2-4 preview pixels wide
      const scaledImageWidth = actualImageWidth * pixelScale;
      const backgroundPosX = -(slicePixelX * pixelScale);

      baseStyles.backgroundSize = `${scaledImageWidth}px ${stripHeight}px`;
      baseStyles.backgroundPosition = `${backgroundPosX}px center`;
      baseStyles.backgroundRepeat = 'repeat-x'; // Tile the 1px slice horizontally

      // Special handling for extend-sides mode
      if (scaleMode === 'extend-sides' &&
          (leafIndex < contentRange.start || leafIndex > contentRange.end)) {
        // Use edge pixels for extend-sides
        const edgePixelX = leafIndex < contentRange.start ?
          samplingRegion.x :
          samplingRegion.x + samplingRegion.width - 1;
        const edgeBackgroundPosX = -(edgePixelX * pixelScale);
        baseStyles.backgroundPosition = `${edgeBackgroundPosX}px center`;
      }
    } else {
      // For top/bottom edges: extract 1px horizontal slice and tile vertically

      // Calculate the exact pixel position within the sampling region
      const slicePixelY = samplingRegion.y + (leafPosition * samplingRegion.height);

      // Scale the image to a reasonable size that allows pixel-level precision
      // We want each pixel in the image to be distinguishable in the preview
      const pixelScale = Math.max(2, stripHeight / 4); // Make each image pixel at least 2-4 preview pixels tall
      const scaledImageHeight = actualImageHeight * pixelScale;
      const backgroundPosY = -(slicePixelY * pixelScale);

      baseStyles.backgroundSize = `${stripWidth}px ${scaledImageHeight}px`;
      baseStyles.backgroundPosition = `center ${backgroundPosY}px`;
      baseStyles.backgroundRepeat = 'repeat-y'; // Tile the 1px slice vertically

      // Special handling for extend-sides mode
      if (scaleMode === 'extend-sides' &&
          (leafIndex < contentRange.start || leafIndex > contentRange.end)) {
        // Use edge pixels for extend-sides
        const edgePixelY = leafIndex < contentRange.start ?
          samplingRegion.y :
          samplingRegion.y + samplingRegion.height - 1;
        const edgeBackgroundPosY = -(edgePixelY * pixelScale);
        baseStyles.backgroundPosition = `center ${edgeBackgroundPosY}px`;
      }
    }

    return baseStyles;
  }, [scaleMode, numLeaves, bookWidth, bookHeight, bleedType, calculatePreviewSamplingRegion, calculatePreviewContentRange, calculatePreviewLeafPosition]);


  const generateTemplate = async () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use the new 285.7 DPI calculation (1/0.0035" thickness)
    const DPI = 285.7;

    // For side edges: width = numLeaves pixels, height = book height at 285.7 DPI
    const sideTemplateWidth = numLeaves;
    const sideTemplateHeight = Math.round((bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight) * DPI);

    // For top/bottom edges: width = book width at 285.7 DPI, height = numLeaves pixels
    const topBottomTemplateWidth = Math.round((bleedType === "add_bleed" ? bookWidth + 0.25 : bookWidth) * DPI);
    const topBottomTemplateHeight = numLeaves;

    // Generate side edge template
    canvas.width = sideTemplateWidth;
    canvas.height = sideTemplateHeight;

    // Fill with light background
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, sideTemplateWidth, sideTemplateHeight);

    // Calculate zone sizes at 285.7 DPI
    const bleedZonePixels = Math.round(0.125 * DPI); // 0.125" bleed zone in pixels (~36px)
    const safetyZonePixels = Math.round(0.125 * DPI); // 0.125" safety zone in pixels (~36px)

    // Draw bleed zones (red - will be cut off) for side template
    ctx.fillStyle = 'rgba(220, 53, 69, 0.5)'; // Red with 50% opacity
    // Top bleed zone
    ctx.fillRect(0, 0, sideTemplateWidth, bleedZonePixels);
    // Bottom bleed zone
    ctx.fillRect(0, sideTemplateHeight - bleedZonePixels, sideTemplateWidth, bleedZonePixels);

    // Draw safety zones (blue - may be cut off) for side template
    ctx.fillStyle = 'rgba(0, 123, 255, 0.5)'; // Blue with 50% opacity
    // Top safety zone
    ctx.fillRect(0, bleedZonePixels, sideTemplateWidth, safetyZonePixels);
    // Bottom safety zone
    ctx.fillRect(0, sideTemplateHeight - bleedZonePixels - safetyZonePixels, sideTemplateWidth, safetyZonePixels);

    // Draw pixel grid for side template (if width is reasonable for grid display)
    if (sideTemplateWidth <= 100) {
      ctx.strokeStyle = '#dee2e6';
      ctx.lineWidth = 1;
      for (let x = 0; x <= sideTemplateWidth; x++) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, sideTemplateHeight);
        ctx.stroke();
      }
    }

    // Add instructions text with dynamic sizing
    ctx.fillStyle = '#495057';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(sideTemplateWidth / 2, sideTemplateHeight / 2);
    ctx.rotate(Math.PI / 2); // 90 degrees

    // Calculate appropriate font size based on template height (rotated, so height becomes available width)
    const availableWidth = sideTemplateHeight * 0.8; // Use 80% of height for text
    const baseFontSize = Math.max(Math.min(availableWidth / 40, 12), 8); // Scale font, min 8px, max 12px
    ctx.font = `${baseFontSize}px Arial`;

    // Check if we need single line layout (for narrow templates)
    if (sideTemplateHeight < 200) {
      // Single line layout for small templates
      ctx.fillText(`Side Edge Template: ${bookHeight}" tall, ${totalPages}pg | ${sideTemplateWidth}×${sideTemplateHeight}px | Blue: safety | Red: bleed`, 0, 0);
    } else {
      // Multi-line layout for larger templates
      const lineSpacing = baseFontSize * 1.4;
      ctx.fillText(`Side Edge Template for ${bookHeight}" tall, ${totalPages} page book`, 0, -lineSpacing * 1.5);
      ctx.fillText(`${sideTemplateWidth}×${sideTemplateHeight}px`, 0, -lineSpacing * 0.5);
      ctx.fillText(`Blue: safety margin, may be cut off`, 0, lineSpacing * 0.5);
      ctx.fillText(`Red: bleed zone, will be cut off`, 0, lineSpacing * 1.5);
    }
    ctx.restore();

    // Store side template canvas data for ZIP
    const sideTemplateData = canvas.toDataURL('image/png').split(',')[1]; // Get base64 data without prefix

    // Generate top/bottom template
    canvas.width = topBottomTemplateWidth;
    canvas.height = topBottomTemplateHeight;

    // Fill with light background
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, topBottomTemplateWidth, topBottomTemplateHeight);

    // Draw bleed zones (red - will be cut off) for top/bottom template
    ctx.fillStyle = 'rgba(220, 53, 69, 0.5)'; // Red with 50% opacity
    // Right bleed zone (outer edge)
    ctx.fillRect(topBottomTemplateWidth - bleedZonePixels, 0, bleedZonePixels, topBottomTemplateHeight);

    // Draw safety zones (blue - may be cut off) for top/bottom template
    ctx.fillStyle = 'rgba(0, 123, 255, 0.5)'; // Blue with 50% opacity
    // Left safety zone (binding edge - no bleed zone here)
    ctx.fillRect(0, 0, safetyZonePixels, topBottomTemplateHeight);
    // Right safety zone (next to bleed zone)
    ctx.fillRect(topBottomTemplateWidth - bleedZonePixels - safetyZonePixels, 0, safetyZonePixels, topBottomTemplateHeight);

    // Draw pixel grid for top/bottom template (if height is reasonable for grid display)
    if (topBottomTemplateHeight <= 100) {
      ctx.strokeStyle = '#dee2e6';
      ctx.lineWidth = 1;
      for (let y = 0; y <= topBottomTemplateHeight; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(topBottomTemplateWidth, y);
        ctx.stroke();
      }
    }

    // Add instructions text with dynamic sizing
    ctx.fillStyle = '#495057';
    ctx.textAlign = 'center';

    // Calculate appropriate font size based on template height
    const topBottomFontSize = Math.max(Math.min(topBottomTemplateHeight * 0.15, 12), 8); // Scale font, min 8px, max 12px
    ctx.font = `${topBottomFontSize}px Arial`;

    // Check if we need single line layout (for very short templates)
    if (topBottomTemplateHeight < 40) {
      // Single line layout for very small templates
      ctx.fillText(`Top/Bottom Edge: ${bookWidth}" wide, ${totalPages}pg | ${topBottomTemplateWidth}×${topBottomTemplateHeight}px | Blue: safety | Red: bleed`, topBottomTemplateWidth / 2, topBottomTemplateHeight / 2);
    } else if (topBottomTemplateHeight < 80) {
      // Two line layout for small templates
      ctx.fillText(`Top/Bottom Edge: ${bookWidth}" wide, ${totalPages}pg | ${topBottomTemplateWidth}×${topBottomTemplateHeight}px`, topBottomTemplateWidth / 2, topBottomTemplateHeight / 2 - topBottomFontSize * 0.7);
      ctx.fillText(`Blue: safety margin | Red: bleed zone`, topBottomTemplateWidth / 2, topBottomTemplateHeight / 2 + topBottomFontSize * 0.7);
    } else {
      // Multi-line layout for larger templates
      const lineSpacing = topBottomFontSize * 1.4;
      ctx.fillText(`Top/Bottom Edge Template for ${bookWidth}" wide, ${totalPages} page book`, topBottomTemplateWidth / 2, topBottomTemplateHeight / 2 - lineSpacing * 1.5);
      ctx.fillText(`${topBottomTemplateWidth}×${topBottomTemplateHeight}px`, topBottomTemplateWidth / 2, topBottomTemplateHeight / 2 - lineSpacing * 0.5);
      ctx.fillText(`Blue: safety margin, may be cut off`, topBottomTemplateWidth / 2, topBottomTemplateHeight / 2 + lineSpacing * 0.5);
      ctx.fillText(`Red: bleed zone, will be cut off`, topBottomTemplateWidth / 2, topBottomTemplateHeight / 2 + lineSpacing * 1.5);
    }

    // Store top/bottom template canvas data for ZIP
    const topBottomTemplateData = canvas.toDataURL('image/png').split(',')[1]; // Get base64 data without prefix

    // Create ZIP file with both templates
    const zip = new JSZip();
    zip.file(`side-edge-template-${sideTemplateWidth}x${sideTemplateHeight}.png`, sideTemplateData, { base64: true });
    zip.file(`top-bottom-edge-template-${topBottomTemplateWidth}x${topBottomTemplateHeight}.png`, topBottomTemplateData, { base64: true });

    // Generate and download ZIP
    zip.generateAsync({ type: 'blob' }).then((content) => {
      const zipLink = document.createElement('a');
      zipLink.href = URL.createObjectURL(content);
      zipLink.download = `edge-templates-${bookWidth}x${bookHeight}-${totalPages}pages.zip`;
      zipLink.click();
      URL.revokeObjectURL(zipLink.href); // Clean up
    });
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
                      className="ml-6 max-w-[calc(100%-2rem)]"
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


                  <div className="relative">
                    <div className="flex items-center space-x-2">
                      <Label htmlFor="scaleMode" className="text-sm">Edge Image Scaling</Label>
                      <button
                        type="button"
                        onClick={() => setShowScaleModeInfo(!showScaleModeInfo)}
                        className="w-4 h-4 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center hover:bg-blue-600"
                        title="Click for scaling mode information"
                      >
                        ?
                      </button>
                    </div>
                    <select
                      id="scaleMode"
                      value={scaleMode}
                      onChange={(e) => setScaleMode(e.target.value as 'stretch' | 'fit' | 'fill' | 'none' | 'extend-sides')}
                      className="w-full px-3 py-1 text-sm border border-gray-300 rounded-md"
                    >
                      <option value="fill">Fill (recommended) - Crop to fit perfectly</option>
                      <option value="stretch">Stretch - Use entire image, may distort</option>
                      <option value="fit">Fit - Show entire image, may have gaps</option>
                      <option value="extend-sides">Extend Sides - Center image, extend edges</option>
                      <option value="none">None - Use image as-is</option>
                    </select>

                    {/* Information popup */}
                    {showScaleModeInfo && (
                      <div
                        ref={scaleModeInfoRef}
                        className="absolute top-full left-0 mt-2 p-4 bg-white border border-gray-300 rounded-lg shadow-lg z-10 w-80"
                      >
                        <div className="space-y-3">
                          <div className="border-b pb-2">
                            <h4 className="font-semibold text-sm">Edge Image Scaling Modes</h4>
                          </div>

                          <div>
                            <p className="font-medium text-xs text-green-700">✨ Fill (Recommended)</p>
                            <p className="text-xs text-gray-600">Scales your image to perfectly fit the required dimensions. May crop parts of the image but ensures optimal coverage.</p>
                          </div>

                          <div>
                            <p className="font-medium text-xs text-blue-700">🔄 Stretch</p>
                            <p className="text-xs text-gray-600">Uses your entire image but may distort proportions to fit the exact dimensions needed.</p>
                          </div>

                          <div>
                            <p className="font-medium text-xs text-purple-700">📐 Fit</p>
                            <p className="text-xs text-gray-600">Shows your entire image without cropping, but may leave gaps if proportions don't match.</p>
                          </div>

                          <div>
                            <p className="font-medium text-xs text-gray-700">🎯 None</p>
                            <p className="text-xs text-gray-600">Uses your image at original size with no scaling - best for images already sized correctly.</p>
                          </div>

                          <button
                            onClick={() => setShowScaleModeInfo(false)}
                            className="w-full mt-2 px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                          >
                            Got it!
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: Required Image Size (simplified) */}
              {((selectedPdf && totalPages > 0) || (useCustomDimensions && totalPages > 0)) && (
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">Required Image Sizes:</p>
                      <div className="text-sm text-blue-700 space-y-1">
                        <p>Top: {((bleedType === "add_bleed" ? bookWidth + 0.25 : bookWidth) * 285.7).toFixed(0)} × {numLeaves}px minimum</p>
                        <p>Side: {numLeaves} × {((bleedType === "add_bleed" ? bookHeight + 0.25 : bookHeight) * 285.7).toFixed(0)}px minimum</p>
                        <p>Bottom: {((bleedType === "add_bleed" ? bookWidth + 0.25 : bookWidth) * 285.7).toFixed(0)} × {numLeaves}px minimum</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
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


              {/* Step 4: Image Upload(s) */}
              {((selectedPdf && totalPages > 0) || (useCustomDimensions && totalPages > 0)) && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <Label>2. Upload Edge Images (choose which edges you want)</Label>

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
                      {sideEdgeImage && (
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

                    {!topEdgeImage && !sideEdgeImage && !bottomEdgeImage && (
                      <p className="text-xs text-amber-600">Please upload at least one edge image</p>
                    )}
                  </div>
                </div>
              )}

              {/* Preview Button */}
              {((selectedPdf && totalPages > 0) || (useCustomDimensions && totalPages > 0)) && 
               (sideEdgeImage || topEdgeImage || bottomEdgeImage) && (
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
               (sideEdgeImage || topEdgeImage || bottomEdgeImage) && (
                <div className="space-y-3">
                  <Button
                    onClick={processActualPdf}
                    disabled={isProcessing || useCustomDimensions}
                    className="w-full"
                    title={useCustomDimensions ? "Upload a PDF file and edge image to process" : ""}
                  >
                    {isProcessing ? "Processing..." : useCustomDimensions ? "🔄 Upload PDF & Image to Process" : "🔄 Process PDF"}
                  </Button>

                  {/* Progress bar for large PDFs */}
                  {isProcessing && totalPages > 50 && (
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${processingProgress}%` }}
                      ></div>
                      <p className="text-xs text-gray-600 mt-1 text-center">
                        Processing PDF: {Math.round(processingProgress)}%
                      </p>
                    </div>
                  )}
                  
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
                          {currentPage > 1 && sideEdgeImage && (
                            <div
                              className="absolute top-0"
                              style={{
                                left: `${Math.max(0.125 * 50, 6)}px`, // Position it to overlay the left page, not outside
                                width: `${Math.max(0.125 * 50, 6)}px`,
                                height: "100%",
                                ...getEdgeBackgroundStyle(
                                  'side',
                                  sideEdgeImage,
                                  (currentPage - 1) - 1, // Left page index
                                  Math.max(0.125 * 50, 6),
                                  Math.min(bookHeight * 25, 280)
                                ),
                                transform: "scaleX(-1) skewY(2deg)",
                                transformOrigin: "left center",
                                // Always miter corners in all-edges mode
                                clipPath: true ?
                                  `polygon(0 ${Math.max(0.125 * 50, 6)}px, 100% 0, 100% 100%, 0 calc(100% - ${Math.max(0.125 * 50, 6)}px))` : // Miter both corners
                                  'polygon(0 0, 100% 0, 100% 100%, 0 100%)', // Square corners for side-only mode
                              }}
                            />
                          )}

                          {/* Top Edge Strip for Left Page (only if top edge image is uploaded) */}
                          { topEdgeImage && currentPage > 1 && (
                            <div
                              className="absolute top-0 left-0 w-full border-t border-gray-400"
                              style={{
                                height: `${Math.max(0.125 * 50, 6)}px`,
                                ...getEdgeBackgroundStyle(
                                  'top',
                                  topEdgeImage,
                                  (currentPage - 1) - 1, // Left page index
                                  Math.min(bookWidth * 25, 200),
                                  Math.max(0.125 * 50, 6)
                                ),
                                transform: "scaleX(-1) skewX(1deg)", // Mirror horizontally for left page
                                transformOrigin: "center top",
                                zIndex: 10,
                                // Always miter the outer corner in all-edges mode
                                clipPath: true ?
                                  `polygon(0 0, 100% 0, calc(100% - ${Math.max(0.125 * 50, 6)}px) 100%, 0 100%)` : // Miter outer corner
                                  'polygon(0 0, 100% 0, 100% 100%, 0 100%)', // Square corners for side-only mode
                              }}
                            />
                          )}

                          {/* Bottom Edge Strip for Left Page (only if bottom edge image is uploaded) */}
                          { bottomEdgeImage && currentPage > 1 && (
                            <div
                              className="absolute bottom-0 left-0 w-full border-b border-gray-400"
                              style={{
                                height: `${Math.max(0.125 * 50, 6)}px`,
                                ...getEdgeBackgroundStyle(
                                  'bottom',
                                  bottomEdgeImage,
                                  (currentPage - 1) - 1, // Left page index
                                  Math.min(bookWidth * 25, 200),
                                  Math.max(0.125 * 50, 6)
                                ),
                                transform: "scaleX(-1) skewX(-1deg)", // Mirror horizontally for left page
                                transformOrigin: "center bottom",
                                zIndex: 10,
                                // Always miter the outer corner in all-edges mode
                                clipPath: true ?
                                  `polygon(0 0, calc(100% - ${Math.max(0.125 * 50, 6)}px) 0, 100% 100%, 0 100%)` : // Miter outer corner
                                  'polygon(0 0, 100% 0, 100% 100%, 0 100%)', // Square corners for side-only mode
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
                              ...(sideEdgeImage ? getEdgeBackgroundStyle(
                                'side',
                                sideEdgeImage,
                                currentPage - 1, // Right page index
                                Math.max(0.125 * 50, 6),
                                Math.min(bookHeight * 25, 280)
                              ) : {}),
                              transform: "skewY(-2deg)",
                              transformOrigin: "right center",
                              // Miter corners when top/bottom edges exist - only trim the actual corners
                              clipPath:  (topEdgeImage || bottomEdgeImage) ?
                                `polygon(0 ${Math.max(0.125 * 50, 6)}px, 100% 0, 100% 100%, 0 calc(100% - ${Math.max(0.125 * 50, 6)}px))` : // 45-degree corner cuts - only bottom corner
                                'polygon(0 0, 100% 0, 100% 100%, 0 100%)', // Square corners
                            }}
                          />

                          {/* Top Edge Strip (only if top edge image is uploaded) */}
                          { topEdgeImage && (
                            <div
                              className="absolute top-0 left-0 w-full border-t border-gray-400"
                              style={{
                                height: `${Math.max(0.125 * 50, 6)}px`,
                                ...getEdgeBackgroundStyle(
                                  'top',
                                  topEdgeImage,
                                  currentPage - 1, // Right page index
                                  Math.min(bookWidth * 25, 200),
                                  Math.max(0.125 * 50, 6)
                                ),
                                transform: "skewX(1deg)",
                                transformOrigin: "center top",
                                zIndex: 10,
                                // Always miter the outer corner in all-edges mode
                                clipPath: true ?
                                  `polygon(0 0, 100% 0, calc(100% - ${Math.max(0.125 * 50, 6)}px) 100%, 0 100%)` : // Miter outer corner (top-right)
                                  'polygon(0 0, 100% 0, 100% 100%, 0 100%)', // Square corners for side-only mode
                              }}
                            />
                          )}

                          {/* Bottom Edge Strip (only if bottom edge image is uploaded) */}
                          { bottomEdgeImage && (
                            <div
                              className="absolute bottom-0 left-0 w-full border-b border-gray-400"
                              style={{
                                height: `${Math.max(0.125 * 50, 6)}px`,
                                ...getEdgeBackgroundStyle(
                                  'bottom',
                                  bottomEdgeImage,
                                  currentPage - 1, // Right page index
                                  Math.min(bookWidth * 25, 200),
                                  Math.max(0.125 * 50, 6)
                                ),
                                transform: "skewX(-1deg)",
                                transformOrigin: "center bottom",
                                zIndex: 10,
                                // Always miter the outer corner in all-edges mode
                                clipPath: true ?
                                  `polygon(0 0, calc(100% - ${Math.max(0.125 * 50, 6)}px) 0, 100% 100%, 0 100%)` : // Miter outer corner (bottom-right)
                                  'polygon(0 0, 100% 0, 100% 100%, 0 100%)', // Square corners for side-only mode
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
                  {viewMode === "shelf" && (sideEdgeImage || topEdgeImage || bottomEdgeImage) && (
                    <div className="w-full bg-gradient-to-b from-gray-50 to-gray-100 p-6 rounded-lg">
                      <div className="flex flex-col items-center space-y-6">
                        <h3 className="text-lg font-medium text-gray-800 mb-4">Your Edge Design Preview</h3>
                        <div className="text-sm text-gray-600 text-center">
                          Showing how your edges will appear with "{scaleMode}" scaling
                        </div>

                        <div className="flex flex-col items-center space-y-4 max-w-4xl w-full">
                          {/* Top Edge */}
                          {topEdgeImage && (
                            <div className="flex flex-col items-center space-y-2">
                              <span className="text-sm font-medium text-gray-600">Top Edge</span>
                              <canvas
                                ref={topEdgeCanvasRef}
                                className="rounded-lg shadow-lg border border-gray-200 bg-white"
                              />
                            </div>
                          )}

                          {/* Side Edge */}
                          {sideEdgeImage && (
                            <div className="flex flex-col items-center space-y-2">
                              <span className="text-sm font-medium text-gray-600">Side Edge</span>
                              <canvas
                                ref={sideEdgeCanvasRef}
                                className="rounded-lg shadow-lg border border-gray-200 bg-white"
                              />
                            </div>
                          )}

                          {/* Bottom Edge */}
                          {bottomEdgeImage && (
                            <div className="flex flex-col items-center space-y-2">
                              <span className="text-sm font-medium text-gray-600">Bottom Edge</span>
                              <canvas
                                ref={bottomEdgeCanvasRef}
                                className="rounded-lg shadow-lg border border-gray-200 bg-white"
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
