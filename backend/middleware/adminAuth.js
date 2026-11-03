// Panel authentication and authorization.
//
// - Sessions: opaque random token in an HttpOnly, SameSite=Strict cookie
//   scoped to /api/admin; only its hash is stored (admin_sessions).
// - CSRF: state-changing requests must carry the X-Panel-Request header (a
//   cross-site form cannot set it) and, when the browser sends an Origin, it
//   must be the panel's own host.
// - Authorization: requireSuperadmin, or requireUniversity(role) for routes
//   under /u/:university.
import { isUniversity } from '../config/universities.js'
import { sessionUser, SESSION_MAX_MS } from '../services/adminAccounts.js'

export const COOKIE_NAME = 'uniplanner_admin'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export const readCookie = (req, name = COOKIE_NAME) => {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=')
    if (index > 0 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim())
  }
  return ''
}

export function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === '1',
    sameSite: 'strict',
    maxAge: SESSION_MAX_MS,
    path: '/api/admin',
  })
}

export const clearSessionCookie = res => res.clearCookie(COOKIE_NAME, { path: '/api/admin' })

export function csrfGuard(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next()
  if (req.get('x-panel-request') !== '1') return res.status(403).json({ error: 'Missing panel request header' })
  const origin = req.get('origin')
  if (origin) {
    let host = ''
    try { host = new URL(origin).host } catch { /* invalid origin */ }
    // X-Forwarded-Host covers the panel's dev proxy; a browser cannot set it
    // (or X-Panel-Request) on a cross-site request.
    if (!host || (host !== req.get('host') && host !== req.get('x-forwarded-host'))) {
      return res.status(403).json({ error: 'Cross-origin request refused' })
    }
  }
  return next()
}

export async function requireAdmin(req, res, next) {
  try {
    const token = readCookie(req)
    const user = await sessionUser(token)
    if (!user) {
      if (token) clearSessionCookie(res)
      return res.status(401).json({ error: 'Oturum açmanız gerekiyor' })
    }
    req.adminUser = user
    req.adminToken = token
    res.locals.activity = { ...res.locals.activity, adminUserId: user.id }
    return next()
  } catch (error) {
    return next(error)
  }
}

export function requireSuperadmin(req, res, next) {
  if (!req.adminUser?.is_superadmin) return res.status(403).json({ error: 'Bu işlem için süper yönetici yetkisi gerekir' })
  return next()
}

export const roleFor = (user, university) => (user?.is_superadmin ? 'editor' : user?.access?.[university] || null)

// `editor` may change things; `viewer` may only read.
export function requireUniversity(minimum = 'viewer') {
  return (req, res, next) => {
    const { university } = req.params
    if (!isUniversity(university)) return res.status(404).json({ error: 'Unknown university' })
    const role = roleFor(req.adminUser, university)
    if (!role || (minimum === 'editor' && role !== 'editor')) {
      return res.status(403).json({ error: 'Bu üniversite için yetkiniz yok' })
    }
    req.university = university
    req.universityRole = role
    return next()
  }
}

// Read for viewers, write for editors, decided per request method.
export const requireUniversityForMethod = () => (req, res, next) =>
  requireUniversity(SAFE_METHODS.has(req.method) ? 'viewer' : 'editor')(req, res, next)
