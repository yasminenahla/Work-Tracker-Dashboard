// PATCH  /api/items/:id -> partial update, with history logging + recurring
//                           rollover applied server-side (requires editor password)
// DELETE /api/items/:id -> delete one item                    (requires editor password)
import { query } from '../_db.js';
import { requireEditor } from '../_auth.js';
import { rowToItem, historyForChanges, detectCompletion, rollRecurringIfNeeded, WRITABLE_ITEM_COLUMNS, joinOwners } from '../_itemLogic.js';
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

    let history = historyForChanges(oldItem, patch);
    let finalPatch = { ...patch };
    const completion = detectCompletion(oldItem, patch);
    if (completion) {
      history = [completion.historyEntry, ...history];
      finalPatch = {
        ...finalPatch,
        completedAt: completion.completedAt,
        completedOnTime: completion.completedOnTime,
      };
    }
    const rollover = rollRecurringIfNeeded(oldItem, patch);
    if (rollover) {
      history = [rollover.historyEntry, ...history];
      finalPatch = {
        ...finalPatch,
        dueDate: rollover.dueDate,
        ...('secondDueDate' in rollover ? { secondDueDate: rollover.secondDueDate } : {}),
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
