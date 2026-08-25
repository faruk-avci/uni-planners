import { pool } from '../config/db.js';

// ─── Anonymous sessions ────────────────────────────────────────────
// Every visitor gets a session id in an HttpOnly cookie. The basket is stored
// server-side keyed by it, so it survives refresh and gives us per-user
// tracking without requiring login. Later, login can attach sessions.ozu_id.
const COOKIE_NAME = 'sid';
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';
const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

export async function sessionMiddleware(req, res, next) {
  try {
    let sid = parseCookies(req.headers.cookie)[COOKIE_NAME];
    let valid = false;
    let created = false;
    if (sid && UUID_RE.test(sid)) {
      const { rowCount } = await pool.query('UPDATE sessions SET last_seen = now() WHERE id = $1', [sid]);
      valid = rowCount > 0;
    }
    if (!valid) {
      const { rows } = await pool.query(
        'INSERT INTO sessions (user_agent) VALUES ($1) RETURNING id',
        [req.headers['user-agent'] || null]
      );
      sid = rows[0].id;
      created = true;
      res.cookie(COOKIE_NAME, sid, {
        httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE, maxAge: ONE_YEAR_MS, path: '/',
      });
    }
    req.sessionId = sid;
    req.sessionCreated = created;
  } catch (err) {
    // Never block the app on session bookkeeping; basket routes will 500 if truly broken.
    console.error('sessionMiddleware error:', err.message);
  }
  next();
}

export { UUID_RE };
