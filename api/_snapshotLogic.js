// Version history for the items table: create a full point-in-time copy
// before anything destructive happens, and restore from one later. Snapshot
// rows store the *raw* DB rows (not the camelCase item shape) so restoring
// is a direct re-insert with no field mapping to get wrong.
import { query, getPool } from './_db.js';
import { rowToItem } from './_itemLogic.js';

const MAX_SNAPSHOTS = 20;

const ITEM_COLUMNS = [
  'id', 'pinned', 'type', 'description', 'function', 'owner', 'raised_by', 'date_raised',
  'priority', 'status', 'due_type', 'due_date', 'frequency', 'percent_complete', 'next_action',
  'stakeholders', 'notes', 'risk_override', 'is_sample', 'created_date', 'last_updated',
  'history', 'created_at', 'updated_at',
];

export async function createItemsSnapshot(reason) {
  const { rows } = await query('SELECT * FROM items ORDER BY id ASC');
  await query(
    'INSERT INTO item_snapshots (reason, item_count, items_json) VALUES ($1, $2, $3)',
    [reason, rows.length, JSON.stringify(rows)]
  );
  // Retention: keep only the most recent MAX_SNAPSHOTS.
  await query(
    `DELETE FROM item_snapshots WHERE id IN (
       SELECT id FROM item_snapshots ORDER BY created_at DESC OFFSET $1
     )`,
    [MAX_SNAPSHOTS]
  );
}

export function rowToSnapshotSummary(row) {
  return {
    id: row.id,
    reason: row.reason,
    itemCount: row.item_count,
    createdAt: row.created_at,
  };
}

// Replaces the entire items table with a snapshot's contents, preserving
// original ids (so history/back-references stay meaningful) and fixing the
// id sequence afterward so future inserts don't collide. Snapshots the
// *current* state first under its own connection/transaction — restoring
// is itself undoable, same safety net as everything else this protects.
export async function restoreItemsSnapshot(snapshotId) {
  const { rows: snapRows } = await query('SELECT * FROM item_snapshots WHERE id = $1', [snapshotId]);
  if (!snapRows.length) return null;
  const snapshot = snapRows[0];

  await createItemsSnapshot(`Before restoring snapshot #${snapshotId} (was: ${snapshot.reason})`);

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM items');
    for (const row of snapshot.items_json) {
      const values = ITEM_COLUMNS.map((c) => {
        const v = row[toCamel(c)] ?? row[c];
        // JSONB columns need an explicit string — pg doesn't auto-serialize
        // plain JS objects/arrays passed as query parameters.
        return c === 'history' ? JSON.stringify(v) : v;
      });
      const placeholders = ITEM_COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
      await client.query(
        `INSERT INTO items (${ITEM_COLUMNS.join(', ')}) OVERRIDING SYSTEM VALUE VALUES (${placeholders})`,
        values
      );
    }
    await client.query(`SELECT setval(pg_get_serial_sequence('items', 'id'), COALESCE((SELECT MAX(id) FROM items), 1))`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const { rows: restoredRows } = await query('SELECT * FROM items ORDER BY id ASC');
  return restoredRows.map(rowToItem);
}

// items_json round-trips through JSON, so Date objects become ISO strings
// and keys stay whatever they were in the DB row (snake_case) — this is
// just a defensive fallback in case a driver version ever camelCases them.
function toCamel(snake) {
  return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
