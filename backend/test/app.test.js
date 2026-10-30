import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, validateRegistration } from '../src/app.js';
import { createStore } from '../src/store.js';

test('normalizes names and emails', () => {
  assert.deepEqual(validateRegistration({ name: ' Faran Burki ', email: ' FARAN@EXAMPLE.COM ', eventId: '2' }),
    { name: 'Faran Burki', email: 'faran@example.com', eventId: 2 });
});
test('rejects malformed registrations', () => {
  for (const data of [null, {}, { name: 'A', email: 'a@b.com', eventId: 1 },
    { name: 'Faran', email: 'invalid', eventId: 1 }, { name: 'Faran', email: 'a@b.com', eventId: 0 },
    { name: 'Faran', email: 'a@b.com', eventId: 1.5 }]) assert.ok(validateRegistration(data).error);
});

async function withApi(t, overrides = {}) {
  const app = createApp({ health: async () => {}, events: async () => [{ id: 1, title: 'Summit' }],
    register: async data => ({ id: 12, name: data.name, event: 'Summit' }), ...overrides });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
test('API serves events and database health', async t => {
  const url = await withApi(t);
  assert.equal((await fetch(url + '/api/health')).status, 200);
  assert.equal((await (await fetch(url + '/api/events')).json())[0].id, 1);
});
test('database failure marks API unready', async t => {
  const url = await withApi(t, { health: async () => { throw Error('offline'); } });
  assert.equal((await fetch(url + '/api/health')).status, 503);
  assert.equal((await fetch(url + '/healthz')).status, 200);
});
test('registration validates input and creates a confirmation', async t => {
  const url = await withApi(t);
  const send = body => fetch(url + '/api/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await send({})).status, 400);
  const result = await send({ name: 'Faran', email: 'faran@example.com', eventId: 1 });
  assert.equal(result.status, 201);
  assert.equal((await result.json()).id, 12);
});
test('duplicate registration returns conflict', async t => {
  const url = await withApi(t, { register: async () => { throw Object.assign(Error('duplicate'), { code: '23505' }); } });
  const response = await fetch(url + '/api/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Faran', email: 'faran@example.com', eventId: 1 }) });
  assert.equal(response.status, 409);
});
test('invalid JSON is rejected and metrics are exposed', async t => {
  const url = await withApi(t);
  assert.equal((await fetch(url + '/api/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  assert.match(await (await fetch(url + '/metrics')).text(), /nescom_http_requests_total/);
});

function fakePool({ capacity = 1, total = 0, duplicate = false, missing = false } = {}) {
  const calls = [];
  let released = false;
  const client = { release() { released = true; }, async query(sql, args) {
    calls.push({ sql, args });
    if (sql.includes('FOR UPDATE')) return { rows: missing ? [] : [{ capacity, title: 'Summit' }] };
    if (sql.startsWith('SELECT id')) return { rowCount: duplicate ? 1 : 0 };
    if (sql.includes('COUNT(*)')) return { rows: [{ total }] };
    if (sql.startsWith('INSERT')) return { rows: [{ id: 42 }] };
    return { rows: [] };
  } };
  return { connect: async () => client, calls, isReleased: () => released };
}
test('registration locks capacity and commits using one client', async () => {
  const pool = fakePool();
  const result = await createStore(pool).register({ eventId: 1, name: "O'Brien", email: 'a@b.com' });
  assert.equal(result.id, 42);
  assert.ok(pool.calls.some(c => c.sql.includes('FOR UPDATE')));
  assert.deepEqual(pool.calls.find(c => c.sql.startsWith('INSERT')).args, [1, "O'Brien", 'a@b.com']);
  assert.equal(pool.calls.at(-1).sql, 'COMMIT');
  assert.ok(pool.isReleased());
});
for (const [name, options, status] of [['full event', { total: 1 }, 409], ['duplicate', { duplicate: true }, 409], ['missing event', { missing: true }, 404]]) {
  test(`${name} rolls back and releases client`, async () => {
    const pool = fakePool(options);
    await assert.rejects(createStore(pool).register({ eventId: 1, name: 'Faran', email: 'a@b.com' }), error => error.status === status);
    assert.equal(pool.calls.at(-1).sql, 'ROLLBACK');
    assert.ok(pool.isReleased());
  });
}
