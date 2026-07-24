-- 0008_add_second_due_date.sql
-- An optional explicit second due date for "Twice Weekly" recurring items,
-- so the two weekly occurrences can be pinned to specific weekdays (e.g.
-- Mon & Thu) instead of only relying on the computed 3.5-day-grid
-- alternation. See rollRecurringIfNeeded in api/_itemLogic.js.

ALTER TABLE items ADD COLUMN IF NOT EXISTS due_date_2 DATE;
