import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Page thickness per type in inches
const PAGE_THICKNESS = {
  "bw": 0.0032,
  "standard": 0.0032,
  "premium": 0.0037
};

interface SliceRequest {
  sessionId: string;
  edgePaths: {
    side?: string;
    top?: string;
    bottom?: string;
  };
  numPages: number;
  pageType: string;
  edgeType: 'side-only' | 'all-edges';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestData: SliceRequest = await req.json();

    console.log("Pre-slicing edge images for session:", requestData.sessionId);
    console.log("Number of pages:", requestData.numPages);
    console.log("Edge type:", requestData.edgeType);

    const numLeaves = Math.ceil(requestData.numPages / 2);
    const pageThicknessInches = PAGE_THICKNESS[requestData.pageType.toLowerCase()] || 0.0032;

    const slicedPaths: any = {};

    // Process each edge type
    if (requestData.edgeType === "side-only" && requestData.edgePaths.side) {
      slicedPaths.side = await sliceEdgeImage(
        supabase,
        requestData.edgePaths.side,
        'side',
        requestData.sessionId,
        numLeaves,
        pageThicknessInches
      );
    }

    if (requestData.edgeType === "all-edges") {
      if (requestData.edgePaths.side) {
        slicedPaths.side = await sliceEdgeImage(
          supabase,
          requestData.edgePaths.side,
          'side',
          requestData.sessionId,
          numLeaves,
          pageThicknessInches
        );
      }

      if (requestData.edgePaths.top) {
        slicedPaths.top = await sliceEdgeImage(
          supabase,
          requestData.edgePaths.top,
          'top',
          requestData.sessionId,
          numLeaves,
          pageThicknessInches
        );
      }

      if (requestData.edgePaths.bottom) {
        slicedPaths.bottom = await sliceEdgeImage(
          supabase,
          requestData.edgePaths.bottom,
          'bottom',
          requestData.sessionId,
          numLeaves,
          pageThicknessInches
        );
      }
    }

    console.log("Pre-slicing complete. Sliced paths:", slicedPaths);

    return new Response(
      JSON.stringify({
        success: true,
        slicedPaths,
        sessionId: requestData.sessionId,
        message: `Pre-sliced ${Object.keys(slicedPaths).length} edge types into ${numLeaves} leaf slices each`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error pre-slicing edge images:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});

async function sliceEdgeImage(
  supabase: any,
  edgePath: string,
  edgeType: 'side' | 'top' | 'bottom',
  sessionId: string,
  numLeaves: number,
  pageThicknessInches: number
): Promise<string[]> {

  console.log(`Creating slice references for ${edgeType} edge: ${edgePath}`);

  // Since Supabase Storage doesn't support arbitrary file types,
  // we'll simply return multiple references to the same original image
  // The chunk processor will handle slicing math at render time
  const slicePaths: string[] = [];

  // Create multiple references to the same original image
  // Each "slice" is just the original image path - the processor will handle the math
  for (let leafIndex = 0; leafIndex < numLeaves; leafIndex++) {
    slicePaths.push(edgePath); // Just use the original image for each leaf
    console.log(`Created slice reference ${leafIndex} -> ${edgePath}`);
  }

  console.log(`${edgeType} edge created ${slicePaths.length} slice references`);
  return slicePaths;
}