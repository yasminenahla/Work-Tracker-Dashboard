-- 0009_add_completed_on_time.sql
-- Tracks when an item was last marked Completed and whether that happened
-- on or before its due date at the time — stamped server-side the moment
-- status transitions to Completed (see detectCompletion in
-- api/_itemLogic.js), using the due date that was active *before* any
-- recurring rollover advances it, so recurring items are judged against
-- the occurrence that was actually just finished, not the next one.
-- Backs the "Completed (On Time)" dashboard card.

ALTER TABLE items ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE items ADD COLUMN IF NOT EXISTS completed_on_time BOOLEAN;
