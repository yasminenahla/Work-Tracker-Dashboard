// GET  /api/snapshots -> { snapshots: [...] } (metadata only, no item data — editor-only)
// POST /api/snapshots -> take a manual checkpoint now              (editor-only)
import { query } from './_db.js';
import { requireEditor } from './_auth.js';
import { withErrorHandling } from './_errors.js';
import { createItemsSnapshot, rowToSnapshotSummary } from './_snapshotLogic.js';

export default withErrorHandling(async function handler(req, res) {
  if (!requireEditor(req, res)) return;

  if (req.method === 'GET') {
    const { rows } = await query('SELECT id, reason, item_count, created_at FROM item_snapshots ORDER BY created_at DESC');
    res.status(200).json({ snapshots: rows.map(rowToSnapshotSummary) });
    return;
  }

  if (req.method === 'POST') {
    await createItemsSnapshot('Manual checkpoint');
    const { rows } = await query('SELECT id, reason, item_count, created_at FROM item_snapshots ORDER BY created_at DESC');
    res.status(201).json({ snapshots: rows.map(rowToSnapshotSummary) });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
