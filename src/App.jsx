// App root: owns all state, talks to the API (src/lib/apiClient.js), and
// derives every filtered/aggregated view the dashboard needs. Presentation
// components stay dumb; this is the only file that decides *when* to call
// the API.
import { useState, useEffect, useMemo, Fragment } from 'react';
import { Header, StaleBanner, ExportNudgeBanner, SummaryCards } from './components/Dashboard.jsx';
import { FunctionBarChart, StatusDonutChart } from './components/Charts.jsx';
import { Toolbar } from './components/Toolbar.jsx';
import { Table } from './components/Table.jsx';
import { SidePanel } from './components/Panel.jsx';
import { ItemFormModal, emptyDraft, draftFromItem, validateDraft } from './components/ItemFormModal.jsx';
import { SettingsModal } from './components/SettingsModal.jsx';
import { UnlockModal } from './components/UnlockModal.jsx';
import { ConfirmDialog } from './components/Common.jsx';
import * as api from './lib/apiClient.js';
import { UnauthorizedError } from './lib/apiClient.js';
import { getStoredPassword, setStoredPassword, clearStoredPassword, isUnlocked as checkUnlocked } from './lib/auth.js';
import { isOverdue, isDueThisWeek, isStale, relativeTimeFrom, startOfToday, daysBetween, itemsToCsv, downloadCsv, todayISO } from './lib/datamodel.js';
import { functionColorVar, statusColorVar } from './lib/colors.js';
import { LIST_GROUPS } from './lib/constants.js';

function emptyFilters() {
  return { function: '', type: '', status: '', owner: '', stale: false, search: '' };
}

function itemMatchesFilters(it, filters, quickFilter, riskThresholds, staleDays) {
  if (filters.function && it.function !== filters.function) return false;
  if (filters.type && it.type !== filters.type) return false;
  if (filters.status && it.status !== filters.status) return false;
  if (filters.owner && it.owner !== filters.owner) return false;
  if (filters.stale && !isStale(it, staleDays)) return false;
  if (filters.search) {
    const q = filters.search.toLowerCase();
    const hay = [it.description, it.notes, it.owner, it.stakeholders, it.nextAction].join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (quickFilter === 'totalOpen' && it.status === 'Completed') return false;
  if (quickFilter === 'overdue' && !isOverdue(it)) return false;
  if (quickFilter === 'atRisk' && !(it.status === 'At Risk' || it.status === 'Blocked')) return false;
  if (quickFilter === 'dueThisWeek' && !isDueThisWeek(it)) return false;
  if (quickFilter === 'pinned' && !it.pinned) return false;
  return true;
}

export default function App() {
  const [items, setItems] = useState(null);
  const [config, setConfig] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const [filters, setFilters] = useState(emptyFilters());
  const [quickFilter, setQuickFilter] = useState(null);
  const [sort, setSort] = useState({ key: null, dir: 'asc' });

  const [panelItemId, setPanelItemId] = useState(null);
  const [formModal, setFormModal] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportBannerDismissed, setExportBannerDismissed] = useState(false);

  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockError, setUnlockError] = useState(null);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(checkUnlocked());

  async function loadAll() {
    setLoadError(null);
    try {
      let [fetchedItems, fetchedConfig] = await Promise.all([api.fetchItems(), api.fetchConfig()]);
      if (fetchedItems.length === 0 && !fetchedConfig.sampleDataCleared) {
        await api.seedIfEmpty();
        fetchedItems = await api.fetchItems();
      }
      setItems(fetchedItems);
      setConfig(fetchedConfig);
    } catch (err) {
      setLoadError(err.message || 'Could not load the tracker.');
    }
  }

  useEffect(() => { loadAll(); }, []);

  // ---- editor unlock ----
  function openUnlock() { setUnlockError(null); setUnlockOpen(true); }
  async function submitUnlock(password) {
    setUnlockBusy(true);
    setUnlockError(null);
    setStoredPassword(password);
    try {
      // Cheapest write available to validate the password: a no-op config
      // PATCH (still requires the header, still 401s on a wrong password).
      await api.updateConfig({ defaultOwner: config.defaultOwner });
      setIsUnlocked(true);
      setUnlockOpen(false);
    } catch (err) {
      clearStoredPassword();
      setUnlockError(err instanceof UnauthorizedError ? 'Incorrect password.' : err.message);
    } finally {
      setUnlockBusy(false);
    }
  }
  function lock() {
    clearStoredPassword();
    setIsUnlocked(false);
  }

  function handleAuthError(err) {
    if (err instanceof UnauthorizedError) {
      setIsUnlocked(false);
      openUnlock();
      return true;
    }
    return false;
  }

  // ---- item mutations ----
  async function updateItemById(id, patch) {
    try {
      const updated = await api.updateItem(id, patch);
      setItems((prev) => prev.map((it) => (it.id === id ? updated : it)));
    } catch (err) {
      if (!handleAuthError(err)) setActionError(err.message);
    }
  }

  async function addItem(draft) {
    try {
      const created = await api.createItem(draft);
      setItems((prev) => [created, ...prev]);
      return true;
    } catch (err) {
      if (!handleAuthError(err)) setActionError(err.message);
      return false;
    }
  }

  async function editItem(id, draft) {
    return updateItemById(id, {
      description: draft.description.trim(), type: draft.type, function: draft.function, owner: draft.owner,
      raisedBy: draft.raisedBy, dateRaised: draft.dateRaised, priority: draft.priority, status: draft.status,
      dueType: draft.dueType, dueDate: draft.dueDate || null, frequency: draft.dueType === 'recurring' ? draft.frequency : null,
      nextAction: draft.nextAction, stakeholders: draft.stakeholders, notes: draft.notes, percentComplete: draft.percentComplete,
    });
  }

  async function deleteItem(id) {
    try {
      await api.deleteItem(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
      if (panelItemId === id) setPanelItemId(null);
      if (formModal && formModal.id === id) setFormModal(null);
    } catch (err) {
      if (!handleAuthError(err)) setActionError(err.message);
    }
  }

  async function togglePin(id) {
    const current = items.find((it) => it.id === id);
    if (!current) return;
    updateItemById(id, { pinned: !current.pinned });
  }

  async function clearSampleData() {
    try {
      await api.clearSampleItems();
      setItems((prev) => prev.filter((it) => !it.isSample));
      const updated = await api.updateConfig({ sampleDataCleared: true });
      setConfig(updated);
    } catch (err) {
      if (!handleAuthError(err)) setActionError(err.message);
    }
  }

  async function onListChange(groupKey, action, value, newValue) {
    const group = LIST_GROUPS.find((g) => g.key === groupKey);
    let list = config.lists[groupKey].slice();
    const patch = {};
    if (action === 'add') {
      if (!list.includes(value)) list.push(value);
    } else if (action === 'remove') {
      list = list.filter((v) => v !== value);
    } else if (action === 'rename') {
      list = list.map((v) => (v === value ? newValue : v));
    }
    patch.lists = { ...config.lists, [groupKey]: list };
    if (action === 'rename' && group) {
      patch.cascadeRename = { field: group.itemField, oldValue: value, newValue };
    }
    try {
      const updated = await api.updateConfig(patch);
      setConfig(updated);
      if (action === 'rename' && group) {
        setItems((prev) => prev.map((it) => (it[group.itemField] === value ? { ...it, [group.itemField]: newValue } : it)));
      }
    } catch (err) {
      if (!handleAuthError(err)) setActionError(err.message);
    }
  }

  async function toggleColumn(key, visible) {
    try {
      const updated = await api.updateConfig({ visibleColumns: { ...config.visibleColumns, [key]: visible } });
      setConfig(updated);
    } catch (err) {
      if (!handleAuthError(err)) setActionError(err.message);
    }
  }
  async function changeThreshold(days) {
    try {
      const updated = await api.updateConfig({ riskThresholds: { ...config.riskThresholds, amberDueWithinDays: days } });
      setConfig(updated);
    } catch (err) {
      if (!handleAuthError(err)) setActionError(err.message);
    }
  }
  async function changeDefaultOwner(name) {
    try {
      const updated = await api.updateConfig({ defaultOwner: name });
      setConfig(updated);
    } catch (err) {
      if (!handleAuthError(err)) setActionError(err.message);
    }
  }

  function handleSort(key) {
    setSort((prev) => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
  }
  function handleFilterChange(patch) { setFilters((prev) => ({ ...prev, ...patch })); }
  function clearFilters() { setFilters(emptyFilters()); setQuickFilter(null); }

  async function exportCsv(itemsToExport) {
    const csv = itemsToCsv(itemsToExport, config.riskThresholds);
    downloadCsv(csv, `work-tracker-export-${todayISO()}.csv`);
    try {
      const updated = await api.updateConfig({ lastExportedAt: new Date().toISOString() });
      setConfig(updated);
      setExportBannerDismissed(false);
    } catch {
      // Export already happened locally — a failed timestamp save just
      // means the "last exported" banner logic is stale, not worth
      // interrupting the user over.
    }
  }

  const derived = useMemo(() => {
    if (!items || !config) return null;
    const staleDays = config.staleDays;
    const owners = Array.from(new Set(items.map((it) => it.owner).filter(Boolean))).sort();
    const visible = items.filter((it) => itemMatchesFilters(it, filters, quickFilter, config.riskThresholds, staleDays));

    const openItems = items.filter((i) => i.status !== 'Completed');
    const counts = {
      totalOpen: openItems.length,
      overdue: items.filter(isOverdue).length,
      atRisk: items.filter((i) => i.status === 'At Risk' || i.status === 'Blocked').length,
      dueThisWeek: items.filter(isDueThisWeek).length,
      pinned: items.filter((i) => i.pinned).length,
    };

    const funcCounts = {};
    openItems.forEach((i) => { funcCounts[i.function] = (funcCounts[i.function] || 0) + 1; });
    const functionBreakdown = config.lists.functions
      .filter((f) => funcCounts[f])
      .map((f) => ({ label: f, count: funcCounts[f], rgbVar: functionColorVar(f, config.lists) }));

    const statusCounts = {};
    items.forEach((i) => { statusCounts[i.status] = (statusCounts[i.status] || 0) + 1; });
    const statusBreakdown = config.lists.statuses
      .filter((s) => statusCounts[s])
      .map((s) => ({ label: s, count: statusCounts[s], rgbVar: statusColorVar(s, config.lists) }));

    const staleCount = items.filter((i) => isStale(i, staleDays)).length;
    const hasSeedItems = items.some((it) => it.isSample);

    const daysSinceExport = config.lastExportedAt ? daysBetween(startOfToday(), new Date(config.lastExportedAt)) : null;
    const showExportNudge = items.length > 0 && !exportBannerDismissed && (config.lastExportedAt === null || Math.abs(daysSinceExport) >= 7);

    return { owners, visible, counts, functionBreakdown, statusBreakdown, staleCount, hasSeedItems, showExportNudge };
  }, [items, config, filters, quickFilter, exportBannerDismissed]);

  if (loadError) {
    return (
      <div className="wt-app">
        <Header functionSubtitle="Team Work Tracker" onOpenSettings={() => {}} onOpenAdd={() => {}} isUnlocked={false} onOpenUnlock={() => {}} onLock={() => {}} canWrite={false} />
        <div className="wt-main">
          <div className="wt-error-banner">Couldn’t load the tracker: {loadError}</div>
          <button type="button" className="wt-btn-outline" style={{ alignSelf: 'flex-start' }} onClick={loadAll}>Retry</button>
        </div>
      </div>
    );
  }

  if (items === null || config === null) {
    return (
      <div className="wt-app">
        <Header functionSubtitle="Loading…" onOpenSettings={() => {}} onOpenAdd={() => {}} isUnlocked={false} onOpenUnlock={() => {}} onLock={() => {}} canWrite={false} />
        <div className="wt-main">
          <div className="wt-card wt-loading-state">
            <div className="wt-spinner" />
            <div>Loading your tracker…</div>
          </div>
        </div>
      </div>
    );
  }

  const filtersActive = !!(quickFilter || filters.function || filters.type || filters.status || filters.owner || filters.stale || filters.search);
  const panelItem = panelItemId ? items.find((it) => it.id === panelItemId) : null;
  const deleteTarget = deleteConfirmId ? items.find((it) => it.id === deleteConfirmId) : null;

  return (
    <div className="wt-app">
      <Header
        functionSubtitle={config.lists.functions.join(' · ') || 'Your work, tracked'}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAdd={() => setFormModal({ mode: 'add', id: null, draft: emptyDraft(config), errors: {} })}
        isUnlocked={isUnlocked} onOpenUnlock={openUnlock} onLock={lock} canWrite={isUnlocked}
      />
      <div className="wt-main">
        {actionError ? (
          <div className="wt-error-banner">
            {actionError}{' '}
            <button type="button" className="wt-banner__dismiss" style={{ marginLeft: 8 }} onClick={() => setActionError(null)} aria-label="Dismiss">×</button>
          </div>
        ) : null}
        <StaleBanner count={derived.staleCount} staleDays={config.staleDays} onShowStale={() => handleFilterChange({ stale: true })} />
        {derived.showExportNudge ? (
          <ExportNudgeBanner
            message={config.lastExportedAt ? `It’s been ${relativeTimeFrom(config.lastExportedAt)} since your last CSV export — worth backing up.` : 'You haven’t exported a CSV backup yet — worth doing before the list grows.'}
            onDismiss={() => setExportBannerDismissed(true)}
          />
        ) : null}

        {items.length === 0 ? (
          <div className="wt-card wt-empty-state">
            <div className="wt-empty-state__icon">🗂️</div>
            <div className="wt-empty-state__title">No items yet</div>
            <div className="wt-empty-state__body">Add your first item to start tracking SLAs, projects, and ad-hoc work in one place.</div>
            {isUnlocked ? (
              <button type="button" className="wt-btn-primary" style={{ background: 'var(--c-brand-electric)' }} onClick={() => setFormModal({ mode: 'add', id: null, draft: emptyDraft(config), errors: {} })}>
                + Add your first item
              </button>
            ) : (
              <button type="button" className="wt-btn-outline" onClick={openUnlock}>Unlock editing to add an item</button>
            )}
          </div>
        ) : (
          <Fragment>
            <SummaryCards counts={derived.counts} activeCard={quickFilter} onSelect={setQuickFilter} />
            <div className="wt-charts-grid">
              <div className="wt-card wt-chart-card">
                <div className="wt-chart-card__title">Open Items by Function</div>
                <FunctionBarChart data={derived.functionBreakdown} activeValue={filters.function} onSelect={(v) => handleFilterChange({ function: v })} />
              </div>
              <div className="wt-card wt-chart-card">
                <div className="wt-chart-card__title">By Status</div>
                <StatusDonutChart data={derived.statusBreakdown} activeValue={filters.status} onSelect={(v) => handleFilterChange({ status: v })} />
              </div>
            </div>
            <Toolbar
              filters={filters} lists={config.lists} owners={derived.owners} staleDays={config.staleDays}
              lastExportedLabel={config.lastExportedAt ? relativeTimeFrom(config.lastExportedAt) : 'never'}
              onFilterChange={handleFilterChange} onExport={() => exportCsv(derived.visible)}
            />
            <Table
              items={derived.visible} lists={config.lists} riskThresholds={config.riskThresholds} staleDays={config.staleDays}
              visibleColumns={config.visibleColumns} sortKey={sort.key} sortDir={sort.dir} onSort={handleSort}
              onTogglePin={togglePin} onOpenPanel={setPanelItemId} onQuickEdit={updateItemById}
              totalCount={items.length} filtersActive={filtersActive} onClearFilters={clearFilters} canWrite={isUnlocked}
            />
          </Fragment>
        )}
      </div>

      {panelItem ? (
        <SidePanel
          item={panelItem} lists={config.lists} riskThresholds={config.riskThresholds} canWrite={isUnlocked}
          onClose={() => setPanelItemId(null)} onUpdate={updateItemById}
          onEditFull={(id) => setFormModal({ mode: 'edit', id, draft: draftFromItem(panelItem), errors: {} })}
          onDelete={(id) => setDeleteConfirmId(id)}
        />
      ) : null}

      {formModal ? (
        <ItemFormModal
          mode={formModal.mode} draft={formModal.draft} errors={formModal.errors} lists={config.lists}
          onChange={(d) => setFormModal({ ...formModal, draft: d })}
          onCancel={() => setFormModal(null)}
          onSave={async () => {
            const errors = validateDraft(formModal.draft);
            if (Object.keys(errors).length) { setFormModal({ ...formModal, errors }); return; }
            const ok = formModal.mode === 'add' ? await addItem(formModal.draft) : await editItem(formModal.id, formModal.draft);
            if (ok !== false) setFormModal(null);
          }}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsModal
          config={config} items={items} hasSeedItems={derived.hasSeedItems}
          onClose={() => setSettingsOpen(false)}
          onListChange={onListChange} onToggleColumn={toggleColumn}
          onChangeThreshold={changeThreshold} onChangeDefaultOwner={changeDefaultOwner}
          onClearSampleData={clearSampleData}
        />
      ) : null}

      {unlockOpen ? (
        <UnlockModal onClose={() => setUnlockOpen(false)} onSubmit={submitUnlock} error={unlockError} busy={unlockBusy} />
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title="Delete this item?"
          body={<Fragment>This will permanently remove <span className="wt-confirm-item">{deleteTarget.description}</span> and its activity history. This can’t be undone.</Fragment>}
          onCancel={() => setDeleteConfirmId(null)}
          onConfirm={() => { deleteItem(deleteConfirmId); setDeleteConfirmId(null); }}
        />
      ) : null}
    </div>
  );
}
