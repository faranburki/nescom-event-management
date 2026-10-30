import pg from 'pg';
import { createApp } from './app.js';
import { initialize, createStore } from './store.js';

const pool = new pg.Pool({
  host: process.env.PGHOST || 'postgres', port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'nescom', user: process.env.PGUSER || 'nescom',
  password: process.env.PGPASSWORD, max: 5, connectionTimeoutMillis: 5000
});
pool.on('error', error => console.error('Idle database connection:', error.code));
let initialized = false;
for (let attempt = 1; attempt <= 30; attempt++) {
  try { await initialize(pool); initialized = true; break; }
  catch (error) { console.error(`Database not ready, attempt ${attempt}: ${error.code || error.name}`); await new Promise(resolve => setTimeout(resolve, 2000)); }
}
if (!initialized) { await pool.end(); process.exit(1); }
const server = createApp(createStore(pool)).listen(3000, '0.0.0.0', () => console.log('NESCOM API listening on port 3000'));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  const timer = setTimeout(() => process.exit(1), 10000); timer.unref();
  server.close(async () => { await pool.end(); process.exit(0); });
});
