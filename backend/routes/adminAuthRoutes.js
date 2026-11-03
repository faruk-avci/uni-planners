// Panel sign-in: e-mail + password, then a TOTP code from an authenticator
// app. Two-factor is mandatory: an account without it is walked through
// enrolment before it gets a session.
//
// New accounts and resets use a one-time setup link instead of a password
// chosen by someone else.
import express from 'express'
import { randomBytes } from 'crypto'
import { UNIVERSITIES } from '../config/universities.js'
import {
  audit, completeSetup, countUsers, createSession, deleteSession, deleteUserSessions, findUserBySetupToken,
  findUserForLogin, findUserRow, getUser, isLocked, recordFailure, recordLogin, setPassword, setTotp, setTotpCounter,
} from '../services/adminAccounts.js'
import {
  encryptionConfigured, hashPassword, newTotpSecret, openSecret, otpauthUrl, passwordProblem, sealSecret,
  verifyPassword, verifyTotp,
} from '../services/adminSecurity.js'
import { clearSessionCookie, readCookie, requireAdmin, setSessionCookie } from '../middleware/adminAuth.js'

// Guessing is stopped per account (locked for 15 minutes after 5 wrong
// passwords or codes) and per sign-in attempt (5 codes per ticket), plus the
// mandatory second factor. Nothing here looks at IP addresses.
const router = express.Router()
const GENERIC_LOGIN_ERROR = 'E-posta veya parola hatalı.'

// Between the password step and the code step. In memory on purpose: a
// restart just means signing in again.
const TICKET_MS = 5 * 60 * 1000
const tickets = new Map()
function issueTicket(userId, stage, secret = null) {
  const now = Date.now()
  for (const [key, value] of tickets) if (value.expiresAt <= now) tickets.delete(key)
  const ticket = randomBytes(24).toString('base64url')
  tickets.set(ticket, { userId, stage, secret, attempts: 0, expiresAt: now + TICKET_MS })
  return ticket
}
function takeTicket(ticket, stage) {
  const entry = tickets.get(String(ticket || ''))
  if (!entry || entry.stage !== stage || entry.expiresAt <= Date.now()) return null
  return entry
}

export const publicUser = user => ({
  id: user.id,
  email: user.email,
  displayName: user.display_name,
  isSuperadmin: user.is_superadmin,
  access: user.access || {},
  lastLoginAt: user.last_login_at,
})

async function startSession(req, res, userId) {
  await recordLogin(userId)
  const token = await createSession(userId, { userAgent: req.get('user-agent') })
  setSessionCookie(res, token)
  const user = await getUser(userId)
  await audit(req, 'login', { user })
  return res.json({ user: publicUser(user), universities: UNIVERSITIES })
}

function enrolment(user) {
  const secret = newTotpSecret()
  return { next: 'enroll', ticket: issueTicket(user.id, 'enroll', secret), secret, otpauthUrl: otpauthUrl(user.email, secret) }
}

router.get('/auth/status', async (_req, res, next) => {
  try {
    res.json({ hasUsers: (await countUsers()) > 0, ready: encryptionConfigured() })
  } catch (error) { next(error) }
})

router.post('/login', async (req, res, next) => {
  try {
    if (!encryptionConfigured()) return res.status(503).json({ error: 'Panel sunucuda yapılandırılmamış (ADMIN_SECRET).' })
    const user = await findUserForLogin(req.body?.email)
    const passwordOk = await verifyPassword(req.body?.password, user?.password_hash)
    if (!user || user.disabled || !user.password_hash) return res.status(401).json({ error: GENERIC_LOGIN_ERROR })
    if (isLocked(user)) return res.status(429).json({ error: 'Çok fazla hatalı deneme. Hesap 15 dakika kilitlendi.' })
    if (!passwordOk) {
      await recordFailure(user.id)
      await audit(req, 'login_failed', { user, details: { step: 'password' } })
      return res.status(401).json({ error: GENERIC_LOGIN_ERROR })
    }
    if (!user.totp_secret) return res.json(enrolment(user))
    return res.json({ next: 'totp', ticket: issueTicket(user.id, 'totp') })
  } catch (error) { next(error) }
})

router.post('/login/totp', async (req, res, next) => {
  try {
    const entry = takeTicket(req.body?.ticket, 'totp')
    if (!entry) return res.status(401).json({ error: 'Giriş adımının süresi doldu. Baştan deneyin.', restart: true })
    const user = await findUserRow(entry.userId)
    if (!user || user.disabled || isLocked(user)) {
      tickets.delete(req.body.ticket)
      return res.status(401).json({ error: 'Giriş yapılamadı.', restart: true })
    }
    const secret = openSecret(user.totp_secret)
    const counter = secret ? verifyTotp(secret, req.body?.code, user.totp_last_counter) : null
    if (counter === null) {
      await recordFailure(user.id)
      await audit(req, 'login_failed', { user, details: { step: 'totp' } })
      if (++entry.attempts >= 5) tickets.delete(req.body.ticket)
      return res.status(401).json({ error: 'Doğrulama kodu hatalı.', restart: entry.attempts >= 5 })
    }
    tickets.delete(req.body.ticket)
    await setTotpCounter(user.id, counter)
    return startSession(req, res, user.id)
  } catch (error) { next(error) }
})

router.post('/login/enroll', async (req, res, next) => {
  try {
    const entry = takeTicket(req.body?.ticket, 'enroll')
    if (!entry) return res.status(401).json({ error: 'Kurulum adımının süresi doldu. Baştan deneyin.', restart: true })
    const counter = verifyTotp(entry.secret, req.body?.code)
    if (counter === null) {
      if (++entry.attempts >= 5) tickets.delete(req.body.ticket)
      return res.status(401).json({ error: 'Kod doğrulanamadı. Uygulamadaki güncel kodu girin.', restart: entry.attempts >= 5 })
    }
    tickets.delete(req.body.ticket)
    await setTotp(entry.userId, sealSecret(entry.secret), counter)
    await audit(req, 'totp_enrolled', { user: await getUser(entry.userId) })
    return startSession(req, res, entry.userId)
  } catch (error) { next(error) }
})

// The token travels in the body, never the URL, so it stays out of access
// and request logs.
router.post('/setup/info', async (req, res, next) => {
  try {
    const user = await findUserBySetupToken(req.body?.token)
    if (!user) return res.status(404).json({ error: 'Kurulum bağlantısı geçersiz veya süresi dolmuş.' })
    return res.json({ email: user.email, displayName: user.display_name })
  } catch (error) { next(error) }
})

router.post('/setup', async (req, res, next) => {
  try {
    if (!encryptionConfigured()) return res.status(503).json({ error: 'Panel sunucuda yapılandırılmamış (ADMIN_SECRET).' })
    const user = await findUserBySetupToken(req.body?.token)
    if (!user) return res.status(404).json({ error: 'Kurulum bağlantısı geçersiz veya süresi dolmuş.' })
    const problem = passwordProblem(req.body?.password, user.email)
    if (problem) return res.status(400).json({ error: problem })
    await completeSetup(user.id, await hashPassword(req.body.password))
    await audit(req, 'account_setup', { user })
    return res.json(enrolment(user))
  } catch (error) { next(error) }
})

router.post('/logout', async (req, res, next) => {
  try {
    const token = readCookie(req)
    if (token) await deleteSession(token)
    clearSessionCookie(res)
    res.json({ ok: true })
  } catch (error) { next(error) }
})

router.get('/me', requireAdmin, (req, res) => res.json({ user: publicUser(req.adminUser), universities: UNIVERSITIES }))

// Changing the password needs the current one and a fresh code, and signs out
// every other session.
router.post('/me/password', requireAdmin, async (req, res, next) => {
  try {
    const user = await findUserRow(req.adminUser.id)
    if (!(await verifyPassword(req.body?.currentPassword, user.password_hash))) {
      await recordFailure(user.id)
      return res.status(400).json({ error: 'Mevcut parola hatalı.' })
    }
    const counter = verifyTotp(openSecret(user.totp_secret) || '', req.body?.code, user.totp_last_counter)
    if (counter === null) return res.status(400).json({ error: 'Doğrulama kodu hatalı.' })
    const problem = passwordProblem(req.body?.password, user.email)
    if (problem) return res.status(400).json({ error: problem })
    await setTotpCounter(user.id, counter)
    await setPassword(user.id, await hashPassword(req.body.password))
    await deleteUserSessions(user.id, req.adminToken)
    await audit(req, 'password_changed')
    return res.json({ ok: true })
  } catch (error) { next(error) }
})

router.post('/me/sessions/revoke-others', requireAdmin, async (req, res, next) => {
  try {
    await deleteUserSessions(req.adminUser.id, req.adminToken)
    await audit(req, 'sessions_revoked')
    res.json({ ok: true })
  } catch (error) { next(error) }
})

export default router
