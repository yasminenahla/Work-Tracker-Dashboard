// Small reusable UI pieces shared across the dashboard, table, panel and
// modals. Presentation-only — no data-fetching or storage knowledge.
import { useState } from 'react';
import { functionColorVar, statusColorVar, priorityColorVar, riskColorVar, solidColor, tintColor, progressColorVar } from '../lib/colors.js';

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function FunctionPill({ value, lists }) {
  const rgbVar = functionColorVar(value, lists);
  return (
    <span className="wt-pill" style={{ background: tintColor(rgbVar, 0.12), color: solidColor(rgbVar) }}>
      {value}
    </span>
  );
}

export function StatusPill({ value, lists }) {
  const rgbVar = statusColorVar(value, lists);
  return (
    <span className="wt-pill wt-pill--status" style={{ background: tintColor(rgbVar, 0.14), color: solidColor(rgbVar) }}>
      {value}
    </span>
  );
}

export function PriorityText({ value, lists }) {
  const rgbVar = priorityColorVar(value, lists);
  return <span className="wt-priority-text" style={{ color: solidColor(rgbVar) }}>{value}</span>;
}

export function RiskDot({ flag }) {
  const rgbVar = riskColorVar(flag);
  return <span className="wt-risk-dot" style={{ background: solidColor(rgbVar) }} title={`Risk: ${flag}`} aria-label={`Risk: ${flag}`} />;
}

export function ProgressBar({ value }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="wt-progress">
      <div className="wt-progress__track">
        <div className="wt-progress__fill" style={{ width: `${pct}%`, background: solidColor(progressColorVar(pct)) }} />
      </div>
      <span className="wt-progress__label">{pct}%</span>
    </div>
  );
}

export function IconButton({ title, onClick, children }) {
  return (
    <button type="button" className="wt-icon-btn" title={title} aria-label={title} onClick={onClick}>
      {children}
    </button>
  );
}

export function ModalShell({ onClose, size, title, subtitle, ariaLabel, children }) {
  const sizeClass = size === 'sm' ? 'wt-modal--sm' : size === 'lg' ? 'wt-modal--lg' : '';
  return (
    <div className="wt-scrim" onClick={onClose} role="presentation">
      <div className={cx('wt-modal', sizeClass)} role="dialog" aria-modal="true" aria-label={ariaLabel || title} onClick={(e) => e.stopPropagation()}>
        {title ? <div className="wt-modal__title">{title}</div> : null}
        {subtitle ? <div className="wt-modal__subtitle">{subtitle}</div> : null}
        {children}
      </div>
    </div>
  );
}

// confirmPhrase: for actions too consequential for a plain Cancel/Delete
// (e.g. wiping every item at once) — the Confirm button stays disabled
// until the exact phrase is typed, same pattern GitHub uses for "delete
// this repo".
export function ConfirmDialog({ title, body, onCancel, onConfirm, cancelLabel, confirmLabel, busy, confirmPhrase }) {
  const [typed, setTyped] = useState('');
  const canConfirm = !confirmPhrase || typed === confirmPhrase;
  return (
    <ModalShell onClose={onCancel} size="sm" title={title} ariaLabel={title}>
      <div className="wt-confirm-body">{body}</div>
      {confirmPhrase ? (
        <div style={{ marginTop: 10 }}>
          <div className="wt-field-label">Type <strong>{confirmPhrase}</strong> to confirm</div>
          <input
            className="wt-field-input" autoFocus value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canConfirm && !busy) onConfirm(); }}
          />
        </div>
      ) : null}
      <div className="wt-modal__footer">
        <button type="button" className="wt-btn-ghost" onClick={onCancel}>{cancelLabel || 'Cancel'}</button>
        <button type="button" className="wt-btn-danger" onClick={onConfirm} disabled={busy || !canConfirm}>{confirmLabel || 'Delete'}</button>
      </div>
    </ModalShell>
  );
}

export function Field({ label, error, full, children }) {
  return (
    <div className={cx('wt-field', full && 'wt-field-full')}>
      <div className="wt-field-label">{label}</div>
      {children}
      {error ? <div className="wt-field-error">{error}</div> : null}
    </div>
  );
}
