import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { initialize, createStore } from '../src/store.js';
import { createApp } from '../src/app.js';

test('real PostgreSQL: persistence, duplicates, and concurrent last-seat booking', { skip: !process.env.RUN_DB_TESTS }, async t => {
  const pool = new pg.Pool({ max: 5 });
  await initialize(pool);
  const server = createApp(createStore(pool)).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await pool.end(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const register = (email, eventId = 1) => fetch(base + '/api/registrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Test Attendee', email, eventId }) });
  assert.equal((await (await fetch(base + '/api/events')).json()).length, 4);
  assert.equal((await register('first@example.com')).status, 201);
  assert.equal((await register('FIRST@example.com')).status, 409);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM registrations')).rows[0].n, 1);
  await pool.query('UPDATE events SET capacity=1 WHERE id=2');
  const results = await Promise.all([register('a@example.com', 2), register('b@example.com', 2)]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  const events = await (await fetch(base + '/api/events')).json();
  assert.equal(events.find(e => e.id === 2).remaining, 0);
});
