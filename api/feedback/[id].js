// PATCH  /api/feedback/:id -> partial update   (editor-only)
// DELETE /api/feedback/:id -> delete one entry (editor-only)
import { query } from '../_db.js';
import { requireEditor } from '../_auth.js';
import { rowToFeedback, WRITABLE_FEEDBACK_COLUMNS } from '../_feedbackLogic.js';
import { withErrorHandling } from '../_errors.js';

export default withErrorHandling(async function handler(req, res) {
  if (!requireEditor(req, res)) return;

  const id = Number(req.query.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'invalid entry id' });
    return;
  }

  if (req.method === 'DELETE') {
    await query('DELETE FROM feedback_notes WHERE id = $1', [id]);
    res.status(200).json({ ok: true });
    return;
  }

  if (req.method === 'PATCH') {
    const patch = req.body || {};
    const setClauses = [];
    const values = [];
    let i = 1;
    for (const [jsKey, column] of Object.entries(WRITABLE_FEEDBACK_COLUMNS)) {
      if (jsKey in patch) {
        setClauses.push(`${column} = $${i++}`);
        values.push(patch[jsKey]);
      }
    }
    if (!setClauses.length) {
      res.status(400).json({ error: 'no recognized fields in patch body' });
      return;
    }
    setClauses.push('updated_at = NOW()');
    values.push(id);
    const { rows } = await query(
      `UPDATE feedback_notes SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!rows.length) {
      res.status(404).json({ error: 'entry not found' });
      return;
    }
    res.status(200).json({ entry: rowToFeedback(rows[0]) });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
