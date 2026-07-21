// Main table: sortable header, per-row pin toggle, inline quick-edit for
// Status/% Complete (editors only), and click-to-open side panel (anyone).
import { cx } from './Common.jsx';
import { FunctionPill, PriorityText, RiskDot } from './Common.jsx';
import { effectiveRiskFlag, isStale, dueLabel, fmtShortFromISODate } from '../lib/datamodel.js';
import { statusColorVar, solidColor, tintColor, progressColorVar } from '../lib/colors.js';
import { COLUMN_DEFS } from '../lib/constants.js';

const SORTABLE_KEYS = new Set([
  'id', 'type', 'function', 'owner', 'raisedBy', 'dateRaised', 'priority', 'status',
  'due', 'percentComplete', 'nextAction', 'stakeholders', 'notes', 'lastUpdated', 'risk',
]);

function getSortValue(item, key, ctx) {
  switch (key) {
    case 'id': return item.id;
    case 'priority': { const pi = ctx.lists.priorities.indexOf(item.priority); return pi < 0 ? 999 : pi; }
    case 'due': return item.dueDate || '9999-99-99';
    case 'percentComplete': return item.percentComplete;
    case 'lastUpdated': return item.lastUpdated || '';
    case 'dateRaised': return item.dateRaised || '';
    case 'risk': { const flag = effectiveRiskFlag(item, ctx.riskThresholds); return flag === 'Red' ? 0 : flag === 'Amber' ? 1 : 2; }
    default: return (item[key] || '').toString().toLowerCase();
  }
}

function sortItems(items, sortKey, sortDir, ctx) {
  if (!sortKey) return items;
  const dir = sortDir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const av = getSortValue(a, sortKey, ctx), bv = getSortValue(b, sortKey, ctx);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

function TableHeaderCell({ col, sortKey, sortDir, onSort }) {
  const sortable = SORTABLE_KEYS.has(col.key);
  const isActive = sortKey === col.key;
  return (
    <th
      className={cx(sortable && 'is-sortable')}
      onClick={sortable ? () => onSort(col.key) : undefined}
      aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {col.label}
      {sortable && isActive ? <span className="wt-table__sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span> : null}
    </th>
  );
}

function TableRow({ item: it, ctx, columns, onTogglePin, onOpenPanel, onQuickEdit, canWrite }) {
  const stale = isStale(it, ctx.staleDays);
  const risk = effectiveRiskFlag(it, ctx.riskThresholds);
  const stop = (e) => e.stopPropagation();

  function renderCell(colKey) {
    switch (colKey) {
      case 'id': return <td key={colKey} className="wt-cell-muted">{it.id}</td>;
      case 'type': return <td key={colKey}>{it.type}</td>;
      case 'function': return <td key={colKey}><FunctionPill value={it.function} lists={ctx.lists} /></td>;
      case 'owner': return <td key={colKey}>{it.owner}</td>;
      case 'raisedBy': return <td key={colKey} className="wt-cell-dim">{it.raisedBy}</td>;
      case 'dateRaised': return <td key={colKey} className="wt-cell-dim">{fmtShortFromISODate(it.dateRaised)}</td>;
      case 'priority': return <td key={colKey}><PriorityText value={it.priority} lists={ctx.lists} /></td>;
      case 'status':
        return (
          <td key={colKey} onClick={stop}>
            <select
              className="wt-inline-select" value={it.status} disabled={!canWrite}
              style={{ background: tintColor(statusColorVar(it.status, ctx.lists), 0.14), color: solidColor(statusColorVar(it.status, ctx.lists)) }}
              onClick={stop}
              onChange={(e) => onQuickEdit(it.id, { status: e.target.value })}
              aria-label={`Status for ${it.description}`}
            >
              {ctx.lists.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </td>
        );
      case 'due': return <td key={colKey} className="wt-cell-dim">{dueLabel(it)}</td>;
      case 'percentComplete':
        return (
          <td key={colKey} onClick={stop}>
            <div className="wt-progress">
              <div className="wt-progress__track">
                <div className="wt-progress__fill" style={{ width: `${it.percentComplete}%`, background: solidColor(progressColorVar(it.percentComplete)) }} />
              </div>
              <input
                type="number" min={0} max={100} step={5} className="wt-progress-input" value={it.percentComplete} disabled={!canWrite}
                onClick={stop}
                onChange={(e) => onQuickEdit(it.id, { percentComplete: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                aria-label={`Percent complete for ${it.description}`}
              />
            </div>
          </td>
        );
      case 'nextAction': return <td key={colKey} className="wt-cell-ellipsis" style={{ color: 'var(--text-secondary)' }}>{it.nextAction}</td>;
      case 'stakeholders': return <td key={colKey} className={cx('wt-cell-ellipsis', 'wt-cell-dim')}>{it.stakeholders}</td>;
      case 'notes': return <td key={colKey} className={cx('wt-cell-ellipsis', 'wt-cell-dim')}>{it.notes}</td>;
      case 'lastUpdated': return <td key={colKey} style={{ color: stale ? solidColor('--c-status-warning-rgb') : 'var(--text-muted)' }}>{fmtShortFromISODate(it.lastUpdated)}</td>;
      case 'risk': return <td key={colKey} style={{ textAlign: 'center' }}><RiskDot flag={risk} /></td>;
      default: return null;
    }
  }

  return (
    <tr
      className={cx(it.pinned && 'is-pinned', stale && 'is-stale')}
      onClick={() => onOpenPanel(it.id)} tabIndex={0} role="button" aria-label={`Open details for ${it.description}`}
    >
      <td style={{ textAlign: 'center' }} onClick={(e) => { e.stopPropagation(); if (canWrite) onTogglePin(it.id); }}>
        <button
          type="button" className="wt-star-btn" disabled={!canWrite}
          style={{ color: it.pinned ? solidColor('--c-brand-tangelo-rgb') : 'var(--text-faint)', cursor: canWrite ? 'pointer' : 'default' }}
          title={canWrite ? (it.pinned ? 'Unpin' : 'Pin to top') : (it.pinned ? 'Pinned' : 'Not pinned')}
          aria-label={it.pinned ? 'Unpin' : 'Pin to top'}
          onClick={(e) => { e.stopPropagation(); if (canWrite) onTogglePin(it.id); }}
        >
          {it.pinned ? '★' : '☆'}
        </button>
      </td>
      <td className="wt-cell-ellipsis wt-cell-desc">{it.description}</td>
      {columns.map((c) => renderCell(c.key))}
    </tr>
  );
}

export function Table({ items, lists, riskThresholds, staleDays, visibleColumns, sortKey, sortDir, onSort, onTogglePin, onOpenPanel, onQuickEdit, totalCount, filtersActive, onClearFilters, canWrite }) {
  const ctx = { lists, riskThresholds, staleDays };
  let sorted = sortItems(items, sortKey, sortDir, ctx);
  sorted = [...sorted].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  const cols = COLUMN_DEFS.filter((c) => visibleColumns[c.key] !== false);

  return (
    <div className="wt-card wt-table-card">
      <div className="wt-table-scroll">
        <table className="wt-table">
          <thead>
            <tr>
              <th style={{ width: 34 }}><span className="wt-visually-hidden">Pin</span></th>
              <th>Description</th>
              {cols.map((c) => <TableHeaderCell key={c.key} col={c} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />)}
            </tr>
          </thead>
          <tbody>
            {sorted.map((it) => (
              <TableRow key={it.id} item={it} ctx={ctx} columns={cols} onTogglePin={onTogglePin} onOpenPanel={onOpenPanel} onQuickEdit={onQuickEdit} canWrite={canWrite} />
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length === 0 ? <div className="wt-empty-cell">No items match the current filters.</div> : null}
      <div className="wt-table-footer">
        <span>Showing {sorted.length} of {totalCount} items</span>
        {filtersActive ? <button type="button" className="wt-btn-danger-text" onClick={onClearFilters}>Clear filters</button> : null}
      </div>
    </div>
  );
}
