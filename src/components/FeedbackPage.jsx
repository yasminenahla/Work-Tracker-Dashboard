// Performance-review notes page: filterable list of structured entries,
// one per meeting per person. Editor-only end to end (App.jsx only mounts
// this when isUnlocked, and every /api/feedback call is server-gated too).
import { useMemo, useState } from 'react';
import { fmtShortFromISODate } from '../lib/datamodel.js';

function FeedbackCard({ entry, onEdit, onDelete }) {
  return (
    <div className="wt-card wt-feedback-card">
      <div className="wt-feedback-card__header">
        <div>
          <div className="wt-feedback-card__person">{entry.person}</div>
          <div className="wt-feedback-card__date">{fmtShortFromISODate(entry.reviewDate)}</div>
        </div>
        <div className="wt-feedback-card__actions">
          <button type="button" className="wt-btn-ghost" onClick={() => onEdit(entry)}>Edit</button>
          <button type="button" className="wt-btn-danger-text" onClick={() => onDelete(entry.id)}>Delete</button>
        </div>
      </div>
      {entry.strengths ? (
        <div className="wt-feedback-card__section">
          <div className="wt-feedback-card__section-label">Strengths</div>
          <div>{entry.strengths}</div>
        </div>
      ) : null}
      {entry.areasForGrowth ? (
        <div className="wt-feedback-card__section">
          <div className="wt-feedback-card__section-label">Areas for Growth</div>
          <div>{entry.areasForGrowth}</div>
        </div>
      ) : null}
      {entry.goals ? (
        <div className="wt-feedback-card__section">
          <div className="wt-feedback-card__section-label">Goals / Action Items</div>
          <div>{entry.goals}</div>
        </div>
      ) : null}
      {entry.notes ? (
        <div className="wt-feedback-card__section">
          <div className="wt-feedback-card__section-label">Notes</div>
          <div>{entry.notes}</div>
        </div>
      ) : null}
    </div>
  );
}

export function FeedbackPage({ entries, owners, loading, loadError, onRetry, onAdd, onEdit, onDelete }) {
  const [personFilter, setPersonFilter] = useState('');
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    return entries.filter((e) => {
      if (personFilter && e.person !== personFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = [e.person, e.strengths, e.areasForGrowth, e.goals, e.notes].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, personFilter, search]);

  if (loadError) {
    return (
      <div className="wt-card wt-empty-state">
        <div className="wt-empty-state__title">Couldn’t load review notes</div>
        <div className="wt-empty-state__body">{loadError}</div>
        <button type="button" className="wt-btn-outline" onClick={onRetry}>Retry</button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="wt-card wt-loading-state">
        <div className="wt-spinner" />
        <div>Loading review notes…</div>
      </div>
    );
  }

  return (
    <>
      <div className="wt-card wt-toolbar">
        <input
          className="wt-input wt-toolbar__search" placeholder="Search notes, goals, strengths…"
          value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search review notes"
        />
        <select className="wt-select" value={personFilter} aria-label="Filter by person" onChange={(e) => setPersonFilter(e.target.value)}>
          <option value="">All People</option>
          {owners.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <div className="wt-toolbar__spacer" />
        <button type="button" className="wt-btn-primary" style={{ background: 'var(--c-brand-electric)' }} onClick={onAdd}>+ New review note</button>
      </div>

      {entries.length === 0 ? (
        <div className="wt-card wt-empty-state">
          <div className="wt-empty-state__icon">📝</div>
          <div className="wt-empty-state__title">No review notes yet</div>
          <div className="wt-empty-state__body">Turn your 1:1 and performance-review notes into a structured, searchable record per person.</div>
          <button type="button" className="wt-btn-primary" style={{ background: 'var(--c-brand-electric)' }} onClick={onAdd}>+ Add your first note</button>
        </div>
      ) : visible.length === 0 ? (
        <div className="wt-card wt-empty-cell">No notes match the current filters.</div>
      ) : (
        <div className="wt-feedback-grid">
          {visible.map((entry) => (
            <FeedbackCard key={entry.id} entry={entry} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </>
  );
}
