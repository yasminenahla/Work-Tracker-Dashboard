-- 0006_add_manual_calendar_events.sql
-- Fallback/supplement to the ICS link for the Planner: lets you type in
-- meetings by hand (title + start/end) when you can't publish/share a
-- calendar. These merge with any ICS-derived busy blocks when computing
-- Focus/Personal Development/Team Support suggestions — either source
-- works alone, or both together. Editor-gated end to end, same as the
-- rest of the Planner (see api/calendar/events.js).

CREATE TABLE IF NOT EXISTS manual_calendar_events (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title        TEXT NOT NULL,
  start_time   TIMESTAMPTZ NOT NULL,
  end_time     TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS manual_calendar_events_start_idx ON manual_calendar_events (start_time);
