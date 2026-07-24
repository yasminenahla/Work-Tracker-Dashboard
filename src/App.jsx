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
import { ConfirmDialog, cx } from './components/Common.jsx';
import { FeedbackPage } from './components/FeedbackPage.jsx';
import { FeedbackFormModal, emptyFeedbackDraft, feedbackDraftFromEntry, validateFeedbackDraft } from './components/FeedbackFormModal.jsx';
import { PlannerPage } from './components/PlannerPage.jsx';
import * as api from './lib/apiClient.js';
import { UnauthorizedError } from './lib/apiClient.js';
import { getStoredPassword, setStoredPassword, clearStoredPassword, isUnlocked as checkUnlocked } from './lib/auth.js';
import { isOverdue, isDueThisWeek, isStale, relativeTimeFrom, fmtDateTime, startOfToday, daysBetween, itemsToCsv, downloadCsv, todayISO } from './lib/datamodel.js';
import { statusColorVar } from './lib/colors.js';
import { LIST_GROUPS } from './lib/constants.js';

function emptyFilters() {
  return { function: '', type: '', status: '', owner: '', priority: '', stale: false, search: '' };
}

// `exclude` skips one filter dimension's own check — used by the charts so
// e.g. the function breakdown still compares all functions against each
// other under the active quick-filter/search/etc, instead of collapsing to
// a single 100% bar once a function is itself selected.
function itemMatchesFilters(it, filters, quickFilter, riskThresholds, staleDays, exclude) {
  if (exclude !== 'function' && filters.function && it.function !== filters.function) return false;
  if (filters.type && it.type !== filters.type) return false;
  if (exclude !== 'status' && filters.status && it.status !== filters.status) return false;
  if (filters.priority && it.priority !== filters.priority) return false;
  if (filters.owner && !(it.owners || []).includes(filters.owner)) return false;
  if (filters.stale && !isStale(it, staleDays)) return false;
  if (filters.search) {
    const q = filters.search.toLowerCase();
    const hay = [it.description, it.notes, (it.owners || []).join(' '), it.stakeholders, it.nextAction].join(' ').toLowerCase();
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
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);
  const [exportBannerDismissed, setExportBannerDismissed] = useState(false);

  // ---- version history (snapshots) ----
  const [snapshots, setSnapshots] = useState(null);
  const [snapshotsError, setSnapshotsError] = useState(null);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState(null);

  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockError, setUnlockError] = useState(null);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(checkUnlocked());

  // ---- feedback (performance review notes) — editor-only page ----
  const HASH_PAGES = new Set(['feedback', 'planner']);
  const [page, setPage] = useState(() => {
    const hash = window.location.hash.slice(1);
    return HASH_PAGES.has(hash) && checkUnlocked() ? hash : 'tracker';
  });
  const [feedback, setFeedback] = useState(null);
  const [feedbackLoadError, setFeedbackLoadError] = useState(null);
  const [feedbackFormModal, setFeedbackFormModal] = useState(null);
  const [feedbackDeleteConfirmId, setFeedbackDeleteConfirmId] = useState(null);

  // ---- planner (Outlook-linked focus/dev/support suggestions) — editor-only page ----
  const [calendarSettings, setCalendarSettings] = useState(null);
  const [calendarSettingsError, setCalendarSettingsError] = useState(null);
  const [calendarSettingsBusy, setCalendarSettingsBusy] = useState(false);
  const [schedule, setSchedule] = useState(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState(null);

  function navigate(nextPage) {
    setPage(nextPage);
    window.location.hash = HASH_PAGES.has(nextPage) ? nextPage : '';
  }

  // Locking (or a stale stored password rejected by the server) makes the
  // page inaccessible — bounce back to the tracker rather than leave a
  // locked-out empty page showing.
  useEffect(() => {
    if (HASH_PAGES.has(page) && !isUnlocked) navigate('tracker');
  }, [page, isUnlocked]);

  async function loadFeedback() {
    setFeedbackLoadError(null);
    try {
      const entries = await api.fetchFeedback();
      setFeedback(entries);
    } catch (err) {
      if (!handleAuthError(err)) setFeedbackLoadError(err.message || 'Could not load review notes.');
    }
  }

  useEffect(() => {
    if (page === 'feedback' && isUnlocked && feedback === null && !feedbackLoadError) loadFeedback();
  }, [page, isUnlocked]);

  async function loadCalendarSettings() {
    setCalendarSettingsError(null);
    try {
      const settings = await api.fetchCalendarSettings();
      setCalendarSettings(settings);
      return settings;
    } catch (err) {
      if (!handleAuthError(err)) setCalendarSettingsError(err.message || 'Could not load Planner settings.');
      return null;
    }
  }
  async function loadSchedule() {
    setScheduleLoading(true);
    setScheduleError(null);
    try {
      const result = await api.fetchCalendarSuggestions();
      setSchedule(result.needsSetup ? [] : result.schedule);
    } catch (err) {
      if (!handleAuthError(err)) setScheduleError(err.message || 'Could not load your schedule.');
    } finally {
      setScheduleLoading(false);
    }
  }
  async function saveCalendarSettings(draft) {
    setCalendarSettingsBusy(true);
    setCalendarSettingsError(null);
    try {
      const updated = await api.updateCalendarSettings(draft);
      setCalendarSettings(updated);
      if (updated.icsUrl) loadSchedule();
    } catch (err) {
      if (!handleAuthError(err)) setCalendarSettingsError(err.message || 'Could not save Planner settings.');
    } finally {
      setCalendarSettingsBusy(false);
    }
  }
  function openItemFromPlanner(id) {
    navigate('tracker');
    setPanelItemId(id);
  }

  useEffect(() => {
    if (page === 'planner' && isUnlocked && calendarSettings === null && !calendarSettingsError) {
      loadCalendarSettings().then((settings) => {
        if (settings && settings.icsUrl) loadSchedule();
      });
    }
  }, [page, isUnlocked]);

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
    // Don't leave personnel/calendar data sitting in memory once locked.
    setFeedback(null);
    setFeedbackLoadError(null);
    setCalendarSettings(null);
    setCalendarSettingsError(null);
    setSchedule(null);
    setScheduleError(null);
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
      description: draft.description.trim(), type: draft.type, function: draft.function, owners: draft.owners,
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

  async function clearAllItems() {
    try {
      await api.clearAllItems();
      setItems([]);
      setPanelItemId(null);
      setFormModal(null);
      setClearAllConfirmOpen(false);
      setSettingsOpen(false);
    } catch (err) {
      if (!handleAuthError(err)) setActionError(err.message);
    }
  }

  // ---- version history ----
  async function loadSnapshots() {
    setSnapshotsError(null);
    try {
      const list = await api.fetchSnapshots();
      setSnapshots(list);
    } catch (err) {
      if (!handleAuthError(err)) setSnapshotsError(err.message || 'Could not load version history.');
    }
  }
  function openSettings() {
    setSettingsOpen(true);
    loadSnapshots();
  }
  async function takeSnapshot() {
    setSnapshotBusy(true);
    try {
      const list = await api.createSnapshot();
      setSnapshots(list);
    } catch (err) {
      if (!handleAuthError(err)) setActionError(err.message);
    } finally {
      setSnapshotBusy(false);
    }
  }
  async function confirmRestore() {
    if (!restoreTarget) return;
    try {
      const restoredItems = await api.restoreSnapshot(restoreTarget.id);
      setItems(restoredItems);
      setPanelItemId(null);
      setFormModal(null);
      setRestoreTarget(null);
      setSettingsOpen(false);
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
        if (group.key === 'owners') {
          setItems((prev) => prev.map((it) => (
            (it.owners || []).includes(value)
              ? { ...it, owners: it.owners.map((o) => (o === value ? newValue : o)) }
              : it
          )));
        } else {
          setItems((prev) => prev.map((it) => (it[group.itemField] === value ? { ...it, [group.itemField]: newValue } : it)));
        }
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

  // ---- feedback mutations ----
  async function addFeedback(draft) {
    try {
      const created = await api.createFeedback(draft);
      setFeedback((prev) => [created, ...(prev || [])]);
      return true;
    } catch (err) {
      if (!handleAuthError(err)) setActionError(err.message);
      return false;
    }
  }
  async function editFeedback(id, draft) {
    try {
      const updated = await api.updateFeedback(id, draft);
      setFeedback((prev) => (prev || []).map((e) => (e.id === id ? updated : e)));
      return true;
    } catch (err) {
      if (!handleAuthError(err)) setActionError(err.message);
      return false;
    }
  }
  async function deleteFeedbackEntry(id) {
    try {
      await api.deleteFeedback(id);
      setFeedback((prev) => (prev || []).filter((e) => e.id !== id));
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
    const visible = items.filter((it) => itemMatchesFilters(it, filters, quickFilter, config.riskThresholds, staleDays));

    const openItems = items.filter((i) => i.status !== 'Completed');
    const counts = {
      totalOpen: openItems.length,
      overdue: items.filter(isOverdue).length,
      atRisk: items.filter((i) => i.status === 'At Risk' || i.status === 'Blocked').length,
      dueThisWeek: items.filter(isDueThisWeek).length,
      pinned: items.filter((i) => i.pinned).length,
    };

    // Both charts reflect the currently active quick-filter/search/etc, but
    // ignore their own dimension's filter so clicking one bar/slice doesn't
    // collapse the chart down to just itself — you can still compare across
    // functions/statuses while a quick-filter card narrows the data.
    const functionScoped = items.filter((it) =>
      it.status !== 'Completed' && itemMatchesFilters(it, filters, quickFilter, config.riskThresholds, staleDays, 'function'));
    const funcStatusCounts = {};
    functionScoped.forEach((i) => {
      funcStatusCounts[i.function] = funcStatusCounts[i.function] || {};
      funcStatusCounts[i.function][i.status] = (funcStatusCounts[i.function][i.status] || 0) + 1;
    });
    const functionBreakdown = config.lists.functions
      .filter((f) => funcStatusCounts[f])
      .map((f) => {
        const byStatus = funcStatusCounts[f];
        const segments = config.lists.statuses
          .filter((s) => byStatus[s])
          .map((s) => ({ status: s, count: byStatus[s], rgbVar: statusColorVar(s, config.lists) }));
        return { label: f, count: segments.reduce((sum, s) => sum + s.count, 0), segments };
      });

    const statusScoped = items.filter((it) =>
      itemMatchesFilters(it, filters, quickFilter, config.riskThresholds, staleDays, 'status'));
    const statusCounts = {};
    statusScoped.forEach((i) => { statusCounts[i.status] = (statusCounts[i.status] || 0) + 1; });
    const statusBreakdown = config.lists.statuses
      .filter((s) => statusCounts[s])
      .map((s) => ({ label: s, count: statusCounts[s], rgbVar: statusColorVar(s, config.lists) }));

    const staleCount = items.filter((i) => isStale(i, staleDays)).length;
    const hasSeedItems = items.some((it) => it.isSample);

    const daysSinceExport = config.lastExportedAt ? daysBetween(startOfToday(), new Date(config.lastExportedAt)) : null;
    const showExportNudge = items.length > 0 && !exportBannerDismissed && (config.lastExportedAt === null || Math.abs(daysSinceExport) >= 7);

    return { visible, counts, functionBreakdown, statusBreakdown, staleCount, hasSeedItems, showExportNudge };
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

  const filtersActive = !!(quickFilter || filters.function || filters.type || filters.status || filters.priority || filters.owner || filters.stale || filters.search);
  const panelItem = panelItemId ? items.find((it) => it.id === panelItemId) : null;
  const deleteTarget = deleteConfirmId ? items.find((it) => it.id === deleteConfirmId) : null;
  const feedbackDeleteTarget = feedbackDeleteConfirmId && feedback ? feedback.find((e) => e.id === feedbackDeleteConfirmId) : null;

  return (
    <div className="wt-app">
      <Header
        functionSubtitle={config.lists.functions.join(' · ') || 'Your work, tracked'}
        onOpenSettings={openSettings}
        onOpenAdd={() => setFormModal({ mode: 'add', id: null, draft: emptyDraft(config), errors: {} })}
        isUnlocked={isUnlocked} onOpenUnlock={openUnlock} onLock={lock} canWrite={isUnlocked}
      />
      {isUnlocked ? (
        <div className="wt-page-nav">
          <button type="button" className={cx('wt-page-nav__tab', page === 'tracker' && 'is-active')} onClick={() => navigate('tracker')}>Tracker</button>
          <button type="button" className={cx('wt-page-nav__tab', page === 'feedback' && 'is-active')} onClick={() => navigate('feedback')}>Feedback</button>
          <button type="button" className={cx('wt-page-nav__tab', page === 'planner' && 'is-active')} onClick={() => navigate('planner')}>Planner</button>
        </div>
      ) : null}
      <div className="wt-main">
        {actionError ? (
          <div className="wt-error-banner">
            {actionError}{' '}
            <button type="button" className="wt-banner__dismiss" style={{ marginLeft: 8 }} onClick={() => setActionError(null)} aria-label="Dismiss">×</button>
          </div>
        ) : null}

        {page === 'feedback' ? (
          <FeedbackPage
            entries={feedback || []} owners={config.lists.owners}
            loading={feedback === null && !feedbackLoadError} loadError={feedbackLoadError} onRetry={loadFeedback}
            onAdd={() => setFeedbackFormModal({ mode: 'add', id: null, draft: emptyFeedbackDraft(), errors: {} })}
            onEdit={(entry) => setFeedbackFormModal({ mode: 'edit', id: entry.id, draft: feedbackDraftFromEntry(entry), errors: {} })}
            onDelete={(id) => setFeedbackDeleteConfirmId(id)}
          />
        ) : page === 'planner' ? (
          <PlannerPage
            settings={calendarSettings} settingsError={calendarSettingsError} settingsBusy={calendarSettingsBusy}
            onSaveSettings={saveCalendarSettings}
            schedule={schedule} scheduleLoading={scheduleLoading} scheduleError={scheduleError}
            onRefresh={loadSchedule} onOpenItem={openItemFromPlanner}
          />
        ) : (
        <Fragment>
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
              filters={filters} lists={config.lists} owners={config.lists.owners} staleDays={config.staleDays}
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
          onRequestClearAll={() => setClearAllConfirmOpen(true)}
          snapshots={snapshots || []} snapshotsLoading={snapshots === null && !snapshotsError} snapshotsError={snapshotsError}
          onRetrySnapshots={loadSnapshots} onTakeSnapshot={takeSnapshot} snapshotBusy={snapshotBusy}
          onRequestRestore={(s) => setRestoreTarget(s)}
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

      {clearAllConfirmOpen ? (
        <ConfirmDialog
          title="Clear all entries?"
          body={<Fragment>This will permanently delete <span className="wt-confirm-item">all {items.length} item{items.length === 1 ? '' : 's'}</span> on the tracker, including their full activity history. This can’t be undone.</Fragment>}
          confirmPhrase="DELETE ALL"
          confirmLabel="Clear all entries"
          onCancel={() => setClearAllConfirmOpen(false)}
          onConfirm={clearAllItems}
        />
      ) : null}

      {restoreTarget ? (
        <ConfirmDialog
          title="Restore this snapshot?"
          body={
            <Fragment>
              This replaces the current {items.length} item{items.length === 1 ? '' : 's'} with the <span className="wt-confirm-item">{restoreTarget.itemCount} item{restoreTarget.itemCount === 1 ? '' : 's'}</span> from
              this snapshot ("{restoreTarget.reason}", {relativeTimeFrom(restoreTarget.createdAt) || fmtDateTime(restoreTarget.createdAt)}). A snapshot of the current state is taken first, so this itself can be undone.
            </Fragment>
          }
          confirmPhrase="RESTORE"
          confirmLabel="Restore snapshot"
          onCancel={() => setRestoreTarget(null)}
          onConfirm={confirmRestore}
        />
      ) : null}

      {feedbackFormModal ? (
        <FeedbackFormModal
          mode={feedbackFormModal.mode} draft={feedbackFormModal.draft} errors={feedbackFormModal.errors} owners={config.lists.owners}
          onChange={(d) => setFeedbackFormModal({ ...feedbackFormModal, draft: d })}
          onCancel={() => setFeedbackFormModal(null)}
          onSave={async () => {
            const errors = validateFeedbackDraft(feedbackFormModal.draft);
            if (Object.keys(errors).length) { setFeedbackFormModal({ ...feedbackFormModal, errors }); return; }
            const ok = feedbackFormModal.mode === 'add' ? await addFeedback(feedbackFormModal.draft) : await editFeedback(feedbackFormModal.id, feedbackFormModal.draft);
            if (ok !== false) setFeedbackFormModal(null);
          }}
        />
      ) : null}

      {feedbackDeleteTarget ? (
        <ConfirmDialog
          title="Delete this review note?"
          body={<Fragment>This will permanently remove this note for <span className="wt-confirm-item">{feedbackDeleteTarget.person}</span>. This can’t be undone.</Fragment>}
          onCancel={() => setFeedbackDeleteConfirmId(null)}
          onConfirm={() => { deleteFeedbackEntry(feedbackDeleteConfirmId); setFeedbackDeleteConfirmId(null); }}
        />
      ) : null}
    </div>
  );
}
