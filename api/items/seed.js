// POST /api/items/seed -> inserts the sample rows, but ONLY if the items
// table is currently empty (checked server-side, so this is safe to call
// with no auth — repeated calls after the first are no-ops). Mirrors the
// "seed on first load" behavior from the original artifact.
import { query } from '../_db.js';
import { SAMPLE_ITEMS } from '../_seedData.js';
import { withErrorHandling } from '../_errors.js';
import { joinOwners } from '../_itemLogic.js';

export default withErrorHandling(async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { rows: countRows } = await query('SELECT COUNT(*)::int AS n FROM items');
  if (countRows[0].n > 0) {
    res.status(200).json({ seeded: false, reason: 'items table is not empty' });
    return;
  }

  const today = new Date();
  for (const item of SAMPLE_ITEMS) {
    const dateRaised = offsetISO(today, item.dateRaisedOffset);
    const dueDate = item.dueDateOffset === null ? null : offsetISO(today, item.dueDateOffset);
    const lastUpdated = offsetISO(today, item.lastUpdatedOffset);
    const completedAt = item.completedAtOffset != null ? `${offsetISO(today, item.completedAtOffset)}T09:00:00.000Z` : null;
    const completedOnTime = item.completedOnTime ?? null;
    const history = item.history.map((h) => ({
      timestamp: `${offsetISO(today, h.offset)}T09:00:00.000Z`,
      change: h.change,
    }));
    await query(
      `INSERT INTO items (
         pinned, type, description, function, owner, raised_by, date_raised,
         priority, status, due_type, due_date, frequency, percent_complete,
         next_action, stakeholders, notes, completed_at, completed_on_time,
         is_sample, created_date, last_updated, history
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,true,$7,$19,$20)`,
      [
        item.pinned, item.type, item.description, item.function, joinOwners(item.owners), item.raisedBy,
        dateRaised, item.priority, item.status, item.dueType, dueDate, item.frequency,
        item.percentComplete, item.nextAction, item.stakeholders, item.notes,
        completedAt, completedOnTime, lastUpdated, JSON.stringify(history),
      ]
    );
  }
  res.status(200).json({ seeded: true, count: SAMPLE_ITEMS.length });
});

function offsetISO(base, days) {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
