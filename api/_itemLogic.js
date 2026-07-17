// Server-side item logic: row<->item mapping, history logging, and
// recurring-item rollover. This mirrors src/lib/datamodel.js's history/
// rollover rules but runs here too because writes must be correct
// regardless of which client sent them — the browser's copy is for display
// only. Keep the two in sync if you change the rules.

export function rowToItem(row) {
  return {
    id: row.id,
    pinned: row.pinned,
    type: row.type,
    description: row.description,
    function: row.function,
    owner: row.owner,
    raisedBy: row.raised_by,
    dateRaised: dateOnly(row.date_raised),
    priority: row.priority,
    status: row.status,
    dueType: row.due_type,
    dueDate: dateOnly(row.due_date),
    frequency: row.frequency,
    percentComplete: row.percent_complete,
    nextAction: row.next_action,
    stakeholders: row.stakeholders,
    notes: row.notes,
    riskOverride: row.risk_override,
    isSample: row.is_sample,
    createdDate: dateOnly(row.created_date),
    lastUpdated: dateOnly(row.last_updated),
    history: row.history || [],
  };
}

function dateOnly(v) {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  return new Date(v).toISOString().slice(0, 10);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function fmtShort(isoDate) {
  const d = new Date(isoDate + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}
function historyEntry(change) {
  return { timestamp: new Date().toISOString(), change: `${fmtShort(todayISO())}: ${change}` };
}

function dueLabel(item) {
  if (item.dueType === 'recurring') {
    return item.dueDate ? `${item.frequency} (next ${item.dueDate})` : item.frequency;
  }
  return item.dueDate || '—';
}

// Compares the existing item to an incoming patch and returns history
// entries for status/priority/owner/due-date changes (newest first).
export function historyForChanges(oldItem, patch) {
  const entries = [];
  if ('status' in patch && patch.status !== oldItem.status) {
    entries.push(historyEntry(`Status changed from "${oldItem.status}" to "${patch.status}"`));
  }
  if ('priority' in patch && patch.priority !== oldItem.priority) {
    entries.push(historyEntry(`Priority changed from "${oldItem.priority}" to "${patch.priority}"`));
  }
  if ('owner' in patch && patch.owner !== oldItem.owner) {
    entries.push(historyEntry(`Owner changed from "${oldItem.owner || '—'}" to "${patch.owner || '—'}"`));
  }
  const dueChanged =
    ('dueDate' in patch && patch.dueDate !== oldItem.dueDate) ||
    ('frequency' in patch && patch.frequency !== oldItem.frequency) ||
    ('dueType' in patch && patch.dueType !== oldItem.dueType);
  if (dueChanged) {
    const merged = { ...oldItem, ...patch };
    entries.push(historyEntry(`Due/cadence changed from "${dueLabel(oldItem)}" to "${dueLabel(merged)}"`));
  }
  return entries.reverse(); // oldest-of-this-batch first, so caller can prepend as a block, newest last-in wins position 0 after reverse+unshift below
}

function addInterval(isoDate, frequency) {
  const d = new Date(isoDate + 'T00:00:00Z');
  switch (frequency) {
    case 'Daily': d.setUTCDate(d.getUTCDate() + 1); break;
    case 'Weekly': d.setUTCDate(d.getUTCDate() + 7); break;
    case 'Monthly': d.setUTCMonth(d.getUTCMonth() + 1); break;
    case 'Quarterly': d.setUTCMonth(d.getUTCMonth() + 3); break;
    case 'Annual': d.setUTCFullYear(d.getUTCFullYear() + 1); break;
    default: break;
  }
  return d.toISOString().slice(0, 10);
}

// When a recurring item is marked Completed: reset it to a fresh cycle
// instead of leaving it completed, and return the extra history entry to
// log for the closed-out occurrence. Returns null if this isn't a
// recurring-completion (i.e. nothing to roll over).
export function rollRecurringIfNeeded(oldItem, patch, firstStatus) {
  if (patch.status !== 'Completed' || oldItem.dueType !== 'recurring') return null;
  return {
    status: firstStatus,
    percentComplete: 0,
    dueDate: oldItem.dueDate ? addInterval(oldItem.dueDate, oldItem.frequency) : oldItem.dueDate,
    riskOverride: null,
    historyEntry: historyEntry(`Completed this occurrence (${oldItem.frequency}) — next cycle started`),
  };
}

export const WRITABLE_ITEM_COLUMNS = {
  pinned: 'pinned',
  type: 'type',
  description: 'description',
  function: 'function',
  owner: 'owner',
  raisedBy: 'raised_by',
  dateRaised: 'date_raised',
  priority: 'priority',
  status: 'status',
  dueType: 'due_type',
  dueDate: 'due_date',
  frequency: 'frequency',
  percentComplete: 'percent_complete',
  nextAction: 'next_action',
  stakeholders: 'stakeholders',
  notes: 'notes',
  riskOverride: 'risk_override',
};
