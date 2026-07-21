-- 0004_add_item_snapshots.sql
-- Version history / restore for the items table. A snapshot is a full
-- point-in-time copy of every item's raw DB row, taken automatically by
-- api/_snapshotLogic.js before any delete (single item, clear sample,
-- clear all) and restore, plus on-demand via "Take a snapshot now" in
-- Settings -> History. Retention (keep the last N) is enforced in
-- application code, not here.

CREATE TABLE IF NOT EXISTS item_snapshots (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reason       TEXT NOT NULL,
  item_count   INTEGER NOT NULL DEFAULT 0,
  items_json   JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS item_snapshots_created_at_idx ON item_snapshots (created_at DESC);
