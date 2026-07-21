// Add / Edit performance-review note. Same component for both, mirroring
// ItemFormModal.jsx's pattern.
import { ModalShell, Field, cx } from './Common.jsx';
import { todayISO } from '../lib/datamodel.js';

export function emptyFeedbackDraft() {
  return { person: '', reviewDate: todayISO(), strengths: '', areasForGrowth: '', goals: '', notes: '' };
}

export function feedbackDraftFromEntry(entry) {
  return {
    person: entry.person, reviewDate: entry.reviewDate || todayISO(),
    strengths: entry.strengths || '', areasForGrowth: entry.areasForGrowth || '',
    goals: entry.goals || '', notes: entry.notes || '',
  };
}

export function validateFeedbackDraft(draft) {
  const errors = {};
  if (!draft.person || !draft.person.trim()) errors.person = 'Person is required.';
  return errors;
}

export function FeedbackFormModal({ mode, draft: d, errors, owners, onChange, onCancel, onSave, busy }) {
  const isEdit = mode === 'edit';
  const set = (patch) => onChange({ ...d, ...patch });

  return (
    <ModalShell onClose={onCancel} title={isEdit ? 'Edit review note' : 'New review note'} ariaLabel={isEdit ? 'Edit review note' : 'New review note'}>
      <div className="wt-form-grid">
        <Field label="Person" error={errors.person}>
          <select className={cx('wt-field-select', errors.person && 'has-error')} value={d.person} onChange={(e) => set({ person: e.target.value })}>
            <option value="">Select a person…</option>
            {owners.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Review Date">
          <input type="date" className="wt-field-input" value={d.reviewDate} onChange={(e) => set({ reviewDate: e.target.value })} />
        </Field>
        <Field label="Strengths" full>
          <textarea className="wt-field-textarea" rows={3} placeholder="What's going well…" value={d.strengths} onChange={(e) => set({ strengths: e.target.value })} />
        </Field>
        <Field label="Areas for Growth" full>
          <textarea className="wt-field-textarea" rows={3} placeholder="What to work on…" value={d.areasForGrowth} onChange={(e) => set({ areasForGrowth: e.target.value })} />
        </Field>
        <Field label="Goals / Action Items" full>
          <textarea className="wt-field-textarea" rows={3} placeholder="Agreed next steps…" value={d.goals} onChange={(e) => set({ goals: e.target.value })} />
        </Field>
        <Field label="Notes" full>
          <textarea className="wt-field-textarea" rows={3} placeholder="Anything else worth remembering…" value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
      <div className="wt-modal__footer">
        <button type="button" className="wt-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="wt-btn-primary" style={{ background: 'var(--c-brand-blue)' }} onClick={onSave} disabled={busy}>
          {isEdit ? 'Save changes' : 'Save note'}
        </button>
      </div>
    </ModalShell>
  );
}
