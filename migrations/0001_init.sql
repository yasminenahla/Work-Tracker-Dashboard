-- 0001_init.sql
-- Core schema for the Team Work Tracker: one "items" table (the tracker
-- rows) and one singleton "tracker_config" row (editable dropdown lists,
-- column visibility, risk thresholds). Applied in order by scripts/migrate.mjs,
-- which tracks what's already run in _migrations — safe to re-run.

CREATE TABLE IF NOT EXISTS items (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pinned             BOOLEAN NOT NULL DEFAULT FALSE,
  type               TEXT NOT NULL,
  description        TEXT NOT NULL,
  function           TEXT NOT NULL,
  owner              TEXT NOT NULL DEFAULT '',
  raised_by          TEXT NOT NULL DEFAULT '',
  date_raised        DATE,
  priority           TEXT NOT NULL,
  status             TEXT NOT NULL,
  due_type           TEXT NOT NULL DEFAULT 'date' CHECK (due_type IN ('date', 'recurring')),
  due_date           DATE,
  frequency          TEXT CHECK (frequency IS NULL OR frequency IN ('Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annual')),
  percent_complete   INTEGER NOT NULL DEFAULT 0 CHECK (percent_complete BETWEEN 0 AND 100),
  next_action        TEXT NOT NULL DEFAULT '',
  stakeholders       TEXT NOT NULL DEFAULT '',
  notes              TEXT NOT NULL DEFAULT '',
  risk_override      TEXT CHECK (risk_override IS NULL OR risk_override IN ('Red', 'Amber', 'Green')),
  is_sample          BOOLEAN NOT NULL DEFAULT FALSE,
  created_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  last_updated       DATE NOT NULL DEFAULT CURRENT_DATE,
  history            JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS items_status_idx ON items (status);
CREATE INDEX IF NOT EXISTS items_function_idx ON items (function);
CREATE INDEX IF NOT EXISTS items_owner_idx ON items (owner);
CREATE INDEX IF NOT EXISTS items_due_date_idx ON items (due_date);

-- Singleton settings row (id is always 1). Holds the editable Type/
-- Function/Priority/Status option lists, column visibility prefs, and risk
-- thresholds — see src/lib/constants.js DEFAULT_CONFIG for the shape these
-- JSONB columns hold.
CREATE TABLE IF NOT EXISTS tracker_config (
  id                   INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  lists                JSONB NOT NULL,
  visible_columns      JSONB NOT NULL,
  risk_thresholds      JSONB NOT NULL DEFAULT '{"amberDueWithinDays": 7}'::JSONB,
  stale_days           INTEGER NOT NULL DEFAULT 7,
  default_owner        TEXT NOT NULL DEFAULT '',
  last_exported_at     TIMESTAMPTZ,
  sample_data_cleared  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tracker_config (id, lists, visible_columns)
VALUES (
  1,
  '{
    "types": ["SLA", "Ad-hoc", "Project", "Workstream", "Recurring Meeting", "Reporting"],
    "functions": ["UK EHS", "UK QFS", "KSA QFS", "Cross-functional", "Project"],
    "priorities": ["High", "Medium", "Low"],
    "statuses": ["Not Started", "In Progress", "On Track", "At Risk", "Blocked", "Completed", "Overdue"]
  }'::JSONB,
  '{
    "id": true, "type": true, "function": true, "owner": true, "raisedBy": true,
    "dateRaised": true, "priority": true, "status": true, "due": true,
    "percentComplete": true, "nextAction": true, "stakeholders": true,
    "notes": true, "lastUpdated": true, "risk": true
  }'::JSONB
)
ON CONFLICT (id) DO NOTHING;
