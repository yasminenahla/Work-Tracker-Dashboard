// POST /api/snapshots/:id/restore -> replace all items with this
// snapshot's contents (editor-only). Snapshots the current state first, so
// this is itself undoable.
import { requireEditor } from '../../_auth.js';
import { withErrorHandling } from '../../_errors.js';
import { restoreItemsSnapshot } from '../../_snapshotLogic.js';

export default withErrorHandling(async function handler(req, res) {
  if (!requireEditor(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const snapshotId = Number(req.query.id);
  if (!Number.isInteger(snapshotId)) {
    res.status(400).json({ error: 'invalid snapshot id' });
    return;
  }
  const items = await restoreItemsSnapshot(snapshotId);
  if (items === null) {
    res.status(404).json({ error: 'snapshot not found' });
    return;
  }
  res.status(200).json({ ok: true, items });
});
