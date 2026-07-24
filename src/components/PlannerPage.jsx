// Planner page: read-only Outlook link (published ICS feed, no OAuth) plus
// working-hours prefs, and a day-by-day agenda of real meetings alongside
// suggested Focus / Personal Development / Team Support blocks. Editor-only
// end to end, same as Feedback — App.jsx only mounts this when isUnlocked,
// and every /api/calendar/* call is server-gated too.
import { useEffect, useState } from 'react';
import { cx } from './Common.jsx';
import { solidColor } from '../lib/colors.js';

const WEEKDAYS = [
  { value: 0, label: 'Sun' }, { value: 1, label: 'Mon' }, { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' }, { value: 4, label: 'Thu' }, { value: 5, label: 'Fri' }, { value: 6, label: 'Sat' },
];

const COMMON_TIMEZONES = [
  'UTC', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore',
  'Asia/Tokyo', 'Australia/Sydney',
];

const BLOCK_STYLES = {
  busy: { rgbVar: '--c-status-neutral-rgb', label: 'Busy' },
  focus: { rgbVar: '--c-status-info-rgb', label: 'Focus time' },
  development: { rgbVar: '--c-brand-tangelo-rgb', label: 'Personal development' },
  support: { rgbVar: '--c-status-good-rgb', label: 'Team support / open' },
};

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function fmtDayHeading(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', timeZone: 'UTC' });
}
function fmtEventRange(startIso, endIso) {
  const s = new Date(startIso), e = new Date(endIso);
  const dateLabel = s.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
  const timeLabel = `${s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–${e.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  return `${dateLabel}, ${timeLabel}`;
}
function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Fallback/supplement to the ICS link — meetings typed in by hand, for
// anyone who can't publish or share their real calendar. These count as
// busy time in the suggestion algorithm exactly like an ICS event does.
function ManualEventsPanel({ events, error, busy, onAdd, onDelete }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayDateStr());
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [formError, setFormError] = useState(null);

  function submit() {
    setFormError(null);
    if (!title.trim()) { setFormError('Title is required.'); return; }
    const startIso = new Date(`${date}T${start}`).toISOString();
    const endIso = new Date(`${date}T${end}`).toISOString();
    if (new Date(endIso) <= new Date(startIso)) { setFormError('End time must be after start time.'); return; }
    onAdd({ title: title.trim(), start: startIso, end: endIso });
    setTitle('');
  }

  return (
    <div className="wt-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13 }}>Manual meetings</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Can’t share your calendar? Add meetings by hand — these count as busy time too, alongside anything read from an ICS link.
        </div>
      </div>
      {error ? <div className="wt-error-banner">{error}</div> : null}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
        <div>
          <div className="wt-field-label">Title</div>
          <input className="wt-field-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Client call" />
        </div>
        <div>
          <div className="wt-field-label">Date</div>
          <input type="date" className="wt-field-input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <div className="wt-field-label">Start</div>
          <input type="time" className="wt-field-input" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <div className="wt-field-label">End</div>
          <input type="time" className="wt-field-input" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <button type="button" className="wt-add-btn" onClick={submit} disabled={busy}>Add</button>
      </div>
      {formError ? <div className="wt-field-error">{formError}</div> : null}
      {events.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
          {events.map((e) => (
            <div key={e.id} className="wt-list-row">
              <span className="wt-list-row__value">{fmtEventRange(e.start, e.end)} — {e.title}</span>
              <button type="button" className="wt-list-row__remove" title="Remove" onClick={() => onDelete(e.id)}>×</button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No manual meetings added yet.</div>
      )}
    </div>
  );
}

function SettingsForm({ settings, onSave, busy }) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => { setDraft(settings); }, [settings]);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const toggleDay = (day) => {
    const days = draft.workDays.includes(day) ? draft.workDays.filter((d) => d !== day) : [...draft.workDays, day].sort();
    set({ workDays: days });
  };

  return (
    <div className="wt-card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div className="wt-field-label">Outlook calendar link (ICS)</div>
        <input
          className="wt-field-input" placeholder="https://outlook.office.com/owa/calendar/.../calendar.ics"
          value={draft.icsUrl} onChange={(e) => set({ icsUrl: e.target.value })}
        />
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
          In Outlook: Calendar settings → Shared calendars → Publish a calendar → pick your calendar → copy the <strong>ICS</strong> link (not the HTML one). Read-only — nothing is ever written back to your calendar.
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <div className="wt-field-label">Timezone (IANA name)</div>
          <input
            className="wt-field-input" list="wt-tz-list" placeholder="e.g. Asia/Riyadh"
            value={draft.timezone} onChange={(e) => set({ timezone: e.target.value })}
          />
          <datalist id="wt-tz-list">
            {COMMON_TIMEZONES.map((tz) => <option key={tz} value={tz} />)}
          </datalist>
        </div>
        <div />
        <div>
          <div className="wt-field-label">Working hours start</div>
          <input type="time" className="wt-field-input" value={draft.workStart} onChange={(e) => set({ workStart: e.target.value })} />
        </div>
        <div>
          <div className="wt-field-label">Working hours end</div>
          <input type="time" className="wt-field-input" value={draft.workEnd} onChange={(e) => set({ workEnd: e.target.value })} />
        </div>
      </div>
      <div>
        <div className="wt-field-label">Working days</div>
        <div className="wt-due-toggle" style={{ maxWidth: 420 }}>
          {WEEKDAYS.map((w) => (
            <button
              key={w.value} type="button" className={cx(draft.workDays.includes(w.value) && 'is-active')}
              onClick={() => toggleDay(w.value)}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <div className="wt-field-label">Focus block length (minutes)</div>
          <input
            type="number" min={15} max={240} step={15} className="wt-field-input" value={draft.focusBlockMinutes}
            onChange={(e) => set({ focusBlockMinutes: Math.max(15, Number(e.target.value) || 15) })}
          />
        </div>
        <div>
          <div className="wt-field-label">Personal development target (minutes/week)</div>
          <input
            type="number" min={0} max={600} step={15} className="wt-field-input" value={draft.devTimeWeeklyMinutes}
            onChange={(e) => set({ devTimeWeeklyMinutes: Math.max(0, Number(e.target.value) || 0) })}
          />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="wt-btn-primary" style={{ background: 'var(--c-brand-blue)' }} onClick={() => onSave(draft)} disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </div>
  );
}

export function PlannerPage({
  settings, settingsError, onSaveSettings, settingsBusy,
  manualEvents, manualEventsError, manualEventsBusy, onAddManualEvent, onDeleteManualEvent,
  schedule, scheduleLoading, scheduleError, onRefresh, onOpenItem,
}) {
  const [settingsOpen, setSettingsOpen] = useState(!settings || !settings.icsUrl);
  useEffect(() => { if (settings && !settings.icsUrl) setSettingsOpen(true); }, [settings?.icsUrl]);

  if (!settings) {
    return (
      <div className="wt-card wt-loading-state">
        <div className="wt-spinner" />
        <div>Loading Planner settings…</div>
      </div>
    );
  }

  const hasAnySource = !!settings.icsUrl || (manualEvents || []).length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="wt-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Planner</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            Suggested Focus, Personal Development, and Team Support time around your real meetings.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="wt-btn-outline" onClick={() => setSettingsOpen((v) => !v)}>{settingsOpen ? 'Hide settings' : 'Settings'}</button>
          {hasAnySource ? (
            <button type="button" className="wt-btn-outline" onClick={onRefresh} disabled={scheduleLoading}>
              {scheduleLoading ? 'Refreshing…' : '⟳ Refresh'}
            </button>
          ) : null}
        </div>
      </div>

      {settingsOpen ? (
        <>
          {settingsError ? <div className="wt-error-banner">{settingsError}</div> : null}
          <SettingsForm settings={settings} onSave={onSaveSettings} busy={settingsBusy} />
        </>
      ) : null}

      <ManualEventsPanel
        events={manualEvents || []} error={manualEventsError} busy={manualEventsBusy}
        onAdd={onAddManualEvent} onDelete={onDeleteManualEvent}
      />

      {!hasAnySource ? (
        <div className="wt-card wt-empty-state">
          <div className="wt-empty-state__icon">🗓️</div>
          <div className="wt-empty-state__title">Add your meetings to get started</div>
          <div className="wt-empty-state__body">Paste your published Outlook ICS link above, add meetings by hand below, or both — the Planner suggests Focus, Personal Development, and Team Support blocks around whatever's busy.</div>
        </div>
      ) : scheduleError ? (
        <div className="wt-card wt-empty-state">
          <div className="wt-empty-state__title">Couldn’t load your schedule</div>
          <div className="wt-empty-state__body">{scheduleError}</div>
          <button type="button" className="wt-btn-outline" onClick={onRefresh}>Retry</button>
        </div>
      ) : scheduleLoading && !schedule ? (
        <div className="wt-card wt-loading-state">
          <div className="wt-spinner" />
          <div>Reading your calendar…</div>
        </div>
      ) : schedule && schedule.length === 0 ? (
        <div className="wt-card wt-empty-cell">No working days in the lookahead window — check your working-days setting.</div>
      ) : schedule ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {schedule.map((day) => (
            <div key={day.date} className="wt-card wt-planner-day">
              <div className="wt-planner-day__heading">{fmtDayHeading(day.date)}</div>
              {day.blocks.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Nothing scheduled or suggested.</div>
              ) : (
                <div className="wt-planner-day__blocks">
                  {day.blocks.map((b, i) => {
                    const style = BLOCK_STYLES[b.type] || BLOCK_STYLES.busy;
                    const clickable = b.type === 'focus' && b.itemId;
                    return (
                      <div
                        key={i} className={cx('wt-planner-block', clickable && 'is-clickable')}
                        style={{ borderLeftColor: solidColor(style.rgbVar) }}
                        onClick={clickable ? () => onOpenItem(b.itemId) : undefined}
                        role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}
                      >
                        <span className="wt-planner-block__time">{fmtTime(b.start)}–{fmtTime(b.end)}</span>
                        <span className="wt-planner-block__dot" style={{ background: solidColor(style.rgbVar) }} />
                        <span className="wt-planner-block__label">{b.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
