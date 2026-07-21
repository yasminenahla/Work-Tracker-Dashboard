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
    body: { description: 'CRUD smoke test item', type: 'Ad-hoc', function: 'UK QFS', owner: 'Tester', priority: 'High', status: 'Not Started', dueType: 'date', dueDate: null },
  }), res);
  assert(res.statusCode === 201, 'created');
  const created = res.body.item;
  assert(created.description === 'CRUD smoke test item', 'description round-trips');
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
  await itemHandler(mockReq({ method: 'PATCH', headers: AUTH, query: { id: String(recurringSeed.id) }, body: { status: 'Completed' } }), res);
  const rolled = res.body.item;
  assert(rolled.status === 'Not Started', 'rolled back to Not Started, not left Completed: got ' + rolled.status);
  assert(rolled.percentComplete === 0, '% reset to 0');
  assert(rolled.dueDate !== beforeDue, 'due date advanced (' + beforeDue + ' -> ' + rolled.dueDate + ')');
  assert(/Completed this occurrence/.test(rolled.history[0].change), 'rollover history entry present: ' + rolled.history[0].change);

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

  console.log('--- Owners roster: add + rename with cascade ---');
  res = mockRes();
  await configHandler(mockReq({ method: 'GET' }), res);
  const preOwnersConfig = res.body.config;
  assert(Array.isArray(preOwnersConfig.lists.owners), 'owners key exists on lists (migration 0002 applied)');

  res = mockRes();
  await configHandler(mockReq({
    method: 'PATCH', headers: AUTH,
    body: { lists: { ...preOwnersConfig.lists, owners: [...preOwnersConfig.lists.owners, 'R. Match'] } },
  }), res);
  assert(res.body.config.lists.owners.includes('R. Match'), 'owner added to roster');

  res = mockRes();
  await configHandler(mockReq({
    method: 'PATCH', headers: AUTH,
    body: {
      lists: { ...preOwnersConfig.lists, owners: preOwnersConfig.lists.owners.filter((o) => o !== 'R. Match').concat('Rebecca Match') },
      cascadeRename: { field: 'owner', oldValue: 'R. Match', newValue: 'Rebecca Match' },
    },
  }), res);
  assert(res.body.config.lists.owners.includes('Rebecca Match') && !res.body.config.lists.owners.includes('R. Match'), 'owner renamed in roster');

  res = mockRes();
  await itemsHandler(mockReq({ method: 'GET' }), res);
  const stillOldOwner = res.body.items.filter((i) => i.owner === 'R. Match');
  const nowNewOwner = res.body.items.filter((i) => i.owner === 'Rebecca Match');
  assert(stillOldOwner.length === 0, 'no items left referencing old owner name "R. Match"');
  assert(nowNewOwner.length > 0, 'cascaded items now say "Rebecca Match": count=' + nowNewOwner.length);

  console.log('--- DELETE /api/items?sample=true (clear sample data) ---');
  res = mockRes();
  await itemsHandler(mockReq({ method: 'DELETE', headers: AUTH, query: { sample: 'true' } }), res);
  assert(res.statusCode === 200, 'sample data cleared');
  res = mockRes();
  await itemsHandler(mockReq({ method: 'GET' }), res);
  assert(res.body.items.every((i) => !i.isSample), 'no sample items remain: ' + res.body.items.length + ' left');

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

  console.log('\nALL CRUD/ROLLOVER/AUTH CHECKS PASSED');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFAILED:', err);
  process.exit(1);
});
