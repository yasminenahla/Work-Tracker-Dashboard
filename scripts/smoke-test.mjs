// Exercises the api/*.js handlers directly (as functions, not over HTTP):
// create/read/update/delete, auth gating, validation, recurring-item
// rollover, and Manage Lists cascade-rename. Useful after any change to
// api/_itemLogic.js or the migration.
//
// DESTRUCTIVE — it seeds, mutates, and clears data. Point DATABASE_URL at a
// throwaway/local database, never at production.
process.env.EDITOR_PASSWORD = 'test-secret';

import itemsHandler from '../api/items.js';
import itemHandler from '../api/items/[id].js';
import seedHandler from '../api/items/seed.js';
import configHandler from '../api/config.js';
import feedbackHandler from '../api/feedback.js';
import feedbackEntryHandler from '../api/feedback/[id].js';
import snapshotsHandler from '../api/snapshots.js';
import restoreHandler from '../api/snapshots/[id]/restore.js';
import calendarSettingsHandler from '../api/calendar/settings.js';
import calendarSuggestionsHandler from '../api/calendar/suggestions.js';
import calendarEventsHandler from '../api/calendar/events.js';
import calendarEventHandler from '../api/calendar/events/[id].js';

function mockRes() {
  const res = { statusCode: 200 };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}
function mockReq({ method, body, query, headers }) {
  return { method, body: body || {}, query: query || {}, headers: headers || {} };
}
const AUTH = { 'x-editor-password': 'test-secret' };

// A minimal but realistic ICS feed, timed relative to "now" so the test
// stays valid no matter what day it's run — the daily recurrence guarantees
// at least one occurrence lands on a working weekday within the Planner's
// lookahead window regardless of today's weekday.
function buildSampleIcs() {
  const now = new Date();
  const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const oneOffStart = new Date(now.getTime() + 24 * 3600 * 1000);
  const oneOffEnd = new Date(oneOffStart.getTime() + 30 * 60 * 1000);
  const standupStart = new Date(now.getTime() + 2 * 3600 * 1000);
  const standupEnd = new Date(standupStart.getTime() + 15 * 60 * 1000);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'BEGIN:VEVENT', 'UID:smoke-oneoff@example.com', `DTSTAMP:${fmt(now)}`,
    `DTSTART:${fmt(oneOffStart)}`, `DTEND:${fmt(oneOffEnd)}`,
    'SUMMARY:One-off Test Meeting', 'STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:smoke-recurring@example.com', `DTSTAMP:${fmt(now)}`,
    `DTSTART:${standupStart.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`, `DTEND:${fmt(standupEnd)}`,
    'RRULE:FREQ=DAILY;COUNT=14', 'SUMMARY:Daily Recurring Standup', 'STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'END:VEVENT',
    'END:VCALENDAR', '',
  ].join('\r\n');
}

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg);
  console.log('  ok:', msg);
}

async function main() {
  console.log('--- GET /api/items (empty) ---');
  let res = mockRes();
  await itemsHandler(mockReq({ method: 'GET' }), res);
  assert(res.statusCode === 200, 'status 200');
  assert(res.body.items.length === 0, 'no items yet');

  console.log('--- GET /api/config ---');
  res = mockRes();
  await configHandler(mockReq({ method: 'GET' }), res);
  assert(res.statusCode === 200, 'status 200');
  assert(res.body.config.lists.statuses[0] === 'Not Started', 'default lists present');

  console.log('--- POST /api/items/seed ---');
  res = mockRes();
  await seedHandler(mockReq({ method: 'POST' }), res);
  assert(res.statusCode === 200 && res.body.seeded === true, 'seeded 6 rows: ' + JSON.stringify(res.body));

  res = mockRes();
  await seedHandler(mockReq({ method: 'POST' }), res);
  assert(res.body.seeded === false, 'second seed call is a no-op');

  console.log('--- POST /api/items without auth (should 401) ---');
  res = mockRes();
  await itemsHandler(mockReq({ method: 'POST', body: { description: 'x', function: 'UK EHS' } }), res);
  assert(res.statusCode === 401, 'unauthenticated create rejected');

  console.log('--- POST /api/items without description (should 400) ---');
  res = mockRes();
  await itemsHandler(mockReq({ method: 'POST', headers: AUTH, body: { function: 'UK EHS' } }), res);
  assert(res.statusCode === 400, 'validation rejects missing description');

  console.log('--- POST /api/items (create) ---');
  res = mockRes();
  await itemsHandler(mockReq({
    method: 'POST', headers: AUTH,
    body: { description: 'CRUD smoke test item', type: 'Ad-hoc', function: 'UK QFS', owners: ['Tester'], priority: 'High', status: 'Not Started', dueType: 'date', dueDate: null },
  }), res);
  assert(res.statusCode === 201, 'created');
  const created = res.body.item;
  assert(created.description === 'CRUD smoke test item', 'description round-trips');
  assert(Array.isArray(created.owners) && created.owners.length === 1 && created.owners[0] === 'Tester', 'single owner round-trips as an array: ' + JSON.stringify(created.owners));
  assert(created.percentComplete === 0, 'starts at 0%');
  assert(created.history.length === 1 && /Item created/.test(created.history[0].change), 'history has "Item created"');
  console.log('  created id =', created.id);

  console.log('--- PATCH /api/items/:id (status change -> history logged) ---');
  res = mockRes();
  await itemHandler(mockReq({ method: 'PATCH', headers: AUTH, query: { id: String(created.id) }, body: { status: 'In Progress' } }), res);
  assert(res.statusCode === 200, 'patched');
  const patched = res.body.item;
  assert(patched.status === 'In Progress', 'status updated');
  assert(patched.history.length === 2, 'history grew by one entry');
  assert(/Status changed from "Not Started" to "In Progress"/.test(patched.history[0].change), 'history text correct: ' + patched.history[0].change);

  console.log('--- PATCH /api/items/:id (multiple owners) ---');
  res = mockRes();
  await itemHandler(mockReq({ method: 'PATCH', headers: AUTH, query: { id: String(created.id) }, body: { owners: ['Tester', 'Second Owner'] } }), res);
  assert(res.statusCode === 200, 'patched with two owners');
  const multiOwned = res.body.item;
  assert(Array.isArray(multiOwned.owners) && multiOwned.owners.length === 2 && multiOwned.owners.includes('Tester') && multiOwned.owners.includes('Second Owner'), 'both owners present: ' + JSON.stringify(multiOwned.owners));
  assert(/Owner\(s\) changed from "Tester" to "Tester, Second Owner"/.test(multiOwned.history[0].change), 'history logs the owner-list change: ' + multiOwned.history[0].change);

  res = mockRes();
  await itemHandler(mockReq({ method: 'PATCH', headers: AUTH, query: { id: String(created.id) }, body: { owners: [] } }), res);
  assert(res.body.item.owners.length === 0, 'owners can be cleared back to an empty array');

  console.log('--- GET /api/items includes the new item ---');
  res = mockRes();
  await itemsHandler(mockReq({ method: 'GET' }), res);
  assert(res.body.items.some((i) => i.id === created.id), 'new item present in list');
  assert(res.body.items.length === 7, 'seed(6) + created(1) = 7');

  console.log('--- Recurring rollover: complete a recurring item ---');
  const recurringSeed = res.body.items.find((i) => i.dueType === 'recurring' && i.status === 'Not Started');
  assert(!!recurringSeed, 'found a recurring seed item to complete');
  const beforeDue = recurringSeed.dueDate;
  res = mockRes();
  await itemHandler(mockReq({
    method: 'PATCH', headers: AUTH, query: { id: String(recurringSeed.id) },
    body: { status: 'Completed', percentComplete: 100 },
  }), res);
  const rolled = res.body.item;
  assert(rolled.status === 'Completed', 'stays Completed instead of auto-reverting, so it\'s still visible under the Status filter: got ' + rolled.status);
  assert(rolled.percentComplete === 100, '% Complete stays as set, not force-reset to 0: got ' + rolled.percentComplete);
  assert(rolled.dueDate !== beforeDue, 'due date still advances to the next occurrence (' + beforeDue + ' -> ' + rolled.dueDate + ')');
  assert(/Completed this occurrence/.test(rolled.history[0].change), 'rollover history entry present: ' + rolled.history[0].change);

  console.log('--- Recurring item that stayed Completed is picked up manually for the next cycle ---');
  res = mockRes();
  await itemHandler(mockReq({
    method: 'PATCH', headers: AUTH, query: { id: String(recurringSeed.id) },
    body: { status: 'Not Started', percentComplete: 0 },
  }), res);
  assert(res.body.item.status === 'Not Started', 'user can manually restart the next cycle whenever they pick it up');

  console.log('--- "Twice Weekly" frequency: alternates 3/4 days, averaging exactly twice a week ---');
  res = mockRes();
  await itemsHandler(mockReq({
    method: 'POST', headers: AUTH,
    body: {
      description: 'Twice-weekly cadence test', type: 'Recurring Meeting', function: 'UK EHS', priority: 'Low', status: 'Not Started',
      dueType: 'recurring', dueDate: '2026-08-03', frequency: 'Twice Weekly',
    },
  }), res);
  assert(res.statusCode === 201, 'twice-weekly item created');
  let twiceWeeklyItem = res.body.item;
  const gaps = [];
  let previousDue = twiceWeeklyItem.dueDate;
  for (let i = 0; i < 5; i++) {
    res = mockRes();
    await itemHandler(mockReq({ method: 'PATCH', headers: AUTH, query: { id: String(twiceWeeklyItem.id) }, body: { status: 'Completed' } }), res);
    twiceWeeklyItem = res.body.item;
    const gapDays = Math.round((new Date(twiceWeeklyItem.dueDate) - new Date(previousDue)) / 86400000);
    gaps.push(gapDays);
    previousDue = twiceWeeklyItem.dueDate;
  }
  // The very first gap can be off-pattern (the item's initial due date is
  // an arbitrary user-picked date, not yet aligned to the internal 3.5-day
  // grid) — every gap after that must have settled into a clean 3/4
  // alternation that averages to exactly twice a week.
  const settledGaps = gaps.slice(1);
  assert(settledGaps.every((g) => g === 3 || g === 4), 'once settled, every gap is 3 or 4 days: ' + JSON.stringify(gaps));
  assert(settledGaps[0] + settledGaps[1] === 7 && settledGaps[2] + settledGaps[3] === 7, 'settled gaps alternate so every pair sums to exactly 7 days (a genuine twice-weekly average): ' + JSON.stringify(gaps));

  console.log('--- DELETE /api/items/:id ---');
  res = mockRes();
  await itemHandler(mockReq({ method: 'DELETE', headers: AUTH, query: { id: String(created.id) } }), res);
  assert(res.statusCode === 200, 'deleted');
  res = mockRes();
  await itemsHandler(mockReq({ method: 'GET' }), res);
  assert(!res.body.items.some((i) => i.id === created.id), 'item gone after delete');

  console.log('--- PATCH /api/config: rename a Function option + cascade ---');
  res = mockRes();
  await configHandler(mockReq({
    method: 'PATCH', headers: AUTH,
    body: {
      lists: { ...(await (async () => { const r = mockRes(); await configHandler(mockReq({ method: 'GET' }), r); return r.body.config.lists; })()), functions: ['UK EHS', 'UK QFS', 'KSA QFS', 'Cross-functional', 'Programme'] },
      cascadeRename: { field: 'function', oldValue: 'Project', newValue: 'Programme' },
    },
  }), res);
  assert(res.statusCode === 200, 'config patched');
  assert(res.body.config.lists.functions.includes('Programme'), 'list renamed');

  res = mockRes();
  await itemsHandler(mockReq({ method: 'GET' }), res);
  const stillProject = res.body.items.filter((i) => i.function === 'Project');
  const nowProgramme = res.body.items.filter((i) => i.function === 'Programme');
  assert(stillProject.length === 0, 'no items left referencing old "Project" value');
  assert(nowProgramme.length > 0, 'cascaded items now say "Programme": count=' + nowProgramme.length);

  console.log('--- Owners roster: add + rename with cascade (multi-owner aware) ---');
  res = mockRes();
  await configHandler(mockReq({ method: 'GET' }), res);
  const preOwnersConfig = res.body.config;
  assert(Array.isArray(preOwnersConfig.lists.owners), 'owners key exists on lists (migration 0002 applied)');

  res = mockRes();
  await configHandler(mockReq({
    method: 'PATCH', headers: AUTH,
    body: { lists: { ...preOwnersConfig.lists, owners: [...preOwnersConfig.lists.owners, 'R. Match', 'Co-Owner'] } },
  }), res);
  assert(res.body.config.lists.owners.includes('R. Match'), 'owner added to roster');

  // A co-owned item: renaming R. Match must not disturb "Co-Owner".
  res = mockRes();
  await itemsHandler(mockReq({
    method: 'POST', headers: AUTH,
    body: { description: 'Co-owned item', type: 'Ad-hoc', function: 'UK EHS', owners: ['R. Match', 'Co-Owner'], priority: 'Medium', status: 'Not Started' },
  }), res);
  const coOwnedItem = res.body.item;

  res = mockRes();
  await configHandler(mockReq({
    method: 'PATCH', headers: AUTH,
    body: {
      lists: { ...preOwnersConfig.lists, owners: preOwnersConfig.lists.owners.filter((o) => o !== 'R. Match').concat('Rebecca Match', 'Co-Owner') },
      cascadeRename: { field: 'owner', oldValue: 'R. Match', newValue: 'Rebecca Match' },
    },
  }), res);
  assert(res.body.config.lists.owners.includes('Rebecca Match') && !res.body.config.lists.owners.includes('R. Match'), 'owner renamed in roster');

  res = mockRes();
  await itemsHandler(mockReq({ method: 'GET' }), res);
  const stillOldOwner = res.body.items.filter((i) => (i.owners || []).includes('R. Match'));
  const nowNewOwner = res.body.items.filter((i) => (i.owners || []).includes('Rebecca Match'));
  assert(stillOldOwner.length === 0, 'no items left referencing old owner name "R. Match"');
  assert(nowNewOwner.length > 0, 'cascaded items now include "Rebecca Match": count=' + nowNewOwner.length);

  const cascadedCoOwned = res.body.items.find((i) => i.id === coOwnedItem.id);
  assert(cascadedCoOwned.owners.includes('Rebecca Match') && cascadedCoOwned.owners.includes('Co-Owner'), 'co-owner untouched by the cascade rename: ' + JSON.stringify(cascadedCoOwned.owners));

  console.log('--- DELETE /api/items?sample=true (clear sample data) ---');
  res = mockRes();
  await itemsHandler(mockReq({ method: 'DELETE', headers: AUTH, query: { sample: 'true' } }), res);
  assert(res.statusCode === 200, 'sample data cleared');
  res = mockRes();
  await itemsHandler(mockReq({ method: 'GET' }), res);
  assert(res.body.items.every((i) => !i.isSample), 'no sample items remain: ' + res.body.items.length + ' left');

  console.log('--- DELETE /api/items?all=true (clear all entries) ---');
  res = mockRes();
  await itemsHandler(mockReq({ method: 'DELETE', query: { all: 'true' } }), res);
  assert(res.statusCode === 401, 'unauthenticated clear-all rejected');
  res = mockRes();
  await itemsHandler(mockReq({ method: 'DELETE', headers: AUTH, query: { all: 'true' } }), res);
  assert(res.statusCode === 200, 'clear-all succeeded');
  res = mockRes();
  await itemsHandler(mockReq({ method: 'GET' }), res);
  assert(res.body.items.length === 0, 'no items remain after clear-all: ' + res.body.items.length + ' left');

  console.log('--- Version history: auto-snapshot before single-item delete ---');
  res = mockRes();
  await itemsHandler(mockReq({ method: 'POST', headers: AUTH, body: { description: 'Snapshot test A', type: 'Ad-hoc', function: 'UK EHS', priority: 'High', status: 'Not Started' } }), res);
  const itemA = res.body.item;
  res = mockRes();
  await itemsHandler(mockReq({ method: 'POST', headers: AUTH, body: { description: 'Snapshot test B', type: 'Ad-hoc', function: 'UK QFS', priority: 'Low', status: 'Not Started' } }), res);
  const itemB = res.body.item;

  res = mockRes();
  await itemHandler(mockReq({ method: 'DELETE', headers: AUTH, query: { id: String(itemA.id) } }), res);
  assert(res.statusCode === 200, 'item A deleted');

  res = mockRes();
  await snapshotsHandler(mockReq({ method: 'GET', headers: AUTH }), res);
  assert(res.statusCode === 200, 'snapshots listed');
  const autoSnap = res.body.snapshots[0];
  assert(autoSnap.reason.includes('Snapshot test A'), 'auto-snapshot reason mentions deleted item: ' + autoSnap.reason);
  assert(autoSnap.itemCount === 2, 'auto-snapshot captured both items pre-delete: got ' + autoSnap.itemCount);

  console.log('--- Restore: item A comes back with its original id, item B untouched ---');
  res = mockRes();
  await restoreHandler(mockReq({ method: 'POST', query: { id: String(autoSnap.id) } }), res);
  assert(res.statusCode === 401, 'unauthenticated restore rejected');

  res = mockRes();
  await restoreHandler(mockReq({ method: 'POST', headers: AUTH, query: { id: String(autoSnap.id) } }), res);
  assert(res.statusCode === 200, 'restore succeeded');
  assert(res.body.items.length === 2, 'restore returned both items: got ' + res.body.items.length);
  const restoredA = res.body.items.find((i) => i.id === itemA.id);
  const restoredB = res.body.items.find((i) => i.id === itemB.id);
  assert(!!restoredA && restoredA.description === 'Snapshot test A', 'item A restored with its original id and description');
  assert(!!restoredB && restoredB.description === 'Snapshot test B', 'item B still present, untouched by the restore');

  console.log('--- Restoring is itself undoable (pre-restore snapshot was logged) ---');
  res = mockRes();
  await snapshotsHandler(mockReq({ method: 'GET', headers: AUTH }), res);
  const preRestoreSnap = res.body.snapshots[0];
  assert(preRestoreSnap.reason.startsWith('Before restoring snapshot'), 'pre-restore snapshot logged: ' + preRestoreSnap.reason);

  console.log('--- New item created after restore gets a fresh, non-colliding id ---');
  res = mockRes();
  await itemsHandler(mockReq({ method: 'POST', headers: AUTH, body: { description: 'Post-restore item', type: 'Ad-hoc', function: 'UK EHS', priority: 'Medium', status: 'Not Started' } }), res);
  assert(res.statusCode === 201, 'id sequence still healthy after restore: ' + JSON.stringify(res.body));

  console.log('--- Manual "Snapshot now" checkpoint ---');
  res = mockRes();
  await snapshotsHandler(mockReq({ method: 'POST', headers: AUTH }), res);
  assert(res.statusCode === 201 && res.body.snapshots[0].reason === 'Manual checkpoint', 'manual snapshot created');

  console.log('--- Snapshot retention: capped at 20 ---');
  for (let i = 0; i < 25; i++) {
    res = mockRes();
    await snapshotsHandler(mockReq({ method: 'POST', headers: AUTH }), res);
  }
  assert(res.body.snapshots.length === 20, 'retention prunes down to 20: got ' + res.body.snapshots.length);

  console.log('--- Feedback: GET without auth is rejected (editor-only, unlike /api/items) ---');
  res = mockRes();
  await feedbackHandler(mockReq({ method: 'GET' }), res);
  assert(res.statusCode === 401, 'unauthenticated feedback read rejected');

  console.log('--- Feedback: create, list, update, delete ---');
  res = mockRes();
  await feedbackHandler(mockReq({ method: 'GET', headers: AUTH }), res);
  assert(res.statusCode === 200 && res.body.entries.length === 0, 'feedback starts empty');

  res = mockRes();
  await feedbackHandler(mockReq({
    method: 'POST', headers: AUTH,
    body: { person: 'Jane Doe', reviewDate: '2026-07-01', strengths: 'Great communicator', areasForGrowth: 'Delegation', goals: 'Lead next project', notes: 'On track for promotion' },
  }), res);
  assert(res.statusCode === 201, 'feedback entry created');
  const feedbackEntry = res.body.entry;
  assert(feedbackEntry.person === 'Jane Doe' && feedbackEntry.strengths === 'Great communicator', 'fields round-trip');

  res = mockRes();
  await feedbackHandler(mockReq({ method: 'POST', headers: AUTH, body: { reviewDate: '2026-07-01' } }), res);
  assert(res.statusCode === 400, 'validation rejects missing person');

  res = mockRes();
  await feedbackEntryHandler(mockReq({ method: 'PATCH', headers: AUTH, query: { id: String(feedbackEntry.id) }, body: { goals: 'Lead next TWO projects' } }), res);
  assert(res.statusCode === 200 && res.body.entry.goals === 'Lead next TWO projects', 'feedback entry updated');

  res = mockRes();
  await feedbackEntryHandler(mockReq({ method: 'PATCH', query: { id: String(feedbackEntry.id) }, body: { goals: 'no auth' } }), res);
  assert(res.statusCode === 401, 'unauthenticated feedback update rejected');

  res = mockRes();
  await feedbackEntryHandler(mockReq({ method: 'DELETE', headers: AUTH, query: { id: String(feedbackEntry.id) } }), res);
  assert(res.statusCode === 200, 'feedback entry deleted');
  res = mockRes();
  await feedbackHandler(mockReq({ method: 'GET', headers: AUTH }), res);
  assert(res.body.entries.length === 0, 'feedback empty again after delete');

  console.log('--- Planner: settings GET/PATCH auth-gated (fully editor-only, like feedback) ---');
  res = mockRes();
  await calendarSettingsHandler(mockReq({ method: 'GET' }), res);
  assert(res.statusCode === 401, 'unauthenticated settings read rejected');

  res = mockRes();
  await calendarSettingsHandler(mockReq({ method: 'GET', headers: AUTH }), res);
  assert(res.statusCode === 200, 'settings row exists from migration 0005');
  assert(res.body.settings.icsUrl === '', 'ics url starts empty');
  assert(JSON.stringify(res.body.settings.workDays) === '[1,2,3,4,5]', 'default work days Mon-Fri: ' + JSON.stringify(res.body.settings.workDays));

  console.log('--- Planner: suggestions report needsSetup before an ICS url is configured ---');
  res = mockRes();
  await calendarSuggestionsHandler(mockReq({ method: 'GET', headers: AUTH }), res);
  assert(res.statusCode === 200 && res.body.needsSetup === true, 'reports needsSetup instead of erroring');

  console.log('--- Planner: manual meetings (fallback for anyone who can\'t share a calendar) ---');
  res = mockRes();
  await calendarEventsHandler(mockReq({ method: 'GET' }), res);
  assert(res.statusCode === 401, 'unauthenticated manual-events read rejected');

  res = mockRes();
  await calendarEventsHandler(mockReq({ method: 'GET', headers: AUTH }), res);
  assert(res.statusCode === 200 && res.body.events.length === 0, 'manual events start empty');

  res = mockRes();
  await calendarEventsHandler(mockReq({ method: 'POST', headers: AUTH, body: { start: '2026-01-01T10:00:00Z', end: '2026-01-01T11:00:00Z' } }), res);
  assert(res.statusCode === 400, 'validation rejects a missing title');

  const manualStart = new Date(Date.now() + 3 * 3600 * 1000);
  const manualEnd = new Date(manualStart.getTime() + 30 * 60 * 1000);
  res = mockRes();
  await calendarEventsHandler(mockReq({
    method: 'POST', headers: AUTH,
    body: { title: 'Client call (typed in by hand)', start: manualStart.toISOString(), end: manualEnd.toISOString() },
  }), res);
  assert(res.statusCode === 201, 'manual meeting created');
  const manualEvent = res.body.event;
  assert(manualEvent.title === 'Client call (typed in by hand)', 'title round-trips');

  console.log('--- Planner: manual meetings alone (no ICS link) are enough to skip needsSetup ---');
  res = mockRes();
  await calendarSuggestionsHandler(mockReq({ method: 'GET', headers: AUTH }), res);
  assert(res.statusCode === 200 && !res.body.needsSetup, 'suggestions generated from manual meetings alone, with no ICS url configured');
  const manualOnlyBlocks = res.body.schedule.flatMap((d) => d.blocks);
  assert(manualOnlyBlocks.some((b) => b.type === 'busy' && b.label === 'Client call (typed in by hand)'), 'the manual meeting appears as a busy block');

  console.log('--- Planner: seed an urgent item, then compute suggestions against a mocked ICS feed ---');
  res = mockRes();
  await itemsHandler(mockReq({
    method: 'POST', headers: AUTH,
    body: { description: 'Planner focus candidate', type: 'Ad-hoc', function: 'UK EHS', priority: 'High', status: 'Blocked', dueType: 'date', dueDate: '2020-01-01' },
  }), res);
  assert(res.statusCode === 201, 'seeded a Blocked/overdue item for the algorithm to pick up');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => buildSampleIcs() });
  try {
    res = mockRes();
    await calendarSettingsHandler(mockReq({ method: 'PATCH', headers: AUTH, body: { icsUrl: 'https://example.com/calendar.ics', timezone: 'UTC' } }), res);
    assert(res.statusCode === 200 && res.body.settings.icsUrl === 'https://example.com/calendar.ics', 'ics url saved');

    res = mockRes();
    await calendarSuggestionsHandler(mockReq({ method: 'GET', headers: AUTH }), res);
    assert(res.statusCode === 200 && !res.body.needsSetup, 'suggestions generated once an ICS url is configured: ' + JSON.stringify(res.body).slice(0, 200));
    const blocks = res.body.schedule.flatMap((d) => d.blocks);
    assert(blocks.some((b) => b.type === 'busy'), 'mocked ICS meeting appears as a busy block');
    assert(blocks.some((b) => b.type === 'focus' && b.label.includes('Planner focus candidate')), 'the seeded urgent item produced a focus block');
    assert(blocks.some((b) => b.type === 'busy' && b.label === 'Client call (typed in by hand)'), 'ICS and manual meetings merge together — the earlier manual entry is still there once an ICS url is also configured');
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('--- Planner: delete a manual meeting ---');
  res = mockRes();
  await calendarEventHandler(mockReq({ method: 'DELETE', query: { id: String(manualEvent.id) } }), res);
  assert(res.statusCode === 401, 'unauthenticated delete rejected');
  res = mockRes();
  await calendarEventHandler(mockReq({ method: 'DELETE', headers: AUTH, query: { id: String(manualEvent.id) } }), res);
  assert(res.statusCode === 200, 'manual meeting deleted');
  res = mockRes();
  await calendarEventsHandler(mockReq({ method: 'GET', headers: AUTH }), res);
  assert(res.body.events.length === 0, 'manual events list empty again after delete');

  console.log('--- Planner: a broken ICS link surfaces a clear error instead of crashing ---');
  globalThis.fetch = async () => ({ ok: false, status: 404, text: async () => '' });
  try {
    res = mockRes();
    await calendarSuggestionsHandler(mockReq({ method: 'GET', headers: AUTH }), res);
    assert(res.statusCode === 500 && /HTTP 404/.test(res.body.error), 'broken ICS link reports a clear error: ' + JSON.stringify(res.body));
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('\nALL CRUD/ROLLOVER/AUTH CHECKS PASSED');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFAILED:', err);
  process.exit(1);
});
