// GET  /api/feedback -> { entries: [...] }   (editor-only — personnel data,
//                                              unlike /api/items this is NOT
//                                              public read)
// POST /api/feedback -> create one entry     (editor-only)
import { query } from './_db.js';
import { requireEditor } from './_auth.js';
import { rowToFeedback } from './_feedbackLogic.js';
import { withErrorHandling } from './_errors.js';

export default withErrorHandling(async function handler(req, res) {
  if (!requireEditor(req, res)) return;

  if (req.method === 'GET') {
    const { rows } = await query('SELECT * FROM feedback_notes ORDER BY review_date DESC, id DESC');
    res.status(200).json({ entries: rows.map(rowToFeedback) });
    return;
  }

  if (req.method === 'POST') {
    const d = req.body || {};
    if (!d.person || !d.person.trim()) {
      res.status(400).json({ error: 'person is required' });
      return;
    }
    const { rows } = await query(
      `INSERT INTO feedback_notes (person, review_date, strengths, areas_for_growth, goals, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        d.person.trim(), d.reviewDate || new Date().toISOString().slice(0, 10),
        d.strengths || '', d.areasForGrowth || '', d.goals || '', d.notes || '',
      ]
    );
    res.status(201).json({ entry: rowToFeedback(rows[0]) });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
