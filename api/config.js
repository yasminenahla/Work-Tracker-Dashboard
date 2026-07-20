// GET   /api/config -> the singleton settings row      (public, read-only)
// PATCH /api/config -> partial update                  (requires editor password)
import { query } from './_db.js';
import { requireEditor } from './_auth.js';
import { withErrorHandling } from './_errors.js';

function rowToConfig(row) {
  return {
    lists: row.lists,
    visibleColumns: row.visible_columns,
    riskThresholds: row.risk_thresholds,
    staleDays: row.stale_days,
    defaultOwner: row.default_owner,
    lastExportedAt: row.last_exported_at,
    sampleDataCleared: row.sample_data_cleared,
  };
}

const WRITABLE_CONFIG_COLUMNS = {
  lists: 'lists',
  visibleColumns: 'visible_columns',
  riskThresholds: 'risk_thresholds',
  staleDays: 'stale_days',
  defaultOwner: 'default_owner',
  lastExportedAt: 'last_exported_at',
  sampleDataCleared: 'sample_data_cleared',
};
const JSONB_COLUMNS = new Set(['lists', 'visible_columns', 'risk_thresholds']);
// Allowlist for cascadeRename.field — never interpolate an arbitrary
// column name into SQL, even from an authenticated request.
const CASCADE_RENAME_FIELDS = new Set(['type', 'function', 'priority', 'status', 'owner']);

export default withErrorHandling(async function handler(req, res) {
  if (req.method === 'GET') {
    const { rows } = await query('SELECT * FROM tracker_config WHERE id = 1');
    if (!rows.length) {
      res.status(404).json({ error: 'tracker_config row missing — did you run the migration?' });
      return;
    }
    res.status(200).json({ config: rowToConfig(rows[0]) });
    return;
  }

  if (req.method === 'PATCH') {
    if (!requireEditor(req, res)) return;
    const patch = req.body || {};
    const setClauses = [];
    const values = [];
    let i = 1;
    for (const [jsKey, column] of Object.entries(WRITABLE_CONFIG_COLUMNS)) {
      if (jsKey in patch) {
        setClauses.push(`${column} = $${i++}`);
        values.push(JSONB_COLUMNS.has(column) ? JSON.stringify(patch[jsKey]) : patch[jsKey]);
      }
    }
    if (!setClauses.length) {
      res.status(400).json({ error: 'no recognized fields in patch body' });
      return;
    }
    setClauses.push('updated_at = NOW()');
    const { rows } = await query(
      `UPDATE tracker_config SET ${setClauses.join(', ')} WHERE id = 1 RETURNING *`,
      values
    );

    // Renaming a dropdown option (e.g. Function "Project" -> "Programme")
    // also updates any existing items that reference the old value, so
    // rows don't silently fall back to free text no longer in the list.
    const cascade = patch.cascadeRename;
    if (cascade && CASCADE_RENAME_FIELDS.has(cascade.field) && cascade.oldValue && cascade.newValue) {
      await query(`UPDATE items SET ${cascade.field} = $1 WHERE ${cascade.field} = $2`, [cascade.newValue, cascade.oldValue]);
    }

    res.status(200).json({ config: rowToConfig(rows[0]) });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
