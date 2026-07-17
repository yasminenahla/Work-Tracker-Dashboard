// Client-side display logic: dates, risk/staleness derivation, CSV export.
// History logging and recurring-item rollover are enforced server-side
// (api/_itemLogic.js) since writes must be correct no matter which client
// sent them — this file is read-only/display math over whatever the API
// already returned.

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function pad2(n) { return n < 10 ? `0${n}` : `${n}`; }

export function parseDate(s) {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}
export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
export function daysBetween(a, b) { return Math.round((a.getTime() - b.getTime()) / 86400000); }
export function fmtShort(d) {
  if (!d) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
export function fmtShortFromISODate(s) { return s ? fmtShort(parseDate(s)) : ''; }
export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}
export function relativeTimeFrom(iso) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (isNaN(then)) return null;
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function isOverdue(item) {
  if (item.status === 'Overdue') return true;
  if (item.status === 'Completed') return false;
  const due = parseDate(item.dueDate);
  if (!due) return false;
  return due.getTime() < startOfToday().getTime();
}

export function isStale(item, staleDays) {
  if (item.status === 'Completed') return false;
  const updated = parseDate(item.lastUpdated);
  if (!updated) return false;
  return daysBetween(startOfToday(), updated) >= staleDays;
}

export function autoRiskFlag(item, riskThresholds) {
  if (isOverdue(item) || item.status === 'Blocked') return 'Red';
  if (item.status === 'At Risk') return 'Amber';
  const due = parseDate(item.dueDate);
  if (due && item.status !== 'Completed') {
    const d = daysBetween(due, startOfToday());
    if (d >= 0 && d <= riskThresholds.amberDueWithinDays) return 'Amber';
  }
  return 'Green';
}
export function effectiveRiskFlag(item, riskThresholds) {
  return item.riskOverride || autoRiskFlag(item, riskThresholds);
}

export function dueLabel(item) {
  if (item.dueType === 'recurring') {
    return item.dueDate ? `${item.frequency} (next ${fmtShortFromISODate(item.dueDate)})` : item.frequency;
  }
  return item.dueDate ? fmtShortFromISODate(item.dueDate) : '—';
}

export function isDueThisWeek(item) {
  if (item.status === 'Completed') return false;
  const due = parseDate(item.dueDate);
  if (!due) return false;
  const d = daysBetween(due, startOfToday());
  return d > 0 && d <= 7;
}

const CSV_COLUMNS = [
  { key: 'id', header: 'ID' },
  { key: 'type', header: 'Type' },
  { key: 'description', header: 'Description' },
  { key: 'function', header: 'Function' },
  { key: 'owner', header: 'Owner' },
  { key: 'raisedBy', header: 'Raised By' },
  { key: 'dateRaised', header: 'Date Raised' },
  { key: 'priority', header: 'Priority' },
  { key: 'status', header: 'Status' },
  { key: 'dueDate', header: 'Due Date' },
  { key: 'frequency', header: 'Frequency' },
  { key: 'percentComplete', header: '% Complete' },
  { key: 'nextAction', header: 'Next Action' },
  { key: 'stakeholders', header: 'Stakeholders' },
  { key: 'notes', header: 'Notes' },
  { key: 'lastUpdated', header: 'Last Updated' },
  { key: 'riskFlag', header: 'Risk' },
];

export function itemsToCsv(items, riskThresholds) {
  const rows = items.map((it) => {
    const withRisk = { ...it, riskFlag: effectiveRiskFlag(it, riskThresholds) };
    return CSV_COLUMNS.map((c) => `"${String(withRisk[c.key] ?? '').replace(/"/g, '""')}"`).join(',');
  });
  const header = CSV_COLUMNS.map((c) => `"${c.header}"`).join(',');
  return [header, ...rows].join('\r\n');
}

export function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
