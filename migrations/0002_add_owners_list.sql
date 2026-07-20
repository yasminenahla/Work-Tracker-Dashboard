-- 0002_add_owners_list.sql
-- Adds an "owners" roster to tracker_config.lists, alongside the existing
-- types/functions/priorities/statuses lists — Owner becomes a managed
-- dropdown instead of free text. Seeded from whatever owner names already
-- exist on items, so nothing already typed into a live tracker disappears.
-- Safe to re-run: only fills the key in if it isn't already there.

UPDATE tracker_config c
SET lists = c.lists || jsonb_build_object(
  'owners',
  COALESCE(
    c.lists->'owners',
    (SELECT COALESCE(jsonb_agg(DISTINCT owner ORDER BY owner), '[]'::jsonb)
     FROM items WHERE owner IS NOT NULL AND owner <> '')
  )
)
WHERE c.id = 1;
