// Server-side item logic: row<->item mapping, history logging, and
// recurring-item rollover. This mirrors src/lib/datamodel.js's history/
// rollover rules but runs here too because writes must be correct
// regardless of which client sent them — the browser's copy is for display
// only. Keep the two in sync if you change the rules.

// `owner` stays a plain TEXT column in Postgres — multiple owners are
// stored as a ", "-joined string (same free-text-comma pattern the
// `stakeholders` field already uses) so no schema migration is needed.
// The API layer is the only place that knows this is really an array.
export function parseOwners(str) {
  return str ? str.split(',').map((s) => s.trim()).filter(Boolean) : [];
}
export function joinOwners(arr) {
  return (arr || []).filter(Boolean).join(', ');
}

export function rowToItem(row) {
  return {
    id: row.id,
    pinned: row.pinned,
    type: row.type,
    description: row.description,
    function: row.function,
    owners: parseOwners(row.owner),
    raisedBy: row.raised_by,
    dateRaised: dateOnly(row.date_raised),
    priority: row.priority,
    status: row.status,
    dueType: row.due_type,
    dueDate: dateOnly(row.due_date),
    secondDueDate: dateOnly(row.due_date_2),
    frequency: row.frequency,
    percentComplete: row.percent_complete,
    nextAction: row.next_action,
    stakeholders: row.stakeholders,
    notes: row.notes,
    riskOverride: row.risk_override,
    completedAt: row.completed_at,
    completedOnTime: row.completed_on_time,
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
function daysBetweenISO(fromISO, toISO) {
  return Math.round((new Date(toISO + 'T00:00:00Z') - new Date(fromISO + 'T00:00:00Z')) / 86400000);
}

function dueLabel(item) {
  if (item.dueType === 'recurring') {
    if (item.frequency === 'Twice Weekly' && item.secondDueDate) {
      return item.dueDate ? `Twice Weekly (next ${item.dueDate} & ${item.secondDueDate})` : 'Twice Weekly';
    }
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
  if ('owners' in patch) {
    const oldJoined = joinOwners(oldItem.owners);
    const newJoined = joinOwners(patch.owners);
    if (oldJoined !== newJoined) {
      entries.push(historyEntry(`Owner(s) changed from "${oldJoined || '—'}" to "${newJoined || '—'}"`));
    }
  }
  const dueChanged =
    ('dueDate' in patch && patch.dueDate !== oldItem.dueDate) ||
    ('secondDueDate' in patch && patch.secondDueDate !== oldItem.secondDueDate) ||
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
    // No fixed pair of weekdays to anchor to, so this snaps to a fixed
    // virtual grid spaced every 3.5 days from an arbitrary epoch and moves
    // to the next grid point — self-correcting (no drift/stuck-parity risk
    // from compounding whole-day gaps) and alternates 3/4 days forever,
    // averaging out to exactly twice a week. Only the very first occurrence
    // (an arbitrary user-picked date, not yet on the grid) may see an
    // off-pattern gap while it snaps in.
    case 'Twice Weekly': {
      const EPOCH_DAYS = Math.floor(Date.UTC(2020, 0, 1) / 86400000);
      const currentDays = Math.floor(d.getTime() / 86400000);
      const gridIndex = Math.round((currentDays - EPOCH_DAYS) * 2 / 7);
      const nextDays = EPOCH_DAYS + Math.round((gridIndex + 1) * 3.5);
      d.setTime(nextDays * 86400000);
      break;
    }
    case 'Weekly': d.setUTCDate(d.getUTCDate() + 7); break;
    case 'Monthly': d.setUTCMonth(d.getUTCMonth() + 1); break;
    case 'Quarterly': d.setUTCMonth(d.getUTCMonth() + 3); break;
    case 'Annual': d.setUTCFullYear(d.getUTCFullYear() + 1); break;
    default: break;
  }
  return d.toISOString().slice(0, 10);
}

// Fires only on a genuine new completion — status transitioning *to*
// Completed, not just staying there across an unrelated edit — and judges
// it against oldItem.dueDate, the due date active for the occurrence just
// finished, captured *before* rollRecurringIfNeeded advances it to the
// next occurrence. Backs the "Completed (On Time)" dashboard card.
export function detectCompletion(oldItem, patch) {
  if (patch.status !== 'Completed' || oldItem.status === 'Completed') return null;
  const today = todayISO();
  const dueDate = oldItem.dueDate;
  const onTime = !dueDate || today <= dueDate;
  const lateByDays = dueDate && !onTime ? daysBetweenISO(dueDate, today) : 0;
  return {
    completedAt: new Date().toISOString(),
    completedOnTime: onTime,
    historyEntry: historyEntry(onTime ? 'Completed on time' : `Completed ${lateByDays} day${lateByDays === 1 ? '' : 's'} late`),
  };
}

// When a recurring item is marked Completed: advance the due date to the
// next occurrence so the cadence keeps moving forward, but leave the
// status/% Complete exactly as set — the item stays visible as "Completed"
// (e.g. under the Status filter) until whoever picks up the next cycle
// changes it themselves, instead of silently reverting the moment it's
// marked done. Returns null if this isn't a recurring-completion (i.e.
// nothing to roll over).
export function rollRecurringIfNeeded(oldItem, patch) {
  if (patch.status !== 'Completed' || oldItem.dueType !== 'recurring') return null;

  // Twice Weekly with an explicit second date pins the cadence to two
  // specific weekdays (e.g. Mon & Thu) instead of the computed 3.5-day
  // grid: swap to the other date, and advance whichever date was just used
  // by a week so it becomes the new "other" date next time.
  if (oldItem.frequency === 'Twice Weekly' && oldItem.secondDueDate && oldItem.dueDate) {
    const nextDue = oldItem.secondDueDate;
    const nextSecondDue = addInterval(oldItem.dueDate, 'Weekly');
    return {
      dueDate: nextDue,
      secondDueDate: nextSecondDue,
      riskOverride: null,
      historyEntry: historyEntry(`Completed this occurrence (Twice Weekly) — next due ${nextDue}`),
    };
  }

  const nextDue = oldItem.dueDate ? addInterval(oldItem.dueDate, oldItem.frequency) : oldItem.dueDate;
  return {
    dueDate: nextDue,
    riskOverride: null,
    historyEntry: historyEntry(`Completed this occurrence (${oldItem.frequency})${nextDue ? ` — next due ${nextDue}` : ''}`),
  };
}

export const WRITABLE_ITEM_COLUMNS = {
  pinned: 'pinned',
  type: 'type',
  description: 'description',
  function: 'function',
  owners: 'owner',
  raisedBy: 'raised_by',
  dateRaised: 'date_raised',
  priority: 'priority',
  status: 'status',
  dueType: 'due_type',
  dueDate: 'due_date',
  secondDueDate: 'due_date_2',
  frequency: 'frequency',
  percentComplete: 'percent_complete',
  nextAction: 'next_action',
  stakeholders: 'stakeholders',
  notes: 'notes',
  riskOverride: 'risk_override',
  completedAt: 'completed_at',
  completedOnTime: 'completed_on_time',
};
