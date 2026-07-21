// Settings modal: Manage Lists (add/rename/remove Type/Function/Priority/
// Status options), column visibility, risk threshold + default owner, and
// a "clear sample data" action. Everything here edits `config` via the
// onListChange/onToggleColumn/etc callbacks passed from App.jsx, which is
// the only place that talks to /api/config.
import { useState } from 'react';
import { ModalShell, cx, BufferedField } from './Common.jsx';
import { COLUMN_DEFS, LIST_GROUPS } from '../lib/constants.js';
import { fmtDateTime, relativeTimeFrom } from '../lib/datamodel.js';

function ListManagerGroup({ title, values, usageCounts, onAdd, onRemove, onRename }) {
  const [newValue, setNewValue] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingValue, setEditingValue] = useState('');

  function commitAdd() {
    const v = newValue.trim();
    if (!v) return;
    onAdd(v);
    setNewValue('');
  }
  function startRename(i, v) { setEditingIndex(i); setEditingValue(v); }
  function commitRename(oldValue) {
    const v = editingValue.trim();
    if (v && v !== oldValue) onRename(oldValue, v);
    setEditingIndex(null);
  }

  return (
    <div>
      <div className="wt-list-group__title">{title}</div>
      <div className="wt-list-group__items">
        {values.map((v, i) => {
          const count = usageCounts[v] || 0;
          if (editingIndex === i) {
            return (
              <div key={v} className="wt-list-row">
                <input
                  className="wt-field-input" style={{ padding: '4px 6px', fontSize: 12.5 }} value={editingValue} autoFocus
                  onChange={(e) => setEditingValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitRename(v); if (e.key === 'Escape') setEditingIndex(null); }}
                />
                <button type="button" className="wt-add-btn" style={{ padding: '4px 8px' }} onClick={() => commitRename(v)}>Save</button>
              </div>
            );
          }
          return (
            <div key={v} className="wt-list-row">
              <span className="wt-list-row__value">{v}{count ? <span style={{ color: 'var(--text-faint)' }}> ({count})</span> : null}</span>
              <button type="button" className="wt-list-row__remove" style={{ color: 'var(--text-muted)' }} title="Rename" onClick={() => startRename(i, v)}>✎</button>
              <button type="button" className="wt-list-row__remove" title="Remove" onClick={() => onRemove(v)}>×</button>
            </div>
          );
        })}
      </div>
      <div className="wt-list-add-row">
        <input value={newValue} placeholder="Add option" onChange={(e) => setNewValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') commitAdd(); }} />
        <button type="button" className="wt-add-btn" onClick={commitAdd}>Add</button>
      </div>
    </div>
  );
}

export function SettingsModal({
  config, items, hasSeedItems, onClose, onListChange, onToggleColumn, onChangeThreshold, onChangeDefaultOwner,
  onClearSampleData, onRequestClearAll,
  snapshots, snapshotsLoading, snapshotsError, onRetrySnapshots, onTakeSnapshot, snapshotBusy, onRequestRestore,
}) {
  const [tab, setTab] = useState('lists');

  function usageCountsFor(field) {
    const counts = {};
    items.forEach((it) => { counts[it[field]] = (counts[it[field]] || 0) + 1; });
    return counts;
  }

  const tabs = [
    { key: 'lists', label: 'Manage Lists' },
    { key: 'columns', label: 'Columns' },
    { key: 'preferences', label: 'Risk & Defaults' },
    { key: 'data', label: 'Data' },
    { key: 'history', label: 'History' },
  ];

  return (
    <ModalShell onClose={onClose} title="Settings" subtitle="Edit the dropdown options, visible columns, and thresholds used across the tracker. Changes apply immediately." size="lg">
      <div className="wt-settings-tabs">
        {tabs.map((t) => (
          <button key={t.key} type="button" className={cx('wt-settings-tab', tab === t.key && 'is-active')} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === 'lists' ? (
        <div className="wt-lists-grid">
          {LIST_GROUPS.map((g) => (
            <ListManagerGroup
              key={g.key} title={g.title} values={config.lists[g.key]} usageCounts={usageCountsFor(g.itemField)}
              onAdd={(v) => onListChange(g.key, 'add', v)}
              onRemove={(v) => onListChange(g.key, 'remove', v)}
              onRename={(oldV, newV) => onListChange(g.key, 'rename', oldV, newV)}
            />
          ))}
        </div>
      ) : null}

      {tab === 'columns' ? (
        <div className="wt-columns-grid">
          {COLUMN_DEFS.map((c) => (
            <label key={c.key} className="wt-checkbox-row">
              <input type="checkbox" checked={config.visibleColumns[c.key] !== false} onChange={(e) => onToggleColumn(c.key, e.target.checked)} />
              {c.label}
            </label>
          ))}
        </div>
      ) : null}

      {tab === 'preferences' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div className="wt-field-label">Risk flag: mark Amber when due within (days)</div>
            <div className="wt-number-row">
              <BufferedField
                type="number" min={0} max={60} value={String(config.riskThresholds.amberDueWithinDays)}
                onCommit={(v) => onChangeThreshold(Math.max(0, Number(v) || 0))}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Red always applies once an item is overdue or Blocked.</span>
            </div>
          </div>
          <div>
            <div className="wt-field-label">Default owner for new items</div>
            <select className="wt-field-select" style={{ maxWidth: 260 }} value={config.defaultOwner} onChange={(e) => onChangeDefaultOwner(e.target.value)}>
              <option value="">— Unassigned —</option>
              {config.lists.owners.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            {config.lists.owners.length === 0 ? (
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>Add names to the Owners roster in Manage Lists first.</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'data' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="wt-danger-zone">
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>Clear sample data</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                {hasSeedItems ? 'Removes the example rows this tracker was seeded with. Your own items are kept.' : 'Sample data has already been cleared or replaced.'}
              </div>
            </div>
            <button type="button" className="wt-btn-danger" disabled={!hasSeedItems} style={{ opacity: hasSeedItems ? 1 : 0.5 }} onClick={onClearSampleData}>
              Clear sample data
            </button>
          </div>
          <div className="wt-danger-zone">
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>Clear all entries</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                Permanently deletes every item on the tracker — {items.length} item{items.length === 1 ? '' : 's'} right now, including full activity history. This can't be undone.
              </div>
            </div>
            <button type="button" className="wt-btn-danger" disabled={items.length === 0} style={{ opacity: items.length === 0 ? 0.5 : 1 }} onClick={onRequestClearAll}>
              Clear all entries
            </button>
          </div>
        </div>
      ) : null}

      {tab === 'history' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              A snapshot of every item is taken automatically before any delete (single item, sample data, or clearing all) — restoring one puts the tracker back exactly as it was, and undoes nothing else you've done since.
            </div>
            <button type="button" className="wt-btn-outline" style={{ whiteSpace: 'nowrap' }} disabled={snapshotBusy} onClick={onTakeSnapshot}>
              {snapshotBusy ? 'Saving…' : '+ Snapshot now'}
            </button>
          </div>

          {snapshotsError ? (
            <div className="wt-error-banner">
              {snapshotsError} <button type="button" className="wt-btn-outline" style={{ marginLeft: 8 }} onClick={onRetrySnapshots}>Retry</button>
            </div>
          ) : snapshotsLoading ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Loading version history…</div>
          ) : snapshots.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No snapshots yet — one will be taken automatically the first time you delete something.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
              {snapshots.map((s) => (
                <div key={s.id} className="wt-list-row" style={{ alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{s.reason}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }} title={fmtDateTime(s.createdAt)}>
                      {relativeTimeFrom(s.createdAt) || fmtDateTime(s.createdAt)} · {s.itemCount} item{s.itemCount === 1 ? '' : 's'}
                    </div>
                  </div>
                  <button type="button" className="wt-btn-outline" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => onRequestRestore(s)}>Restore</button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="wt-modal__footer">
        <button type="button" className="wt-btn-primary" style={{ background: 'var(--c-brand-blue)' }} onClick={onClose}>Done</button>
      </div>
    </ModalShell>
  );
}
