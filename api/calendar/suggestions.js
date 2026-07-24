// GET /api/calendar/suggestions -> { needsSetup: true } if there's neither
// an ICS link nor any hand-entered meetings yet, otherwise
// { schedule, generatedAt }. Editor-only, like the rest of the Planner.
// Fetches and parses the configured ICS feed (if any) on every call (no
// caching) — it's a low-traffic, single-user page.
import { query } from '../_db.js';
import { requireEditor } from '../_auth.js';
import { withErrorHandling } from '../_errors.js';
import { rowToCalendarSettings, rowToManualEvent, fetchIcsText, getBusyBlocks, buildSchedule } from '../_calendarLogic.js';

const DAY_SPAN = 10;

function dateOnly(v) {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  return new Date(v).toISOString().slice(0, 10);
}

export default withErrorHandling(async function handler(req, res) {
  if (!requireEditor(req, res)) return;
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { rows } = await query('SELECT * FROM calendar_settings WHERE id = 1');
  if (!rows.length) {
    res.status(404).json({ error: 'calendar_settings row missing — did you run migration 0005?' });
    return;
  }
  const settings = rowToCalendarSettings(rows[0]);

  const now = new Date();
  const rangeEnd = new Date(now.getTime() + (DAY_SPAN + 6) * 24 * 60 * 60 * 1000);

  const { rows: manualRows } = await query(
    'SELECT * FROM manual_calendar_events WHERE end_time > $1 AND start_time < $2 ORDER BY start_time ASC',
    [now.toISOString(), rangeEnd.toISOString()]
  );
  const manualBlocks = manualRows.map(rowToManualEvent).map((e) => ({ start: new Date(e.start), end: new Date(e.end), summary: e.title }));

  if (!settings.icsUrl && manualBlocks.length === 0) {
    res.status(200).json({ needsSetup: true });
    return;
  }

  const icsBlocks = settings.icsUrl ? getBusyBlocks(await fetchIcsText(settings.icsUrl), now, rangeEnd) : [];
  const busyBlocks = [...icsBlocks, ...manualBlocks].sort((a, b) => a.start - b.start);

  const { rows: itemRows } = await query('SELECT id, description, status, due_date, priority FROM items');
  const items = itemRows.map((r) => ({ id: r.id, description: r.description, status: r.status, dueDate: dateOnly(r.due_date), priority: r.priority }));

  const schedule = buildSchedule({ settings, busyBlocks, items, now, daySpan: DAY_SPAN });

  res.status(200).json({ schedule, generatedAt: now.toISOString() });
});
