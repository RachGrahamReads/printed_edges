// Simple Node.js server to test our TypeScript PDF processing logic locally
const http = require('http');
const fs = require('fs');
const Jimp = require('jimp').default || require('jimp');

// Import our TypeScript function logic (we'll convert to JavaScript)
async function processPDF(requestData) {
  // Import pdf-lib dynamically
  const pdfLib = await import('pdf-lib');
  const { PDFDocument, rgb } = pdfLib;

  console.log('Processing PDF request...');
  console.log('Request received:', {
    hasPdf: !!requestData.pdfBase64,
    hasEdgeImages: !!requestData.edgeImages,
    edgeType: requestData.edgeType,
    numPages: requestData.numPages
  });

  // Constants
  const BLEED_INCHES = 0.125;
  const SAFETY_BUFFER_INCHES = 0.125;
  const POINTS_PER_INCH = 72;
  const BLEED_POINTS = BLEED_INCHES * POINTS_PER_INCH;
  const SAFETY_BUFFER_POINTS = SAFETY_BUFFER_INCHES * POINTS_PER_INCH;

  const PAGE_THICKNESS = {
    "bw": 0.0032,
    "standard": 0.0032,
    "premium": 0.0037
  };

  // Validate required fields
  if (!requestData.pdfBase64) {
    throw new Error("PDF base64 data is required");
  }

  if (!requestData.edgeImages ||
      (requestData.edgeType === 'side-only' && !requestData.edgeImages.side) ||
      (requestData.edgeType === 'all-edges' && !requestData.edgeImages.side && !requestData.edgeImages.top && !requestData.edgeImages.bottom)) {
    throw new Error("Edge images are required based on edge type");
  }

  // Convert base64 PDF to bytes
  const binaryString = atob(requestData.pdfBase64);
  const pdfBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    pdfBytes[i] = binaryString.charCodeAt(i);
  }
  console.log('PDF bytes loaded:', pdfBytes.length);

  // Load the PDF with options to preserve form fields and structure
  const pdfDoc = await PDFDocument.load(pdfBytes, {
    ignoreEncryption: true,
    updateMetadata: false
  });

  const pages = pdfDoc.getPages();
  console.log('PDF loaded with', pages.length, 'pages');

  if (pages.length === 0) {
    throw new Error("PDF has no pages");
  }

  const firstPage = pages[0];
  const { width: originalWidth, height: originalHeight } = firstPage.getSize();
  console.log('Original page size:', originalWidth, 'x', originalHeight);

  // Calculate bleed dimensions
  let newWidth = originalWidth;
  let newHeight = originalHeight;
  let bleedPoints = 0;

  if (requestData.bleedType === 'add_bleed') {
    bleedPoints = BLEED_POINTS;
    newWidth = originalWidth + bleedPoints;
    newHeight = originalHeight + (2 * bleedPoints);
    console.log('Adding bleed - new size:', newWidth, 'x', newHeight);
  }

  // Calculate number of leaves
  const numLeaves = Math.ceil(requestData.numPages / 2);
  const totalLeaves = numLeaves; // Store for use in slicing
  const pageThicknessInches = PAGE_THICKNESS[requestData.pageType.toLowerCase()] || 0.0032;

  // Create new PDF with options for compression
  const newPdfDoc = await PDFDocument.create();

  // Set metadata
  newPdfDoc.setTitle('Processed PDF with Edges');
  newPdfDoc.setProducer('Printed Edges App');
  newPdfDoc.setCreationDate(new Date());
  newPdfDoc.setModificationDate(new Date());

  // Helper function to slice an image
  async function sliceImage(base64Data, width, height, leafNumber, totalLeaves, flipHorizontally = false) {
    try {
      const imageBuffer = Buffer.from(base64Data, 'base64');
      const image = await Jimp.read(imageBuffer);

      // Get the source image dimensions
      const srcWidth = image.bitmap.width;
      const srcHeight = image.bitmap.height;

      // Each slice width = image width / number of leaves
      const sliceWidth = Math.floor(srcWidth / totalLeaves);

      // Calculate the starting X position for this leaf's slice
      const sliceStartX = Math.min(leafNumber * sliceWidth, srcWidth - sliceWidth);

      console.log(`Slicing image: leaf ${leafNumber + 1}/${totalLeaves}, slice from x=${sliceStartX}, width=${sliceWidth}`);

      // Crop to get the slice
      image.crop(sliceStartX, 0, sliceWidth, srcHeight);

      // Resize to fit the edge strip dimensions
      image.resize(width, height);

      // Apply horizontal flip if needed
      if (flipHorizontally) {
        image.flip(true, false);
      }

      // Convert back to buffer
      const buffer = await image.getBufferAsync(Jimp.MIME_PNG);
      return buffer;
    } catch (error) {
      console.error('Error slicing image:', error);
      return null;
    }
  }

  // Cache for embedded images to avoid re-embedding
  let sideImageCache = {};
  let topImageCache = {};
  let bottomImageCache = {};

  console.log('Created new PDF document');

  // Process each page
  for (let pageNum = 0; pageNum < pages.length; pageNum++) { // Process all pages
    console.log(`Processing page ${pageNum + 1}/${pages.length}`);

    // Create new page with bleed dimensions
    const newPage = newPdfDoc.addPage([newWidth, newHeight]);

    // Embed the original page (this preserves the original page content efficiently)
    const [embeddedPage] = await newPdfDoc.embedPdf(pdfDoc, [pageNum]);

    // Position original content based on bleed type
    let xPos = 0;
    let yPos = 0;

    if (requestData.bleedType === 'add_bleed') {
      if (pageNum % 2 === 0) {
        // Right page - content stays at left
        xPos = 0;
        yPos = bleedPoints;
      } else {
        // Left page - content moves right
        xPos = bleedPoints;
        yPos = bleedPoints;
      }
    }

    // Draw the original page content
    newPage.drawPage(embeddedPage, {
      x: xPos,
      y: yPos,
      width: originalWidth,
      height: originalHeight,
    });

    // Add edge image processing with slicing logic
    const edgeStripWidth = BLEED_POINTS + SAFETY_BUFFER_POINTS;

    // Calculate leaf number and slice parameters
    const leafNumber = Math.floor(pageNum / 2);

    // Process side edges with proper slicing
    if (requestData.edgeType === 'side-only' || requestData.edgeImages.side) {
      try {
        const base64Data = requestData.edgeImages.side.base64;

        let sideX;
        let flipHorizontally = false;

        if (pageNum % 2 === 0) {
          // Right page (odd page number in book)
          sideX = newWidth - edgeStripWidth;
        } else {
          // Left page (even page number in book) - should be mirrored
          sideX = 0;
          flipHorizontally = true;
        }

        // Create a unique cache key for this specific slice
        const cacheKey = `${leafNumber}_${flipHorizontally}`;

        // Only create the slice if we haven't cached it yet
        if (!sideImageCache[cacheKey]) {
          const slicedImageBuffer = await sliceImage(
            base64Data,
            Math.round(edgeStripWidth),
            Math.round(newHeight),
            leafNumber,
            totalLeaves,
            flipHorizontally
          );

          if (slicedImageBuffer) {
            sideImageCache[cacheKey] = await newPdfDoc.embedPng(slicedImageBuffer);
          }
        }

        // Draw the sliced edge image
        if (sideImageCache[cacheKey]) {
          newPage.drawImage(sideImageCache[cacheKey], {
            x: sideX,
            y: 0,
            width: edgeStripWidth,
            height: newHeight,
          });
          console.log(`Added sliced side edge image to page ${pageNum + 1} (${flipHorizontally ? 'mirrored' : 'normal'})`);
        }
      } catch (error) {
        console.error(`Failed to add side edge to page ${pageNum + 1}:`, error.message);
        // Fallback to colored rectangle
        let sideX = pageNum % 2 === 0 ? newWidth - edgeStripWidth : 0;
        newPage.drawRectangle({
          x: sideX,
          y: 0,
          width: edgeStripWidth,
          height: newHeight,
          color: rgb(0.65, 0.45, 0.25),
          opacity: 0.3,
        });
      }
    }

    // Add top/bottom edges for all-edges mode
    if (requestData.edgeType === 'all-edges') {
      const edgeStripHeight = BLEED_POINTS + SAFETY_BUFFER_POINTS;

      // Top edge with slicing and mirroring logic
      if (requestData.edgeImages.top) {
        try {
          const base64Data = requestData.edgeImages.top.base64;
          const flipHorizontally = pageNum % 2 !== 0; // Left pages are mirrored

          const cacheKey = `${leafNumber}_${flipHorizontally}`;

          // Only create the slice if we haven't cached it yet
          if (!topImageCache[cacheKey]) {
            const slicedImageBuffer = await sliceImage(
              base64Data,
              Math.round(newWidth),
              Math.round(edgeStripHeight),
              leafNumber,
              totalLeaves,
              flipHorizontally
            );

            if (slicedImageBuffer) {
              topImageCache[cacheKey] = await newPdfDoc.embedPng(slicedImageBuffer);
            }
          }

          // Draw the sliced top edge image
          if (topImageCache[cacheKey]) {
            newPage.drawImage(topImageCache[cacheKey], {
              x: 0,
              y: newHeight - edgeStripHeight,
              width: newWidth,
              height: edgeStripHeight,
            });
            console.log(`Added sliced top edge image to page ${pageNum + 1} (${flipHorizontally ? 'mirrored' : 'normal'})`);
          }
        } catch (error) {
          console.error(`Failed to add top edge to page ${pageNum + 1}:`, error.message);
          // Fallback to colored rectangle
          newPage.drawRectangle({
            x: 0,
            y: newHeight - edgeStripHeight,
            width: newWidth,
            height: edgeStripHeight,
            color: rgb(0.6, 0.4, 0.2),
            opacity: 0.3,
          });
        }
      }

      // Bottom edge with slicing and mirroring logic
      if (requestData.edgeImages.bottom) {
        try {
          const base64Data = requestData.edgeImages.bottom.base64;
          const flipHorizontally = pageNum % 2 !== 0; // Left pages are mirrored

          const cacheKey = `${leafNumber}_${flipHorizontally}`;

          // Only create the slice if we haven't cached it yet
          if (!bottomImageCache[cacheKey]) {
            const slicedImageBuffer = await sliceImage(
              base64Data,
              Math.round(newWidth),
              Math.round(edgeStripHeight),
              leafNumber,
              totalLeaves,
              flipHorizontally
            );

            if (slicedImageBuffer) {
              bottomImageCache[cacheKey] = await newPdfDoc.embedPng(slicedImageBuffer);
            }
          }

          // Draw the sliced bottom edge image
          if (bottomImageCache[cacheKey]) {
            newPage.drawImage(bottomImageCache[cacheKey], {
              x: 0,
              y: 0,
              width: newWidth,
              height: edgeStripHeight,
            });
            console.log(`Added sliced bottom edge image to page ${pageNum + 1} (${flipHorizontally ? 'mirrored' : 'normal'})`);
          }
        } catch (error) {
          console.error(`Failed to add bottom edge to page ${pageNum + 1}:`, error.message);
          // Fallback to colored rectangle
          newPage.drawRectangle({
            x: 0,
            y: 0,
            width: newWidth,
            height: edgeStripHeight,
            color: rgb(0.55, 0.35, 0.15),
            opacity: 0.3,
          });
        }
      }
    }
  }

  console.log('Finished processing all pages, saving PDF...');

  // Save with compression options
  const processedPdfBytes = await newPdfDoc.save({
    useObjectStreams: false,
    addDefaultPage: false,
    objectsPerTick: 50,
  });

  console.log('PDF saved successfully, size:', processedPdfBytes.length, 'bytes');
  console.log('Compression ratio:', ((pdfBytes.length - processedPdfBytes.length) / pdfBytes.length * 100).toFixed(1) + '%');

  return processedPdfBytes;
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const requestData = JSON.parse(body);
        const processedPdf = await processPDF(requestData);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="processed.pdf"');
        res.writeHead(200);
        res.end(Buffer.from(processedPdf));

      } catch (error) {
        console.error('Error processing PDF:', error);
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(500);
        res.end(JSON.stringify({
          error: error.message,
          details: 'PDF processing failed in test server'
        }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const PORT = 8888;
server.listen(PORT, () => {
  console.log(`Test server running on http://localhost:${PORT}`);
  console.log('This server uses the same TypeScript PDF processing logic as the Supabase Edge Function');
});