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

  console.log('--- DELETE /api/items?sample=true (clear sample data) ---');
  res = mockRes();
  await itemsHandler(mockReq({ method: 'DELETE', headers: AUTH, query: { sample: 'true' } }), res);
  assert(res.statusCode === 200, 'sample data cleared');
  res = mockRes();
  await itemsHandler(mockReq({ method: 'GET' }), res);
  assert(res.body.items.every((i) => !i.isSample), 'no sample items remain: ' + res.body.items.length + ' left');

  console.log('\nALL CRUD/ROLLOVER/AUTH CHECKS PASSED');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFAILED:', err);
  process.exit(1);
});
