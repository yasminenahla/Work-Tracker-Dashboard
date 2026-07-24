-- 0005_add_calendar_settings.sql
-- Read-only Outlook link (a published ICS feed URL, no OAuth/sign-in) plus
-- working-hours preferences, used by the Planner page to compute Focus /
-- Personal Development / Team Support time suggestions around your real
-- meetings. Singleton row (id=1), same pattern as tracker_config. Fully
-- editor-gated end to end (GET included, see api/calendar/*.js) — unlike
-- the tracker's public-read items, this is personal calendar data.

CREATE TABLE IF NOT EXISTS calendar_settings (
  id                        INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ics_url                   TEXT,
  timezone                  TEXT NOT NULL DEFAULT 'UTC',
  work_start                TEXT NOT NULL DEFAULT '09:00',
  work_end                  TEXT NOT NULL DEFAULT '17:00',
  work_days                 JSONB NOT NULL DEFAULT '[1,2,3,4,5]'::JSONB,
  focus_block_minutes       INTEGER NOT NULL DEFAULT 90,
  dev_time_weekly_minutes   INTEGER NOT NULL DEFAULT 120,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO calendar_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
