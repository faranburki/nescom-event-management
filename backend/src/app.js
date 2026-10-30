import express from 'express';

export function validateRegistration(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const eventId = Number(body?.eventId);
  if (name.length < 2 || name.length > 80) return { error: 'Enter a name between 2 and 80 characters.' };
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.' };
  if (!Number.isSafeInteger(eventId) || eventId < 1) return { error: 'Choose a valid event.' };
  return { name, email, eventId };
}

export function createApp(store) {
  const app = express();
  let requests = 0;
  app.disable('x-powered-by');
  app.use((req, res, next) => { requests++; res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '10kb' }));
  app.get('/healthz', (req, res) => res.json({ status: 'alive' }));
  app.get('/api/health', async (req, res) => {
    try { await store.health(); res.json({ status: 'ready', database: 'connected' }); }
    catch { res.status(503).json({ error: 'Database is unavailable.' }); }
  });
  app.get('/api/events', async (req, res) => res.json(await store.events()));
  app.post('/api/registrations', async (req, res) => {
    const data = validateRegistration(req.body);
    if (data.error) return res.status(400).json(data);
    try { res.status(201).json(await store.register(data)); }
    catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'This email is already registered for that event.' });
      if (error.status) return res.status(error.status).json({ error: error.message });
      throw error;
    }
  });
  app.get('/metrics', (req, res) => {
    res.type('text/plain').send(`# HELP nescom_http_requests_total HTTP requests received.\n# TYPE nescom_http_requests_total counter\nnescom_http_requests_total ${requests}\n# HELP nescom_process_uptime_seconds Process uptime.\n# TYPE nescom_process_uptime_seconds gauge\nnescom_process_uptime_seconds ${process.uptime()}\n`);
  });
  app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));
  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    console.error('Request failed:', error.code || error.name);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return app;
}
