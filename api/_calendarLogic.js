// Server-side Planner logic: row<->settings mapping, fetching/parsing a
// published Outlook ICS feed (read-only, no OAuth), and the Focus/Personal
// Development/Team Support suggestion algorithm. Runs entirely server-side
// so the ICS URL (a semi-secret link into the real calendar) never has to
// reach the browser, and so timezone-aware scheduling math happens once in
// one place.
import ical from 'node-ical';

export function rowToCalendarSettings(row) {
  return {
    icsUrl: row.ics_url || '',
    timezone: row.timezone,
    workStart: row.work_start,
    workEnd: row.work_end,
    workDays: row.work_days,
    focusBlockMinutes: row.focus_block_minutes,
    devTimeWeeklyMinutes: row.dev_time_weekly_minutes,
    updatedAt: row.updated_at,
  };
}

export const WRITABLE_CALENDAR_SETTINGS_COLUMNS = {
  icsUrl: 'ics_url',
  timezone: 'timezone',
  workStart: 'work_start',
  workEnd: 'work_end',
  workDays: 'work_days',
  focusBlockMinutes: 'focus_block_minutes',
  devTimeWeeklyMinutes: 'dev_time_weekly_minutes',
};
export const JSONB_CALENDAR_COLUMNS = new Set(['work_days']);

// Hand-entered meetings — a fallback/supplement to the ICS link for anyone
// who can't publish/share their real calendar. Same {start, end, summary}
// shape as an ICS-derived busy block, so the two sources merge trivially.
export function rowToManualEvent(row) {
  return { id: row.id, title: row.title, start: row.start_time, end: row.end_time };
}

export const WRITABLE_MANUAL_EVENT_COLUMNS = {
  title: 'title',
  start: 'start_time',
  end: 'end_time',
};

// ---------------------------------------------------------------------
// ICS fetch + parse
// ---------------------------------------------------------------------

export async function fetchIcsText(url) {
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'work-tracker-dashboard/1.0 (+calendar-planner)' }, redirect: 'follow' });
  } catch {
    throw new Error('Could not reach that calendar link — check the URL and that it\'s publicly reachable.');
  }
  if (!res.ok) {
    throw new Error(`Could not fetch that calendar link (HTTP ${res.status}) — check it's still a valid published/ICS link.`);
  }
  const text = await res.text();
  if (!text.includes('BEGIN:VCALENDAR')) {
    throw new Error('That link did not return calendar (ICS) data — double check you copied the "ICS"/iCalendar link, not a webpage URL.');
  }
  return text;
}

// Busy blocks — {start: Date, end: Date, summary} — for every timed event
// (recurring or not) overlapping [rangeStart, rangeEnd), sorted earliest
// first. Cancelled events, events marked "Show as: Free" (TRANSPARENT), and
// all-day markers are excluded — they don't represent real blocked time and
// would otherwise blank out whole days.
export function getBusyBlocks(icsText, rangeStart, rangeEnd) {
  const data = ical.parseICS(icsText);
  const blocks = [];
  for (const ev of Object.values(data)) {
    if (ev.type !== 'VEVENT' || !ev.start || !ev.end) continue;
    if (ev.status === 'CANCELLED') continue;
    if (ev.transparency === 'TRANSPARENT') continue;

    if (ev.rrule) {
      const instances = ical.expandRecurringEvent(ev, { from: rangeStart, to: rangeEnd, expandOngoing: true });
      for (const inst of instances) {
        if (inst.isFullDay) continue;
        blocks.push({ start: inst.start, end: inst.end, summary: inst.summary || ev.summary || 'Busy' });
      }
    } else {
      if (ev.start.dateOnly) continue;
      if (ev.end > rangeStart && ev.start < rangeEnd) {
        blocks.push({ start: ev.start, end: ev.end, summary: ev.summary || 'Busy' });
      }
    }
  }
  return blocks.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------
// Timezone-aware wall-clock <-> UTC instant helpers
// ---------------------------------------------------------------------

// Good enough for scheduling suggestions (not for legal timestamps): builds
// a UTC guess for the given local wall-clock time, then corrects it using
// the offset Intl reports for that instant in the target timezone. Falls
// back to UTC for an invalid/unrecognized IANA name.
export function zonedTimeToUtc(dateStr, timeStr, timeZone) {
  const tz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const asIfUtc = new Date(utcGuess.toLocaleString('en-US', { timeZone: tz }));
  const offsetMs = utcGuess.getTime() - asIfUtc.getTime();
  return new Date(utcGuess.getTime() + offsetMs);
}

export function isValidTimeZone(tz) {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// 'YYYY-MM-DD' for the given instant, as a calendar date in `timeZone`.
export function dateStrInZone(date, timeZone) {
  const tz = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function weekdayOfDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun .. 6=Sat
}

// ---------------------------------------------------------------------
// Free-gap computation
// ---------------------------------------------------------------------

// Subtracts busy blocks from [windowStart, windowEnd], returning the free
// gaps that remain, each >= minMinutes long.
function freeGaps(windowStart, windowEnd, busyBlocks, minMinutes = 15) {
  const relevant = busyBlocks
    .filter((b) => b.end > windowStart && b.start < windowEnd)
    .map((b) => ({ start: b.start < windowStart ? windowStart : b.start, end: b.end > windowEnd ? windowEnd : b.end }))
    .sort((a, b) => a.start - b.start);

  const gaps = [];
  let cursor = windowStart;
  for (const b of relevant) {
    if (b.start > cursor) gaps.push({ start: cursor, end: b.start });
    if (b.end > cursor) cursor = b.end;
  }
  if (cursor < windowEnd) gaps.push({ start: cursor, end: windowEnd });

  return gaps.filter((g) => (g.end - g.start) / 60000 >= minMinutes);
}

// ---------------------------------------------------------------------
// Item urgency scoring — mirrors src/lib/datamodel.js's overdue/due-this-
// week rules (date-only string comparison, same as the rest of the app),
// evaluated against "today" in the Planner's configured timezone.
// ---------------------------------------------------------------------

export function scoreItemUrgency(item, todayStr) {
  if (item.status === 'Completed') return -1;
  const dueStr = item.dueDate ? String(item.dueDate).slice(0, 10) : null;
  let score = 0;
  const isOverdue = item.status === 'Overdue' || (dueStr && dueStr < todayStr);
  const isDueThisWeek = dueStr && dueStr >= todayStr && dueStr <= addDaysToDateStr(todayStr, 7);
  if (isOverdue) score += 100;
  if (item.status === 'Blocked') score += 60;
  if (item.status === 'At Risk') score += 50;
  if (isDueThisWeek) score += 30;
  if (item.priority === 'High') score += 20;
  else if (item.priority === 'Medium') score += 10;
  return score;
}

// ---------------------------------------------------------------------
// Suggestion algorithm
// ---------------------------------------------------------------------

// Builds a day-by-day agenda of busy blocks plus suggested Focus /
// Personal Development / Team Support blocks across the working days in
// [now, now + daySpan). Deterministic given the same inputs — no randomness
// — so it's fully unit-testable without a live network call.
export function buildSchedule({ settings, busyBlocks, items, now = new Date(), daySpan = 10 }) {
  const tz = isValidTimeZone(settings.timezone) ? settings.timezone : 'UTC';
  const workDays = new Set(settings.workDays && settings.workDays.length ? settings.workDays : [1, 2, 3, 4, 5]);
  const focusMinutes = settings.focusBlockMinutes || 90;
  const devMinutesTarget = settings.devTimeWeeklyMinutes || 120;

  const todayStr = dateStrInZone(now, tz);
  const candidates = (items || [])
    .map((it) => ({ item: it, score: scoreItemUrgency(it, todayStr) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const days = [];
  let cursorDate = todayStr;
  for (let i = 0; i < daySpan; i++) {
    if (workDays.has(weekdayOfDateStr(cursorDate))) {
      const dayStart = zonedTimeToUtc(cursorDate, settings.workStart || '09:00', tz);
      const dayEnd = zonedTimeToUtc(cursorDate, settings.workEnd || '17:00', tz);
      if (dayEnd > now) {
        const effectiveStart = dayStart < now ? now : dayStart;
        if (effectiveStart < dayEnd) {
          days.push({ date: cursorDate, dayStart: effectiveStart, dayEnd, gaps: freeGaps(effectiveStart, dayEnd, busyBlocks) });
        }
      }
    }
    cursorDate = addDaysToDateStr(cursorDate, 1);
  }

  const blocksByDay = new Map(days.map((d) => [d.date, []]));

  // 1. Focus blocks — one per urgent item, earliest available gap first.
  for (const { item } of candidates) {
    outer: for (const day of days) {
      for (let gi = 0; gi < day.gaps.length; gi++) {
        const gap = day.gaps[gi];
        const gapMinutes = (gap.end - gap.start) / 60000;
        if (gapMinutes < Math.min(30, focusMinutes)) continue;
        const blockMinutes = Math.min(focusMinutes, gapMinutes);
        const blockEnd = new Date(gap.start.getTime() + blockMinutes * 60000);
        blocksByDay.get(day.date).push({
          type: 'focus', start: gap.start, end: blockEnd,
          label: `Focus: ${item.description}`, itemId: item.id,
        });
        day.gaps[gi] = blockEnd < gap.end ? { start: blockEnd, end: gap.end } : null;
        day.gaps = day.gaps.filter(Boolean);
        break outer;
      }
    }
  }

  // 2. Personal development — one block per 5-working-day chunk scanned,
  //    placed in whichever remaining gap best fits the target length.
  for (let chunkStart = 0; chunkStart < days.length; chunkStart += 5) {
    const chunk = days.slice(chunkStart, chunkStart + 5);
    let best = null;
    for (const day of chunk) {
      for (let gi = 0; gi < day.gaps.length; gi++) {
        const gap = day.gaps[gi];
        const gapMinutes = (gap.end - gap.start) / 60000;
        if (gapMinutes < 20) continue;
        if (!best || gapMinutes > best.gapMinutes) best = { day, gi, gap, gapMinutes };
      }
    }
    if (best) {
      const blockMinutes = Math.min(devMinutesTarget, best.gapMinutes);
      const blockEnd = new Date(best.gap.start.getTime() + blockMinutes * 60000);
      blocksByDay.get(best.day.date).push({
        type: 'development', start: best.gap.start, end: blockEnd,
        label: 'Personal development time',
      });
      best.day.gaps[best.gi] = blockEnd < best.gap.end ? { start: blockEnd, end: best.gap.end } : null;
      best.day.gaps = best.day.gaps.filter(Boolean);
    }
  }

  // 3. Whatever's left (>= 20 min) is open time — flagged for team support.
  for (const day of days) {
    for (const gap of day.gaps) {
      if ((gap.end - gap.start) / 60000 < 20) continue;
      blocksByDay.get(day.date).push({ type: 'support', start: gap.start, end: gap.end, label: 'Open for team support' });
    }
  }

  return days.map((day) => {
    const busyForDay = busyBlocks
      .filter((b) => b.end > day.dayStart && b.start < day.dayEnd)
      .map((b) => ({ type: 'busy', start: b.start, end: b.end, label: b.summary }));
    const all = [...busyForDay, ...blocksByDay.get(day.date)].sort((a, b) => a.start - b.start);
    return { date: day.date, blocks: all };
  });
}
