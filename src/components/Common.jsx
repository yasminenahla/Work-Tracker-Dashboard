// Small reusable UI pieces shared across the dashboard, table, panel and
// modals. Presentation-only — no data-fetching or storage knowledge.
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

export function ConfirmDialog({ title, body, onCancel, onConfirm, cancelLabel, confirmLabel, busy }) {
  return (
    <ModalShell onClose={onCancel} size="sm" title={title} ariaLabel={title}>
      <div className="wt-confirm-body">{body}</div>
      <div className="wt-modal__footer">
        <button type="button" className="wt-btn-ghost" onClick={onCancel}>{cancelLabel || 'Cancel'}</button>
        <button type="button" className="wt-btn-danger" onClick={onConfirm} disabled={busy}>{confirmLabel || 'Delete'}</button>
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
