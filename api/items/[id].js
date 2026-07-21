// PATCH  /api/items/:id -> partial update, with history logging + recurring
//                           rollover applied server-side (requires editor password)
// DELETE /api/items/:id -> delete one item                    (requires editor password)
import { query } from '../_db.js';
import { requireEditor } from '../_auth.js';
import { rowToItem, historyForChanges, rollRecurringIfNeeded, WRITABLE_ITEM_COLUMNS, joinOwners } from '../_itemLogic.js';
import { withErrorHandling } from '../_errors.js';
import { createItemsSnapshot } from '../_snapshotLogic.js';

export default withErrorHandling(async function handler(req, res) {
  const id = Number(req.query.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'invalid item id' });
    return;
  }

  if (req.method === 'DELETE') {
    if (!requireEditor(req, res)) return;
    const { rows: existingRows } = await query('SELECT description FROM items WHERE id = $1', [id]);
    const description = existingRows[0]?.description || `item #${id}`;
    await createItemsSnapshot(`Before deleting "${description}"`);
    await query('DELETE FROM items WHERE id = $1', [id]);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'PATCH') {
    if (!requireEditor(req, res)) return;
    const patch = req.body || {};

    const { rows } = await query('SELECT * FROM items WHERE id = $1', [id]);
    if (!rows.length) {
      res.status(404).json({ error: 'item not found' });
      return;
    }
    const oldItem = rowToItem(rows[0]);

    // Need the configured "first" status to reset a completed recurring
    // item to — read it from tracker_config.lists.statuses[0].
    const configRes = await query('SELECT lists FROM tracker_config WHERE id = 1');
    const firstStatus = configRes.rows[0]?.lists?.statuses?.[0] || 'Not Started';

    let history = historyForChanges(oldItem, patch);
    let finalPatch = { ...patch };
    const rollover = rollRecurringIfNeeded(oldItem, patch, firstStatus);
    if (rollover) {
      history = [rollover.historyEntry, ...history];
      finalPatch = {
        ...finalPatch,
        status: rollover.status,
        percentComplete: rollover.percentComplete,
        dueDate: rollover.dueDate,
        riskOverride: rollover.riskOverride,
      };
    }
    const newHistory = [...history, ...oldItem.history];

    const setClauses = [];
    const values = [];
    let i = 1;
    for (const [jsKey, column] of Object.entries(WRITABLE_ITEM_COLUMNS)) {
      if (jsKey in finalPatch) {
        setClauses.push(`${column} = $${i++}`);
        values.push(jsKey === 'owners' ? joinOwners(finalPatch[jsKey]) : finalPatch[jsKey]);
      }
    }
    setClauses.push(`last_updated = $${i++}`);
    values.push(new Date().toISOString().slice(0, 10));
    setClauses.push(`history = $${i++}`);
    values.push(JSON.stringify(newHistory));
    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const { rows: updatedRows } = await query(
      `UPDATE items SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    res.status(200).json({ item: rowToItem(updatedRows[0]) });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
