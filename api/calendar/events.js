// GET  /api/calendar/events -> { events: [...] }   list hand-entered meetings
// POST /api/calendar/events -> create one meeting
// Editor-only end to end, like the rest of the Planner.
import { query } from '../_db.js';
import { requireEditor } from '../_auth.js';
import { withErrorHandling } from '../_errors.js';
import { rowToManualEvent } from '../_calendarLogic.js';

export default withErrorHandling(async function handler(req, res) {
  if (!requireEditor(req, res)) return;

  if (req.method === 'GET') {
    const { rows } = await query('SELECT * FROM manual_calendar_events ORDER BY start_time ASC');
    res.status(200).json({ events: rows.map(rowToManualEvent) });
    return;
  }

  if (req.method === 'POST') {
    const d = req.body || {};
    if (!d.title || !d.title.trim()) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const start = new Date(d.start);
    const end = new Date(d.end);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({ error: 'start and end must be valid dates' });
      return;
    }
    if (end <= start) {
      res.status(400).json({ error: 'end must be after start' });
      return;
    }
    const { rows } = await query(
      'INSERT INTO manual_calendar_events (title, start_time, end_time) VALUES ($1, $2, $3) RETURNING *',
      [d.title.trim(), start.toISOString(), end.toISOString()]
    );
    res.status(201).json({ event: rowToManualEvent(rows[0]) });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
