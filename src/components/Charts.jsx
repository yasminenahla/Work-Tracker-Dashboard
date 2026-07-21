// Dashboard charts. Hand-rolled (no chart library dependency needed for two
// simple forms): a horizontal bar list for "by Function" and a CSS
// conic-gradient donut for "by Status". Both are click-to-filter and always
// pair color with a direct text label + count, so identity is never
// color-alone.
import { solidColor } from '../lib/colors.js';

// Each bar is stacked by status (same colors as the Status donut) so you
// can see the open-item health of a function at a glance, not just volume.
export function FunctionBarChart({ data, activeValue, onSelect }) {
  const max = Math.max(1, ...data.map((r) => r.count));
  if (data.length === 0) {
    return <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No open items yet.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.map((r) => {
        const isActive = activeValue === r.label;
        const title = `${r.label}: ${r.count} (${r.segments.map((s) => `${s.status} ${s.count}`).join(', ')})`;
        return (
          <button
            key={r.label} type="button" title={title}
            onClick={() => onSelect(isActive ? '' : r.label)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', width: '100%', opacity: !activeValue || isActive ? 1 : 0.55 }}
          >
            <span className="wt-bar-row__label" style={{ fontWeight: isActive ? 700 : 400 }}>{r.label}</span>
            <span className="wt-bar-row__track">
              {r.segments.map((s) => (
                <span key={s.status} className="wt-bar-row__segment" style={{ width: `${(s.count / max) * 100}%`, background: solidColor(s.rgbVar) }} />
              ))}
            </span>
            <span className="wt-bar-row__count">{r.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function buildDonutGradient(rows, total) {
  if (!total) return 'conic-gradient(var(--surface-sunken) 0 100%)';
  let cum = 0;
  const parts = rows.map((r) => {
    const pct = (r.count / total) * 100;
    const part = `${solidColor(r.rgbVar)} ${cum}% ${cum + pct}%`;
    cum += pct;
    return part;
  });
  return `conic-gradient(${parts.join(', ')})`;
}

export function StatusDonutChart({ data, activeValue, onSelect }) {
  const total = data.reduce((s, r) => s + r.count, 0);
  const gradient = buildDonutGradient(data, total);
  return (
    <div className="wt-donut-wrap">
      <div className="wt-donut" style={{ backgroundImage: gradient }}>
        <div className="wt-donut__hole">
          <div className="wt-donut__count">{total}</div>
          <div className="wt-donut__label">items</div>
        </div>
      </div>
      <div className="wt-legend">
        {data.map((r) => {
          const isActive = activeValue === r.label;
          return (
            <button
              key={r.label} type="button" className="wt-legend__row"
              onClick={() => onSelect(isActive ? '' : r.label)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', opacity: !activeValue || isActive ? 1 : 0.5 }}
            >
              <span className="wt-legend__swatch" style={{ background: solidColor(r.rgbVar) }} />
              <span className="wt-legend__label" style={{ fontWeight: isActive ? 700 : 400 }}>{r.label}</span>
              <span className="wt-legend__count">{r.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
