// GET  /api/items                -> { items: [...] }          (public, read-only)
// POST /api/items                -> create one item           (requires editor password)
// DELETE /api/items?sample=true  -> remove all sample rows     (requires editor password)
// DELETE /api/items?all=true     -> remove EVERY item          (requires editor password)
import { query } from './_db.js';
import { requireEditor } from './_auth.js';
import { rowToItem, joinOwners } from './_itemLogic.js';
import { withErrorHandling } from './_errors.js';
import { createItemsSnapshot } from './_snapshotLogic.js';

export default withErrorHandling(async function handler(req, res) {
  if (req.method === 'GET') {
    const { rows } = await query('SELECT * FROM items ORDER BY id ASC');
    res.status(200).json({ items: rows.map(rowToItem) });
    return;
  }

  if (req.method === 'POST') {
    if (!requireEditor(req, res)) return;
    const d = req.body || {};
    if (!d.description || !d.description.trim()) {
      res.status(400).json({ error: 'description is required' });
      return;
    }
    if (!d.function) {
      res.status(400).json({ error: 'function is required' });
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const history = [{ timestamp: new Date().toISOString(), change: `Item created` }];
    const { rows } = await query(
      `INSERT INTO items (
         pinned, type, description, function, owner, raised_by, date_raised,
         priority, status, due_type, due_date, due_date_2, frequency, percent_complete,
         next_action, stakeholders, notes, is_sample, created_date, last_updated, history
       ) VALUES (false, $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,$13,$14,$15,false,$16,$16,$17)
       RETURNING *`,
      [
        d.type, d.description.trim(), d.function, joinOwners(d.owners), d.raisedBy || '',
        d.dateRaised || today, d.priority, d.status, d.dueType || 'date',
        d.dueType === 'recurring' ? (d.dueDate || null) : (d.dueDate || null),
        d.dueType === 'recurring' && d.frequency === 'Twice Weekly' ? (d.secondDueDate || null) : null,
        d.dueType === 'recurring' ? d.frequency : null,
        d.nextAction || '', d.stakeholders || '', d.notes || '', today,
        JSON.stringify(history),
      ]
    );
    res.status(201).json({ item: rowToItem(rows[0]) });
    return;
  }

  if (req.method === 'DELETE') {
    if (!requireEditor(req, res)) return;
    if (req.query.sample === 'true') {
      await createItemsSnapshot('Before clearing sample data');
      await query('DELETE FROM items WHERE is_sample = true');
      res.status(200).json({ ok: true });
      return;
    }
    if (req.query.all === 'true') {
      await createItemsSnapshot('Before clearing all entries');
      const { rowCount } = await query('DELETE FROM items');
      res.status(200).json({ ok: true, deleted: rowCount });
      return;
    }
    res.status(400).json({ error: 'DELETE /api/items requires ?sample=true or ?all=true (delete a single item via /api/items/:id)' });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
