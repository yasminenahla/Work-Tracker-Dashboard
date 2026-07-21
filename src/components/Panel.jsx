// Side panel: item detail, quick edits (editors only), read-only info
// block, and full activity history (everyone).
import { Field, BufferedField } from './Common.jsx';
import { autoRiskFlag, dueLabel, fmtShortFromISODate, fmtDateTime } from '../lib/datamodel.js';

export function SidePanel({ item: it, lists, riskThresholds, onClose, onUpdate, onEditFull, onDelete, canWrite }) {
  if (!it) return null;
  const autoFlag = autoRiskFlag(it, riskThresholds);
  const patch = (p) => onUpdate(it.id, p);

  return (
    <div className="wt-scrim wt-scrim--panel" onClick={onClose}>
      <div className="wt-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Item details">
        <div className="wt-panel__header">
          <div style={{ minWidth: 0 }}>
            <div className="wt-panel__eyebrow">ITEM {it.id}</div>
            <div className="wt-panel__title">{it.description}</div>
          </div>
          <button type="button" className="wt-panel__close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="wt-panel__body">
          <div className="wt-form-grid">
            <Field label="Status">
              <select className="wt-field-select" value={it.status} disabled={!canWrite} onChange={(e) => patch({ status: e.target.value })}>
                {lists.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select className="wt-field-select" value={it.priority} disabled={!canWrite} onChange={(e) => patch({ priority: e.target.value })}>
                {lists.priorities.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="% Complete">
              <BufferedField
                type="number" min={0} max={100} step={5} className="wt-field-input" value={String(it.percentComplete)} disabled={!canWrite}
                onCommit={(v) => patch({ percentComplete: Math.max(0, Math.min(100, Number(v) || 0)) })}
              />
            </Field>
            <Field label="Owner">
              <select className="wt-field-select" value={it.owner || ''} disabled={!canWrite} onChange={(e) => patch({ owner: e.target.value })}>
                <option value="">— Unassigned —</option>
                {lists.owners.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Next Action">
            <BufferedField className="wt-field-input" value={it.nextAction || ''} disabled={!canWrite} onCommit={(v) => patch({ nextAction: v })} />
          </Field>
          <Field label="Notes">
            <BufferedField as="textarea" rows={3} className="wt-field-textarea" value={it.notes || ''} disabled={!canWrite} onCommit={(v) => patch({ notes: v })} />
          </Field>
          <Field label={`Risk flag (auto: ${autoFlag})`}>
            <select className="wt-field-select" value={it.riskOverride || ''} disabled={!canWrite} onChange={(e) => patch({ riskOverride: e.target.value || null })}>
              <option value="">Auto ({autoFlag})</option>
              <option value="Red">Override: Red</option>
              <option value="Amber">Override: Amber</option>
              <option value="Green">Override: Green</option>
            </select>
          </Field>
          <div className="wt-readonly-grid">
            <div><strong>Function: </strong>{it.function}</div>
            <div><strong>Type: </strong>{it.type}</div>
            <div><strong>Raised by: </strong>{it.raisedBy || '—'}</div>
            <div><strong>Raised: </strong>{fmtShortFromISODate(it.dateRaised)}</div>
            <div><strong>Due/Cadence: </strong>{dueLabel(it)}</div>
            <div><strong>Stakeholders: </strong>{it.stakeholders || '—'}</div>
          </div>
          <div>
            <div className="wt-panel__section-title">Activity / History</div>
            <div className="wt-timeline">
              {it.history && it.history.length ? (
                it.history.map((a, i) => (
                  <div key={i} className="wt-timeline__entry">
                    <div className="wt-timeline__dot" />
                    <div>
                      <div className="wt-timeline__text">{a.change}</div>
                      <div className="wt-timeline__date">{fmtDateTime(a.timestamp)}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="wt-timeline__empty">No activity yet.</div>
              )}
            </div>
          </div>
          {canWrite ? (
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button type="button" className="wt-btn-outline" onClick={() => onEditFull(it.id)}>Edit full item</button>
              <button type="button" className="wt-btn-danger-text" onClick={() => onDelete(it.id)}>Delete item</button>
            </div>
          ) : (
            <div className="wt-readonly-note">View only — unlock editing from the header to make changes.</div>
          )}
        </div>
      </div>
    </div>
  );
}
