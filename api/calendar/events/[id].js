// DELETE /api/calendar/events/:id -> remove one hand-entered meeting
// Editor-only, like the rest of the Planner.
import { query } from '../../_db.js';
import { requireEditor } from '../../_auth.js';
import { withErrorHandling } from '../../_errors.js';

export default withErrorHandling(async function handler(req, res) {
  if (!requireEditor(req, res)) return;

  const id = Number(req.query.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'invalid event id' });
    return;
  }

  if (req.method === 'DELETE') {
    await query('DELETE FROM manual_calendar_events WHERE id = $1', [id]);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
