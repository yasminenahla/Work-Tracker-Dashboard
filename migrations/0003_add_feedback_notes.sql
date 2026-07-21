-- 0003_add_feedback_notes.sql
-- Structured performance-review notes, separate from work items. Deliberately
-- simple (no history/jsonb) — these are journal-style entries, not tracked
-- workflow items. Read/write access is editor-only end to end (enforced in
-- api/feedback.js and api/feedback/[id].js, not just hidden in the UI) since
-- this is personnel data, unlike the tracker's public-read items.

CREATE TABLE IF NOT EXISTS feedback_notes (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  person             TEXT NOT NULL,
  review_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  strengths          TEXT NOT NULL DEFAULT '',
  areas_for_growth   TEXT NOT NULL DEFAULT '',
  goals              TEXT NOT NULL DEFAULT '',
  notes              TEXT NOT NULL DEFAULT '',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_notes_person_idx ON feedback_notes (person);
CREATE INDEX IF NOT EXISTS feedback_notes_review_date_idx ON feedback_notes (review_date);
