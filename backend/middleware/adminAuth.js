import { randomBytes, timingSafeEqual } from 'crypto'

const COOKIE_NAME = 'uniplanner_admin'
const MAX_AGE_MS = 8 * 60 * 60 * 1000
const sessions = new Map()
const failures = new Map()

const cookies = header => Object.fromEntries(String(header || '').split(';').map(part => {
  const index = part.indexOf('=')
  return index < 0 ? ['', ''] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]
}).filter(([key]) => key))

function sameSecret(left, right) {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b)
}

function prune() {
  const now = Date.now()
  for (const [token, expiresAt] of sessions) if (expiresAt <= now) sessions.delete(token)
  for (const [ip, entry] of failures) if (entry.resetAt <= now) failures.delete(ip)
}

export function adminLogin(req, res) {
  prune()
  const configured = process.env.ADMIN_SECRET
  if (!configured) return res.status(503).json({ error: 'Admin access is not configured' })
  const ip = req.ip || 'unknown'
  const attempt = failures.get(ip)
  if (attempt && attempt.count >= 5 && attempt.resetAt > Date.now()) {
    return res.status(429).json({ error: 'Too many attempts. Try again later.' })
  }
  if (!sameSecret(req.body?.secret, configured)) {
    failures.set(ip, { count: (attempt?.count || 0) + 1, resetAt: Date.now() + 15 * 60 * 1000 })
    return res.status(401).json({ error: 'Invalid access key' })
  }
  failures.delete(ip)
  const token = randomBytes(32).toString('base64url')
  sessions.set(token, Date.now() + MAX_AGE_MS)
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === '1',
    sameSite: 'strict',
    maxAge: MAX_AGE_MS,
    path: '/api/admin',
  })
  res.locals.activity = { ...res.locals.activity, adminAuthenticated: true }
  return res.json({ authenticated: true })
}

export function requireAdmin(req, res, next) {
  prune()
  const token = cookies(req.headers.cookie)[COOKIE_NAME]
  const expiresAt = token ? sessions.get(token) : null
  if (!expiresAt || expiresAt <= Date.now()) return res.status(401).json({ error: 'Admin authentication required' })
  sessions.set(token, Date.now() + MAX_AGE_MS)
  req.adminToken = token
  next()
}

export function adminLogout(req, res) {
  if (req.adminToken) sessions.delete(req.adminToken)
  res.clearCookie(COOKIE_NAME, { path: '/api/admin' })
  res.json({ authenticated: false })
}
