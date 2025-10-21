/**
 * PDF Complexity Analyzer
 *
 * Analyzes PDF files using PDF.js to detect complexity factors that may cause processing failures.
 * Logs detailed metrics to help calibrate file requirements over time.
 */

export interface PDFComplexityMetrics {
  // Basic metadata
  fileSize: number;           // In bytes
  fileSizeMB: number;        // In megabytes
  pageCount: number;

  // Page properties
  avgPageWidth: number;      // In points
  avgPageHeight: number;     // In points
  hasVariablePageSizes: boolean;

  // Complexity indicators
  totalFonts: number;        // Count of unique fonts across all pages
  totalImages: number;       // Count of images across all pages
  hasTransparency: boolean;  // Any pages with alpha channel
  hasAnnotations: boolean;   // Form fields, comments, etc.
  hasXObjects: number;       // Complex embedded objects

  // Detailed font info
  fontNames: string[];       // Names of all fonts used

  // Detailed image info
  largeImageCount: number;   // Images that might be high-res

  // Complexity score (0-100, higher = more complex)
  complexityScore: number;

  // Risk assessment
  riskLevel: 'low' | 'medium' | 'high';
  riskFactors: string[];     // Human-readable list of risk factors

  // Timestamp
  analyzedAt: string;
}

/**
 * Analyzes a PDF file and returns complexity metrics
 */
export async function analyzePDFComplexity(file: File): Promise<PDFComplexityMetrics> {
  const fileUrl = URL.createObjectURL(file);

  try {
    // Ensure PDF.js is loaded
    await loadPDFJS();

    const pdfjsLib = (window as any).pdfjsLib;
    const pdf = await pdfjsLib.getDocument(fileUrl).promise;

    // Initialize metrics
    const metrics: Partial<PDFComplexityMetrics> = {
      fileSize: file.size,
      fileSizeMB: Math.round(file.size / (1024 * 1024) * 100) / 100,
      pageCount: pdf.numPages,
      avgPageWidth: 0,
      avgPageHeight: 0,
      hasVariablePageSizes: false,
      totalFonts: 0,
      totalImages: 0,
      hasTransparency: false,
      hasAnnotations: false,
      hasXObjects: 0,
      fontNames: [],
      largeImageCount: 0,
      complexityScore: 0,
      riskLevel: 'low',
      riskFactors: [],
      analyzedAt: new Date().toISOString()
    };

    // Analyze ALL pages for accurate complexity detection
    const pagesToAnalyze: number[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      pagesToAnalyze.push(i);
    }

    let totalWidth = 0;
    let totalHeight = 0;
    const pageSizes: Array<{ width: number; height: number }> = [];
    const allFonts = new Set<string>();

    // Analyze sampled pages
    for (const pageNum of pagesToAnalyze) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });

      totalWidth += viewport.width;
      totalHeight += viewport.height;
      pageSizes.push({ width: viewport.width, height: viewport.height });

      // Get page annotations (form fields, comments, etc.)
      const annotations = await page.getAnnotations();
      if (annotations && annotations.length > 0) {
        metrics.hasAnnotations = true;
      }

      // Analyze operator list for complexity indicators
      const operatorList = await page.getOperatorList();

      // Count images (OPS.paintImageXObject, OPS.paintInlineImageXObject)
      const imageOps = operatorList.fnArray.filter((op: number) =>
        op === pdfjsLib.OPS.paintImageXObject ||
        op === pdfjsLib.OPS.paintInlineImageXObject
      );
      metrics.totalImages! += imageOps.length;

      // Count XObjects (complex embedded objects)
      const xObjectOps = operatorList.fnArray.filter((op: number) =>
        op === pdfjsLib.OPS.paintXObject
      );
      metrics.hasXObjects! += xObjectOps.length;

      // Detect transparency (setGState with alpha/blend modes)
      const transparencyOps = operatorList.fnArray.filter((op: number) =>
        op === pdfjsLib.OPS.setGState ||
        op === pdfjsLib.OPS.beginMarkedContent ||
        op === pdfjsLib.OPS.paintFormXObjectBegin
      );
      if (transparencyOps.length > 0) {
        metrics.hasTransparency = true;
      }

      // Get fonts (this is available from the page's font dict)
      try {
        const fonts = await page.getTextContent().then((content: any) => {
          const fontSet = new Set<string>();
          content.items.forEach((item: any) => {
            if (item.fontName) {
              fontSet.add(item.fontName);
            }
          });
          return Array.from(fontSet);
        });

        fonts.forEach((font: string) => allFonts.add(font));
      } catch (e) {
        // Some PDFs may not have text content
        console.warn('Could not extract fonts from page', pageNum, e);
      }
    }

    // Calculate averages
    metrics.avgPageWidth = Math.round(totalWidth / pagesToAnalyze.length);
    metrics.avgPageHeight = Math.round(totalHeight / pagesToAnalyze.length);

    // Check for variable page sizes
    const widthVariance = Math.max(...pageSizes.map(s => s.width)) - Math.min(...pageSizes.map(s => s.width));
    const heightVariance = Math.max(...pageSizes.map(s => s.height)) - Math.min(...pageSizes.map(s => s.height));
    metrics.hasVariablePageSizes = widthVariance > 5 || heightVariance > 5;

    // Font metrics
    metrics.totalFonts = allFonts.size;
    metrics.fontNames = Array.from(allFonts);

    // Estimate large image count (rough heuristic based on XObjects)
    // This is an approximation since we can't easily get actual image sizes from PDF.js
    metrics.largeImageCount = Math.floor(metrics.hasXObjects! / 3);

    // Calculate complexity score and risk assessment
    const analysis = calculateComplexityScore(metrics as PDFComplexityMetrics);
    metrics.complexityScore = analysis.score;
    metrics.riskLevel = analysis.riskLevel;
    metrics.riskFactors = analysis.riskFactors;

    return metrics as PDFComplexityMetrics;

  } finally {
    URL.revokeObjectURL(fileUrl);
  }
}

/**
 * Calculate complexity score (0-100) and risk assessment
 */
function calculateComplexityScore(metrics: PDFComplexityMetrics): {
  score: number;
  riskLevel: 'low' | 'medium' | 'high';
  riskFactors: string[];
} {
  let score = 0;
  const riskFactors: string[] = [];

  // File size factor (0-20 points)
  if (metrics.fileSizeMB > 50) {
    score += 20;
    riskFactors.push(`Large file size (${metrics.fileSizeMB}MB)`);
  } else if (metrics.fileSizeMB > 25) {
    score += 10;
    riskFactors.push(`Moderate file size (${metrics.fileSizeMB}MB)`);
  }

  // Page count factor (0-10 points)
  if (metrics.pageCount > 500) {
    score += 10;
    riskFactors.push(`High page count (${metrics.pageCount} pages)`);
  } else if (metrics.pageCount > 300) {
    score += 5;
  }

  // Font factor (0-25 points) - STRONG PREDICTOR
  if (metrics.totalFonts > 10) {
    score += 25;
    riskFactors.push(`Many embedded fonts (${metrics.totalFonts} fonts)`);
  } else if (metrics.totalFonts > 5) {
    score += 15;
    riskFactors.push(`Several embedded fonts (${metrics.totalFonts} fonts)`);
  } else if (metrics.totalFonts > 2) {
    score += 8;
  }

  // Image factor (0-20 points) - STRONG PREDICTOR
  const avgImagesPerPage = metrics.totalImages / metrics.pageCount;
  if (avgImagesPerPage > 5) {
    score += 20;
    riskFactors.push(`Many embedded images (~${Math.round(avgImagesPerPage)} per page)`);
  } else if (avgImagesPerPage > 2) {
    score += 10;
    riskFactors.push(`Several embedded images (~${Math.round(avgImagesPerPage)} per page)`);
  }

  // Transparency factor (0-15 points) - STRONG PREDICTOR
  if (metrics.hasTransparency) {
    score += 15;
    riskFactors.push('Contains transparency/layers (likely non-flattened)');
  }

  // Annotations factor (0-10 points)
  if (metrics.hasAnnotations) {
    score += 10;
    riskFactors.push('Contains form fields/annotations (indicates non-flattened)');
  }

  // XObject complexity factor (0-10 points)
  const avgXObjectsPerPage = metrics.hasXObjects / metrics.pageCount;
  if (avgXObjectsPerPage > 10) {
    score += 10;
    riskFactors.push('High XObject count (complex embedded graphics)');
  } else if (avgXObjectsPerPage > 5) {
    score += 5;
  }

  // Determine risk level based on score
  let riskLevel: 'low' | 'medium' | 'high';
  if (score >= 60) {
    riskLevel = 'high';
  } else if (score >= 35) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'low';
  }

  return { score, riskLevel, riskFactors };
}

/**
 * Ensure PDF.js is loaded
 */
async function loadPDFJS(): Promise<void> {
  const pdfjsLib = (window as any).pdfjsLib;
  if (pdfjsLib) {
    return; // Already loaded
  }

  // Load PDF.js from CDN
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  document.head.appendChild(script);

  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = reject;
  });

  (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/**
 * Format complexity metrics for logging/display
 */
export function formatComplexityReport(metrics: PDFComplexityMetrics): string {
  return `
PDF Complexity Analysis:
- File: ${metrics.fileSizeMB}MB, ${metrics.pageCount} pages
- Fonts: ${metrics.totalFonts} (${metrics.fontNames.join(', ') || 'none'})
- Images: ~${metrics.totalImages} total (${metrics.largeImageCount} potentially large)
- Transparency: ${metrics.hasTransparency ? 'Yes' : 'No'}
- Annotations: ${metrics.hasAnnotations ? 'Yes' : 'No'}
- XObjects: ${metrics.hasXObjects}
- Complexity Score: ${metrics.complexityScore}/100
- Risk Level: ${metrics.riskLevel.toUpperCase()}
${metrics.riskFactors.length > 0 ? '\nRisk Factors:\n' + metrics.riskFactors.map(f => `  - ${f}`).join('\n') : ''}
  `.trim();
}
