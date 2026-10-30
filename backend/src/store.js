export const seedEvents = [
  [1, 'Innovation Summit', 'Talks', '2026-12-12', '09:00', 'Main Auditorium', 150, 'Ideas that shape tomorrow. Meet researchers and explore emerging technology.'],
  [2, 'Code Sprint', 'Competition', '2026-12-12', '11:00', 'Computing Lab', 60, 'Bring your team, solve practical challenges, and put your coding skills to work.'],
  [3, 'AI Workshop', 'Workshop', '2026-12-13', '10:00', 'Seminar Hall', 80, 'A practical introduction to building useful applications with machine learning.'],
  [4, 'Cybersecurity Challenge', 'Competition', '2026-12-13', '14:00', 'Computing Lab', 50, 'Investigate clues and solve security puzzles in a friendly learning environment.']
];

export async function initialize(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
    event_date TEXT NOT NULL, start_time TEXT NOT NULL, venue TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0), description TEXT NOT NULL
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id),
    name VARCHAR(80) NOT NULL, email VARCHAR(254) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(event_id, email)
  )`);
  for (const event of seedEvents) await pool.query(
    'INSERT INTO events VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING', event);
}

export function createStore(pool) {
  return {
    health: () => pool.query('SELECT 1'),
    events: async () => (await pool.query(`SELECT e.*, (e.capacity - COUNT(r.id))::int AS remaining
      FROM events e LEFT JOIN registrations r ON e.id = r.event_id
      GROUP BY e.id ORDER BY e.event_date, e.start_time`)).rows,
    register: async ({ eventId, name, email }) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query('SELECT * FROM events WHERE id=$1 FOR UPDATE', [eventId]);
        if (!rows.length) throw Object.assign(new Error('Event not found.'), { status: 404 });
        const duplicate = await client.query('SELECT id FROM registrations WHERE event_id=$1 AND email=$2', [eventId, email]);
        if (duplicate.rowCount) throw Object.assign(new Error('This email is already registered for that event.'), { status: 409 });
        const count = await client.query('SELECT COUNT(*)::int AS total FROM registrations WHERE event_id=$1', [eventId]);
        if (count.rows[0].total >= rows[0].capacity) throw Object.assign(new Error('This event is fully booked.'), { status: 409 });
        const result = await client.query('INSERT INTO registrations(event_id,name,email) VALUES ($1,$2,$3) RETURNING id', [eventId, name, email]);
        await client.query('COMMIT');
        return { id: result.rows[0].id, name, event: rows[0].title, message: 'Registration confirmed.' };
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
  };
}
