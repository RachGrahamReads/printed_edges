-- Add missing columns to edge_designs table for PDF data storage
-- These columns are needed to save edge designs with PDF processing information

-- Add bleed_type column to store 'add_bleed' or 'existing_bleed'
ALTER TABLE edge_designs
ADD COLUMN IF NOT EXISTS bleed_type VARCHAR(20);

-- Add edge_type column to store 'side-only' or 'all-edges'
ALTER TABLE edge_designs
ADD COLUMN IF NOT EXISTS edge_type VARCHAR(20);

-- Add PDF dimensions columns
ALTER TABLE edge_designs
ADD COLUMN IF NOT EXISTS pdf_width DECIMAL(5,2);

ALTER TABLE edge_designs
ADD COLUMN IF NOT EXISTS pdf_height DECIMAL(5,2);

-- Add page count column
ALTER TABLE edge_designs
ADD COLUMN IF NOT EXISTS page_count INTEGER;

-- Add color columns for top and bottom edge colors (when using solid colors instead of images)
ALTER TABLE edge_designs
ADD COLUMN IF NOT EXISTS top_edge_color VARCHAR(7);  -- For hex colors like #ff0000

ALTER TABLE edge_designs
ADD COLUMN IF NOT EXISTS bottom_edge_color VARCHAR(7);  -- For hex colors like #ff0000

-- Update RLS policies if needed (the existing policies should still work)

-- Add comments for documentation
COMMENT ON COLUMN edge_designs.bleed_type IS 'PDF bleed setting: add_bleed or existing_bleed';
COMMENT ON COLUMN edge_designs.edge_type IS 'Edge processing type: side-only or all-edges';
COMMENT ON COLUMN edge_designs.pdf_width IS 'PDF width in inches';
COMMENT ON COLUMN edge_designs.pdf_height IS 'PDF height in inches';
COMMENT ON COLUMN edge_designs.page_count IS 'Number of pages in the PDF';
COMMENT ON COLUMN edge_designs.top_edge_color IS 'Hex color for top edge when using solid color instead of image';
COMMENT ON COLUMN edge_designs.bottom_edge_color IS 'Hex color for bottom edge when using solid color instead of image';