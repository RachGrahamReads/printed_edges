-- Add regeneration counter to edge_designs table
ALTER TABLE public.edge_designs
ADD COLUMN IF NOT EXISTS regeneration_count INTEGER DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.edge_designs.regeneration_count IS 'Number of times this design has been regenerated with new PDFs';