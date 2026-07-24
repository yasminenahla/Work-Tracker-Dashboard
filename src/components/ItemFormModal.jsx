// Add / Edit item modal — same component for both; `mode` only changes the
// title/button copy and whether percentComplete is shown.
import { ModalShell, Field, cx, OwnersMultiSelect } from './Common.jsx';
import { todayISO } from '../lib/datamodel.js';
import { FREQUENCIES, DEFAULT_FREQUENCY } from '../lib/constants.js';

export function emptyDraft(config) {
  return {
    description: '', type: config.lists.types[0] || '', function: config.lists.functions[0] || '',
    owners: config.defaultOwner ? [config.defaultOwner] : [], raisedBy: '', dateRaised: todayISO(),
    priority: config.lists.priorities[0] || '', status: config.lists.statuses[0] || '',
    dueType: 'date', dueDate: '', secondDueDate: '', frequency: DEFAULT_FREQUENCY,
    nextAction: '', stakeholders: '', notes: '', percentComplete: 0,
  };
}

export function draftFromItem(item) {
  return {
    description: item.description, type: item.type, function: item.function, owners: item.owners || [],
    raisedBy: item.raisedBy || '', dateRaised: item.dateRaised || todayISO(), priority: item.priority,
    status: item.status, dueType: item.dueType, dueDate: item.dueDate || '', secondDueDate: item.secondDueDate || '',
    frequency: item.frequency || DEFAULT_FREQUENCY,
    nextAction: item.nextAction || '', stakeholders: item.stakeholders || '', notes: item.notes || '',
    percentComplete: item.percentComplete,
  };
}

export function validateDraft(draft) {
  const errors = {};
  if (!draft.description.trim()) errors.description = 'Description is required.';
  if (!draft.function) errors.function = 'Function is required.';
  return errors;
}

export function ItemFormModal({ mode, draft: d, errors, lists, onChange, onCancel, onSave, busy }) {
  const isEdit = mode === 'edit';
  const set = (patch) => onChange({ ...d, ...patch });

  return (
    <ModalShell onClose={onCancel} title={isEdit ? 'Edit item' : 'Add new item'} ariaLabel={isEdit ? 'Edit item' : 'Add new item'}>
      <div className="wt-form-grid">
        <Field label="Description" full error={errors.description}>
          <input
            className={cx('wt-field-input', errors.description && 'has-error')} value={d.description}
            placeholder="What’s the work item?" autoFocus
            onChange={(e) => set({ description: e.target.value })}
          />
        </Field>
        <Field label="Type of Work">
          <select className="wt-field-select" value={d.type} onChange={(e) => set({ type: e.target.value })}>
            {lists.types.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Function" error={errors.function}>
          <select className={cx('wt-field-select', errors.function && 'has-error')} value={d.function} onChange={(e) => set({ function: e.target.value })}>
            {lists.functions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Owner(s)" full>
          <OwnersMultiSelect owners={d.owners} allOwners={lists.owners} onChange={(owners) => set({ owners })} />
        </Field>
        <Field label="Raised By">
          <input className="wt-field-input" value={d.raisedBy} onChange={(e) => set({ raisedBy: e.target.value })} />
        </Field>
        <Field label="Priority">
          <select className="wt-field-select" value={d.priority} onChange={(e) => set({ priority: e.target.value })}>
            {lists.priorities.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className="wt-field-select" value={d.status} onChange={(e) => set({ status: e.target.value })}>
            {lists.statuses.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Date Raised">
          <input type="date" className="wt-field-input" value={d.dateRaised} onChange={(e) => set({ dateRaised: e.target.value })} />
        </Field>
        {isEdit ? (
          <Field label="% Complete">
            <input
              type="number" min={0} max={100} step={5} className="wt-field-input" value={d.percentComplete}
              onChange={(e) => set({ percentComplete: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            />
          </Field>
        ) : <div />}
        <div className="wt-field-full">
          <div className="wt-field-label">Due</div>
          <div className="wt-due-toggle">
            <button type="button" className={cx(d.dueType === 'date' && 'is-active')} onClick={() => set({ dueType: 'date' })}>One-off date</button>
            <button type="button" className={cx(d.dueType === 'recurring' && 'is-active')} onClick={() => set({ dueType: 'recurring' })}>Recurring</button>
          </div>
          {d.dueType === 'date' ? (
            <input type="date" className="wt-field-input" value={d.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
          ) : (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <select className="wt-field-select" style={{ flex: 1, minWidth: 140 }} value={d.frequency} onChange={(e) => set({ frequency: e.target.value })}>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <div style={{ flex: 1, minWidth: 140 }}>
                {d.frequency === 'Twice Weekly' ? <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 3 }}>1st due date</div> : null}
                <input type="date" className="wt-field-input" value={d.dueDate} placeholder="Next due (optional)" onChange={(e) => set({ dueDate: e.target.value })} />
              </div>
              {d.frequency === 'Twice Weekly' ? (
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 3 }}>2nd due date</div>
                  <input type="date" className="wt-field-input" value={d.secondDueDate} placeholder="2nd due date (optional)" onChange={(e) => set({ secondDueDate: e.target.value })} />
                </div>
              ) : null}
            </div>
          )}
        </div>
        <Field label="Next Action" full>
          <input className="wt-field-input" value={d.nextAction} onChange={(e) => set({ nextAction: e.target.value })} />
        </Field>
        <Field label="Stakeholders" full>
          <input className="wt-field-input" value={d.stakeholders} placeholder="Comma-separated names" onChange={(e) => set({ stakeholders: e.target.value })} />
        </Field>
        <Field label="Notes" full>
          <textarea className="wt-field-textarea" rows={2} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
      <div className="wt-modal__footer">
        <button type="button" className="wt-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="wt-btn-primary" style={{ background: 'var(--c-brand-blue)' }} onClick={onSave} disabled={busy}>
          {isEdit ? 'Save changes' : 'Save item'}
        </button>
      </div>
    </ModalShell>
  );
}
