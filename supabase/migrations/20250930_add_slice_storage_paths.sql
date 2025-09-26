-- Add columns to store slice paths for regeneration
-- This allows fast regeneration without recreating slices

-- Add JSON columns to store slice storage paths
ALTER TABLE edge_designs
ADD COLUMN IF NOT EXISTS slice_storage_paths JSONB;

-- Add comments for documentation
COMMENT ON COLUMN edge_designs.slice_storage_paths IS 'JSON object containing raw and masked slice storage paths for regeneration';

-- Example structure:
-- {
--   "side": {
--     "raw": ["path1", "path2", ...],
--     "masked": ["path1", "path2", ...]
--   },
--   "top": {
--     "raw": ["path1", "path2", ...],
--     "masked": ["path1", "path2", ...]
--   },
--   "bottom": {
--     "raw": ["path1", "path2", ...],
--     "masked": ["path1", "path2", ...]
--   }
-- }