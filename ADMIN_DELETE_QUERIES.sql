-- ADMIN: Manual Design Deletion Queries
-- Use these in Supabase SQL Editor for manual deletion as admin

-- 1. Find designs to delete (replace email with actual user email)
SELECT
    id,
    name,
    created_at,
    user_id,
    is_active
FROM edge_designs ed
JOIN auth.users u ON ed.user_id = u.id
WHERE u.email = 'user@example.com'  -- Replace with actual email
ORDER BY created_at DESC;

-- 2. Soft delete a specific design (recommended - can be undone)
UPDATE edge_designs
SET is_active = false
WHERE id = 'design-id-here'  -- Replace with actual design ID
AND is_active = true;

-- 3. Hard delete a specific design (permanent - use with caution)
-- DELETE FROM edge_designs
-- WHERE id = 'design-id-here';  -- Replace with actual design ID

-- 4. Soft delete all designs for a user (replace email)
UPDATE edge_designs
SET is_active = false
WHERE user_id = (
    SELECT id FROM auth.users WHERE email = 'user@example.com'  -- Replace with actual email
)
AND is_active = true;

-- 5. Restore a soft-deleted design
UPDATE edge_designs
SET is_active = true
WHERE id = 'design-id-here'  -- Replace with actual design ID
AND is_active = false;

-- 6. Find all inactive (soft-deleted) designs
SELECT
    ed.id,
    ed.name,
    ed.created_at,
    u.email as user_email,
    ed.is_active
FROM edge_designs ed
JOIN auth.users u ON ed.user_id = u.id
WHERE ed.is_active = false
ORDER BY ed.created_at DESC;

-- 7. Clean up storage files for a design (run AFTER deleting the design record)
-- Note: You'll need to manually delete files from Storage > edge-images bucket
-- Look for files in paths like: users/{user_id}/designs/{design_id}/