// Toolbar: search, dropdown filters, stale toggle, export. Export is a
// pure read action (no editor password needed) since it only downloads
// whatever's already loaded in the browser.
import { cx } from './Common.jsx';

export function Toolbar({ filters, lists, owners, staleDays, lastExportedLabel, onFilterChange, onExport }) {
  const f = filters;
  return (
    <div className="wt-card wt-toolbar">
      <input
        className="wt-input wt-toolbar__search" placeholder="Search description, notes, owner, stakeholders..."
        value={f.search} onChange={(e) => onFilterChange({ search: e.target.value })} aria-label="Search items"
      />
      <select className="wt-select" value={f.function} aria-label="Filter by function" onChange={(e) => onFilterChange({ function: e.target.value })}>
        <option value="">All Functions</option>
        {lists.functions.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <select className="wt-select" value={f.type} aria-label="Filter by type" onChange={(e) => onFilterChange({ type: e.target.value })}>
        <option value="">All Types</option>
        {lists.types.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <select className="wt-select" value={f.status} aria-label="Filter by status" onChange={(e) => onFilterChange({ status: e.target.value })}>
        <option value="">All Statuses</option>
        {lists.statuses.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <select className="wt-select" value={f.priority} aria-label="Filter by priority" onChange={(e) => onFilterChange({ priority: e.target.value })}>
        <option value="">All Priorities</option>
        {lists.priorities.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <select className="wt-select" value={f.owner} aria-label="Filter by owner" onChange={(e) => onFilterChange({ owner: e.target.value })}>
        <option value="">All Owners</option>
        {owners.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <label className={cx('wt-pill-toggle', f.stale && 'wt-pill-toggle--on')}>
        <input type="checkbox" checked={f.stale} onChange={(e) => onFilterChange({ stale: e.target.checked })} />
        Stale ({staleDays}+ days)
      </label>
      <div className="wt-toolbar__spacer" />
      <div className="wt-toolbar__meta">
        <span className="wt-backup-label">Last exported: {lastExportedLabel}</span>
        <button type="button" className="wt-btn-outline" onClick={onExport}>⬇ Export CSV</button>
      </div>
    </div>
  );
}
