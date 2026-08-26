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

// A first-time visitor's browser fires several API calls in parallel on page
// load, all before any of them can come back with a Set-Cookie -- without
// this, each one independently sees "no valid session" and creates its own
// row, leaving a real visitor with several orphaned session rows instead of
// one. Coalesce concurrent creations from the same client (by IP + user
// agent, the only correlator available before a cookie exists) within a
// short window into a single insert, so they all get the same session id.
const pendingSessionCreates = new Map();
const PENDING_CREATE_TTL_MS = 5000;

function creationKeyFor(req) {
  return `${req.ip || req.socket?.remoteAddress || ''}|${req.headers['user-agent'] || ''}`;
}

async function insertSession(req) {
  const { rows } = await pool.query(
    'INSERT INTO sessions (user_agent) VALUES ($1) RETURNING id',
    [req.headers['user-agent'] || null]
  );
  return rows[0].id;
}

function pruneExpiredCreates(now) {
  for (const [key, entry] of pendingSessionCreates) {
    if (entry.expiresAt <= now) pendingSessionCreates.delete(key);
  }
}

async function getOrCreateSession(req) {
  const key = creationKeyFor(req);
  const now = Date.now();
  const pending = pendingSessionCreates.get(key);
  if (pending && pending.expiresAt > now) return pending.promise;

  pruneExpiredCreates(now);
  const promise = insertSession(req);
  // Deliberately kept until it expires rather than cleared once the insert
  // settles: the insert itself finishes in a few ms, but a browser can fire
  // several more uncookied requests over the following hundreds of ms before
  // it's actually received and started using the Set-Cookie from the first
  // one's response -- those later requests still need to land on this same
  // session, not just ones that happen to overlap the insert itself.
  pendingSessionCreates.set(key, { promise, expiresAt: now + PENDING_CREATE_TTL_MS });
  return promise;
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
