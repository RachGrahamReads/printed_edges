export interface SlicedEdgeImages {
  side?: string[];
  top?: string[];
  bottom?: string[];
}

export interface EdgeSlicingOptions {
  numPages: number;
  pageType: 'bw' | 'standard' | 'premium';
  edgeType: 'side-only' | 'all-edges';
  trimWidth: number;
  trimHeight: number;
}

const PAGE_THICKNESS: Record<string, number> = {
  bw: 0.0032,
  standard: 0.0032,
  premium: 0.0037
};

export async function sliceEdgeImages(
  edgeImages: {
    side?: { base64: string };
    top?: { base64: string };
    bottom?: { base64: string };
  },
  options: EdgeSlicingOptions
): Promise<SlicedEdgeImages> {
  const numLeaves = Math.ceil(options.numPages / 2);
  const pageThicknessInches = PAGE_THICKNESS[options.pageType] || 0.0032;

  const slicedImages: SlicedEdgeImages = {};

  if (edgeImages.side && (options.edgeType === 'side-only' || options.edgeType === 'all-edges')) {
    slicedImages.side = await sliceImage(
      edgeImages.side.base64,
      numLeaves,
      pageThicknessInches,
      options.trimHeight,
      'vertical'
    );
  }

  if (options.edgeType === 'all-edges') {
    if (edgeImages.top) {
      slicedImages.top = await sliceImage(
        edgeImages.top.base64,
        numLeaves,
        pageThicknessInches,
        options.trimWidth,
        'horizontal'
      );
    }

    if (edgeImages.bottom) {
      slicedImages.bottom = await sliceImage(
        edgeImages.bottom.base64,
        numLeaves,
        pageThicknessInches,
        options.trimWidth,
        'horizontal'
      );
    }
  }

  return slicedImages;
}

async function sliceImage(
  base64: string,
  numLeaves: number,
  pageThicknessInches: number,
  totalDimensionInches: number,
  orientation: 'vertical' | 'horizontal'
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const slices: string[] = [];

        // Calculate total thickness of all pages
        const totalThicknessInches = numLeaves * pageThicknessInches;

        // For each leaf, calculate which portion of the image to use
        for (let leafIndex = 0; leafIndex < numLeaves; leafIndex++) {
          // Calculate the position of this leaf in the stack (0 to 1)
          const leafPosition = leafIndex / Math.max(1, numLeaves - 1);

          // Create a canvas for this slice
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d')!;

          // Disable image smoothing for crisp pixel stretching
          ctx.imageSmoothingEnabled = false;

          if (orientation === 'vertical') {
            // For side edges, slice vertically
            canvas.width = img.width;
            canvas.height = img.height;

            // Calculate source X position based on leaf position
            const sourceX = Math.floor(leafPosition * (img.width - 1));

            // Create a pattern by repeating the 1px slice across the width
            for (let x = 0; x < canvas.width; x++) {
              ctx.drawImage(
                img,
                sourceX, 0, 1, img.height,  // Source: 1px wide vertical slice
                x, 0, 1, canvas.height      // Destination: 1px wide strip at position x
              );
            }
          } else {
            // For top/bottom edges, slice horizontally
            canvas.width = img.width;
            canvas.height = img.height;

            // Calculate source Y position based on leaf position
            const sourceY = Math.floor(leafPosition * (img.height - 1));

            // Create a pattern by repeating the 1px slice across the height
            for (let y = 0; y < canvas.height; y++) {
              ctx.drawImage(
                img,
                0, sourceY, img.width, 1,  // Source: 1px high horizontal slice
                0, y, canvas.width, 1      // Destination: 1px high strip at position y
              );
            }
          }

          // Convert to base64
          slices.push(canvas.toDataURL('image/png').split(',')[1]);
        }

        resolve(slices);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = `data:image/png;base64,${base64}`;
  });
}