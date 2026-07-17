// Header (incl. editor lock/unlock), banners, and the clickable
// summary-card row.
import { cx } from './Common.jsx';
import { solidColor } from '../lib/colors.js';

export function Header({ functionSubtitle, onOpenSettings, onOpenAdd, isUnlocked, onOpenUnlock, onLock, canWrite }) {
  return (
    <div className="wt-header">
      <div className="wt-header__brand">
        <div className="wt-header__logo">WT</div>
        <div>
          <div className="wt-header__title">Team Work Tracker</div>
          <div className="wt-header__subtitle">{functionSubtitle}</div>
        </div>
      </div>
      <div className="wt-header__actions">
        <button
          type="button"
          className={cx('wt-lock-btn', isUnlocked && 'wt-lock-btn--unlocked')}
          onClick={isUnlocked ? onLock : onOpenUnlock}
          title={isUnlocked ? 'Editing unlocked — click to lock again' : 'Enter the editor password to unlock editing'}
        >
          {isUnlocked ? '🔓 Editing unlocked' : '🔒 View only'}
        </button>
        {canWrite ? (
          <>
            <IconButtonInline title="Settings" onClick={onOpenSettings}>⚙</IconButtonInline>
            <button type="button" className="wt-btn-primary" onClick={onOpenAdd}>+ Add new item</button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function IconButtonInline({ title, onClick, children }) {
  return (
    <button type="button" className="wt-icon-btn" title={title} aria-label={title} onClick={onClick}>
      {children}
    </button>
  );
}

export function StaleBanner({ count, staleDays, onShowStale }) {
  if (!count) return null;
  const suffix = count === 1 ? '' : 's';
  return (
    <div className="wt-banner">
      <span className="wt-banner__icon">⚠</span>
      <span>
        <strong>{count} item{suffix}</strong> haven’t been touched in {staleDays}+ days — consider a status check-in. Use the{' '}
        <button type="button" className="wt-banner__link" onClick={onShowStale}>Stale ({staleDays}+ days)</button> filter below to review them.
      </span>
    </div>
  );
}

export function ExportNudgeBanner({ message, onDismiss }) {
  return (
    <div className="wt-banner wt-banner--info">
      <span className="wt-banner__icon">⤓</span>
      <span>{message}</span>
      <button type="button" className="wt-banner__dismiss" onClick={onDismiss} aria-label="Dismiss">×</button>
    </div>
  );
}

const SUMMARY_CARDS = [
  { key: 'totalOpen', label: 'Total Open', colorVar: '--c-brand-blue-rgb' },
  { key: 'overdue', label: 'Overdue', colorVar: '--c-status-critical-rgb' },
  { key: 'atRisk', label: 'At Risk / Blocked', colorVar: '--c-status-warning-rgb' },
  { key: 'dueThisWeek', label: 'Due This Week', colorVar: '--c-brand-electric-rgb' },
  { key: 'pinned', label: 'Pinned / Watched', colorVar: null },
];

export function SummaryCards({ counts, activeCard, onSelect }) {
  return (
    <div className="wt-summary-grid">
      {SUMMARY_CARDS.map((c) => {
        const isActive = activeCard === c.key;
        return (
          <button
            key={c.key} type="button"
            className={cx('wt-summary-card', isActive && 'wt-summary-card--active')}
            onClick={() => onSelect(isActive ? null : c.key)}
          >
            <div className="wt-summary-card__label">{c.label}</div>
            <div className="wt-summary-card__value" style={{ color: c.colorVar ? solidColor(c.colorVar) : 'var(--text-primary)' }}>
              {counts[c.key]}
            </div>
          </button>
        );
      })}
    </div>
  );
}
