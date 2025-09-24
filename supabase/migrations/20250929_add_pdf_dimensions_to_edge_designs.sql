-- Add PDF dimensions and page count fields to edge_designs table
ALTER TABLE public.edge_designs
ADD COLUMN IF NOT EXISTS pdf_width DECIMAL(5,2), -- Width in inches (e.g., 6.00, 8.50)
ADD COLUMN IF NOT EXISTS pdf_height DECIMAL(5,2), -- Height in inches (e.g., 9.00, 11.00)
ADD COLUMN IF NOT EXISTS page_count INTEGER, -- Number of pages processed
ADD COLUMN IF NOT EXISTS bleed_type TEXT, -- 'add_bleed' or 'existing_bleed'
ADD COLUMN IF NOT EXISTS edge_type TEXT; -- 'side-only' or 'all-edges'

-- Add comments for clarity
COMMENT ON COLUMN public.edge_designs.pdf_width IS 'PDF width in inches (e.g., 6.00 for 6 inch width)';
COMMENT ON COLUMN public.edge_designs.pdf_height IS 'PDF height in inches (e.g., 9.00 for 9 inch height)';
COMMENT ON COLUMN public.edge_designs.page_count IS 'Number of pages in the processed PDF';
COMMENT ON COLUMN public.edge_designs.bleed_type IS 'Bleed handling: add_bleed or existing_bleed';
COMMENT ON COLUMN public.edge_designs.edge_type IS 'Edge application type: side-only or all-edges';