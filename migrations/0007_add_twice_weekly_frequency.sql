-- 0007_add_twice_weekly_frequency.sql
-- Adds "Twice Weekly" as a selectable recurrence frequency for items'
-- due-date cadence. Auto-advance (see addInterval in api/_itemLogic.js)
-- alternates 3/4 days so the long-run average lands on exactly twice a
-- week, without pinning to specific weekdays.

ALTER TABLE items DROP CONSTRAINT IF EXISTS items_frequency_check;
ALTER TABLE items ADD CONSTRAINT items_frequency_check
  CHECK (frequency IS NULL OR frequency IN ('Daily', 'Twice Weekly', 'Weekly', 'Monthly', 'Quarterly', 'Annual'));
