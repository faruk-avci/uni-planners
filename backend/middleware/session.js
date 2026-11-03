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

// A first-time visitor's parallel page-load requests may each create a
// session row before the first Set-Cookie arrives; the browser keeps the last
// one and the others stay empty. They used to be merged by IP + user agent,
// but IPs are not used at all, and user agent alone would merge strangers on
// the same phone model, so a few empty rows are the price.
async function insertSession(req) {
  const { rows } = await pool.query(
    'INSERT INTO sessions (user_agent) VALUES ($1) RETURNING id',
    [req.headers['user-agent'] || null]
  );
  return rows[0].id;
}

async function getOrCreateSession(req) {
  return insertSession(req);
}

// last_seen only feeds one coarse admin metric ("active in the last 24h"),
// so it doesn't need per-request precision. Writing it on every single API
// call added a write query (with real WAL/MVCC cost, not just a read) to
// every search, generate, export, etc., for every user. Throttle to at most
// once per window per session -- a cache hit skips the DB round trip
// entirely, at the cost of a brief window where a session deleted directly
// in the DB would still be treated as valid until the entry expires.
const lastSeenCache = new Map();
const LAST_SEEN_MIN_INTERVAL_MS = 5 * 60 * 1000;

function pruneStaleLastSeen(now) {
  for (const [id, writtenAt] of lastSeenCache) {
    if (now - writtenAt > LAST_SEEN_MIN_INTERVAL_MS) lastSeenCache.delete(id);
  }
}

async function touchSession(sid) {
  const now = Date.now();
  const writtenAt = lastSeenCache.get(sid);
  if (writtenAt && now - writtenAt < LAST_SEEN_MIN_INTERVAL_MS) return true;

  const { rowCount } = await pool.query('UPDATE sessions SET last_seen = now() WHERE id = $1', [sid]);
  if (rowCount > 0) {
    if (lastSeenCache.size > 200) pruneStaleLastSeen(now);
    lastSeenCache.set(sid, now);
    return true;
  }
  lastSeenCache.delete(sid);
  return false;
}

export async function sessionMiddleware(req, res, next) {
  try {
    let sid = parseCookies(req.headers.cookie)[COOKIE_NAME];
    let valid = false;
    let created = false;
    if (sid && UUID_RE.test(sid)) {
      valid = await touchSession(sid);
    }
    if (!valid) {
      sid = await getOrCreateSession(req);
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
