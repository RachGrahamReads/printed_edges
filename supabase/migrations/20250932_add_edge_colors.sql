-- Add top and bottom edge color fields to edge_designs table
ALTER TABLE public.edge_designs
ADD COLUMN IF NOT EXISTS top_edge_color TEXT,
ADD COLUMN IF NOT EXISTS bottom_edge_color TEXT;

-- Add comments for clarity
COMMENT ON COLUMN public.edge_designs.top_edge_color IS 'Hex color code for top edge (e.g., #FF5733) or null if image-based';
COMMENT ON COLUMN public.edge_designs.bottom_edge_color IS 'Hex color code for bottom edge (e.g., #1E90FF) or null if image-based';

-- Create indexes for potential future queries by color
CREATE INDEX IF NOT EXISTS idx_edge_designs_top_edge_color ON public.edge_designs(top_edge_color) WHERE top_edge_color IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_edge_designs_bottom_edge_color ON public.edge_designs(bottom_edge_color) WHERE bottom_edge_color IS NOT NULL;