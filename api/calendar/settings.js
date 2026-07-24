// GET   /api/calendar/settings -> the singleton Planner settings row
// PATCH /api/calendar/settings -> partial update
// Editor-only end to end (GET included, like /api/feedback) — the ICS URL
// and working-hours prefs are personal, not meant for public/team read
// access the way the tracker's items are.
import { query } from '../_db.js';
import { requireEditor } from '../_auth.js';
import { withErrorHandling } from '../_errors.js';
import { rowToCalendarSettings, WRITABLE_CALENDAR_SETTINGS_COLUMNS, JSONB_CALENDAR_COLUMNS } from '../_calendarLogic.js';

export default withErrorHandling(async function handler(req, res) {
  if (!requireEditor(req, res)) return;

  if (req.method === 'GET') {
    const { rows } = await query('SELECT * FROM calendar_settings WHERE id = 1');
    if (!rows.length) {
      res.status(404).json({ error: 'calendar_settings row missing — did you run migration 0005?' });
      return;
    }
    res.status(200).json({ settings: rowToCalendarSettings(rows[0]) });
    return;
  }

  if (req.method === 'PATCH') {
    const patch = req.body || {};
    const setClauses = [];
    const values = [];
    let i = 1;
    for (const [jsKey, column] of Object.entries(WRITABLE_CALENDAR_SETTINGS_COLUMNS)) {
      if (jsKey in patch) {
        setClauses.push(`${column} = $${i++}`);
        values.push(JSONB_CALENDAR_COLUMNS.has(column) ? JSON.stringify(patch[jsKey]) : patch[jsKey]);
      }
    }
    if (!setClauses.length) {
      res.status(400).json({ error: 'no recognized fields in patch body' });
      return;
    }
    setClauses.push('updated_at = NOW()');
    const { rows } = await query(
      `UPDATE calendar_settings SET ${setClauses.join(', ')} WHERE id = 1 RETURNING *`,
      values
    );
    res.status(200).json({ settings: rowToCalendarSettings(rows[0]) });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
