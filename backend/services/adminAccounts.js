// Panel accounts, their university access, sessions and the audit log.
import { pool } from '../config/db.js'
import { isUniversity } from '../config/universities.js'
import { hashToken, newToken } from './adminSecurity.js'

export const SESSION_IDLE_MS = 2 * 60 * 60 * 1000 // signed out after 2 h without activity
export const SESSION_MAX_MS = 12 * 60 * 60 * 1000 // and after 12 h no matter what
export const SETUP_LINK_MS = 72 * 60 * 60 * 1000
const LOCK_AFTER_FAILURES = 5
const LOCK_MS = 15 * 60 * 1000
export const ROLES = ['viewer', 'editor']

export const normalizeEmail = value => String(value || '').trim().toLowerCase().slice(0, 254)
export const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

// ─── Users ──────────────────────────────────────────────────────────
const USER_FIELDS = `id, email, display_name, is_superadmin, disabled, totp_secret IS NOT NULL AS totp_enabled,
  password_hash IS NOT NULL AS has_password, setup_expires_at, created_at, last_login_at, locked_until`

async function withAccess(users) {
  if (!users.length) return users
  const { rows } = await pool.query(
    'SELECT user_id, university, role FROM admin_university_access WHERE user_id = ANY($1) ORDER BY university',
    [users.map(user => user.id)]
  )
  return users.map(user => ({
    ...user,
    access: Object.fromEntries(rows.filter(row => row.user_id === user.id).map(row => [row.university, row.role])),
  }))
}

export async function getUser(id) {
  const { rows } = await pool.query(`SELECT ${USER_FIELDS} FROM admin_users WHERE id = $1`, [id])
  return (await withAccess(rows))[0] || null
}

export async function listUsers() {
  const { rows } = await pool.query(`SELECT ${USER_FIELDS} FROM admin_users ORDER BY is_superadmin DESC, email`)
  return withAccess(rows)
}

export async function countUsers() {
  const { rows } = await pool.query('SELECT count(*)::int AS count FROM admin_users')
  return rows[0].count
}

// Includes the secret columns; only the login flow uses this.
export async function findUserForLogin(email) {
  const { rows } = await pool.query('SELECT * FROM admin_users WHERE email = $1', [normalizeEmail(email)])
  return rows[0] || null
}

export async function findUserRow(id) {
  const { rows } = await pool.query('SELECT * FROM admin_users WHERE id = $1', [id])
  return rows[0] || null
}

export async function findUserBySetupToken(token) {
  const { rows } = await pool.query(
    'SELECT * FROM admin_users WHERE setup_token_hash = $1 AND setup_expires_at > now() AND NOT disabled',
    [hashToken(token)]
  )
  return rows[0] || null
}

// A new account has no password: it gets a one-time setup link that the
// superadmin hands over, and the person chooses a password and sets up 2FA.
export async function createUser({ email, displayName = '', isSuperadmin = false, createdBy = null }) {
  const token = newToken()
  const { rows } = await pool.query(
    `INSERT INTO admin_users (email, display_name, is_superadmin, created_by, setup_token_hash, setup_expires_at)
     VALUES ($1, $2, $3, $4, $5, now() + make_interval(secs => $6))
     RETURNING id`,
    [normalizeEmail(email), String(displayName).trim().slice(0, 120), Boolean(isSuperadmin), createdBy, hashToken(token), SETUP_LINK_MS / 1000]
  )
  return { id: rows[0].id, setupToken: token }
}

// Starts over: clears password and 2FA, signs the person out everywhere and
// issues a fresh setup link.
export async function resetUser(id) {
  const token = newToken()
  await pool.query(
    `UPDATE admin_users
        SET password_hash = NULL, totp_secret = NULL, totp_last_counter = NULL,
            setup_token_hash = $2, setup_expires_at = now() + make_interval(secs => $3),
            failed_logins = 0, locked_until = NULL
      WHERE id = $1`,
    [id, hashToken(token), SETUP_LINK_MS / 1000]
  )
  await deleteUserSessions(id)
  return token
}

export async function completeSetup(id, passwordHash) {
  await pool.query(
    `UPDATE admin_users
        SET password_hash = $2, password_changed_at = now(), setup_token_hash = NULL, setup_expires_at = NULL,
            totp_secret = NULL, totp_last_counter = NULL, failed_logins = 0, locked_until = NULL
      WHERE id = $1`,
    [id, passwordHash]
  )
}

export async function setPassword(id, passwordHash) {
  await pool.query('UPDATE admin_users SET password_hash = $2, password_changed_at = now() WHERE id = $1', [id, passwordHash])
}

export async function setTotp(id, sealedSecret, counter) {
  await pool.query('UPDATE admin_users SET totp_secret = $2, totp_last_counter = $3 WHERE id = $1', [id, sealedSecret, counter])
}

export async function setTotpCounter(id, counter) {
  await pool.query('UPDATE admin_users SET totp_last_counter = $2 WHERE id = $1', [id, counter])
}

export async function updateUser(id, { displayName, disabled, isSuperadmin }) {
  await pool.query(
    `UPDATE admin_users
        SET display_name = COALESCE($2, display_name),
            disabled = COALESCE($3, disabled),
            is_superadmin = COALESCE($4, is_superadmin)
      WHERE id = $1`,
    [id, displayName === undefined ? null : String(displayName).trim().slice(0, 120), disabled ?? null, isSuperadmin ?? null]
  )
  if (disabled) await deleteUserSessions(id)
}

export async function deleteUser(id) {
  await pool.query('DELETE FROM admin_users WHERE id = $1', [id])
}

// Replaces the whole access list: { ozyegin: 'editor', bilkent: 'viewer' }.
export async function setAccess(userId, access, grantedBy) {
  const entries = Object.entries(access || {}).filter(([university, role]) => isUniversity(university) && ROLES.includes(role))
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM admin_university_access WHERE user_id = $1', [userId])
    for (const [university, role] of entries) {
      await client.query(
        'INSERT INTO admin_university_access (user_id, university, role, granted_by) VALUES ($1, $2, $3, $4)',
        [userId, university, role, grantedBy]
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

// ─── Failed attempts ────────────────────────────────────────────────
export const isLocked = user => Boolean(user?.locked_until && new Date(user.locked_until) > new Date())

export async function recordFailure(id) {
  await pool.query(
    `UPDATE admin_users
        SET failed_logins = failed_logins + 1,
            locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + make_interval(secs => $3) ELSE locked_until END
      WHERE id = $1`,
    [id, LOCK_AFTER_FAILURES, LOCK_MS / 1000]
  )
}

export async function recordLogin(id) {
  await pool.query('UPDATE admin_users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [id])
}

// ─── Sessions ───────────────────────────────────────────────────────
export async function createSession(userId, { userAgent }) {
  const token = newToken()
  await pool.query(
    `INSERT INTO admin_sessions (token_hash, user_id, expires_at, user_agent)
     VALUES ($1, $2, now() + make_interval(secs => $3), $4)`,
    [hashToken(token), userId, SESSION_MAX_MS / 1000, String(userAgent || '').slice(0, 300)]
  )
  return token
}

// Returns the signed-in user for a session token, or null. Touches the session
// so it stays alive while used.
export async function sessionUser(token) {
  if (!token) return null
  const { rows } = await pool.query(
    `UPDATE admin_sessions s
        SET last_seen_at = now()
       FROM admin_users u
      WHERE s.token_hash = $1
        AND s.user_id = u.id
        AND s.expires_at > now()
        AND s.last_seen_at > now() - make_interval(secs => $2)
        AND NOT u.disabled
        AND u.password_hash IS NOT NULL
        AND u.totp_secret IS NOT NULL
      RETURNING u.id`,
    [hashToken(token), SESSION_IDLE_MS / 1000]
  )
  return rows[0] ? getUser(rows[0].id) : null
}

export async function deleteSession(token) {
  await pool.query('DELETE FROM admin_sessions WHERE token_hash = $1', [hashToken(token)])
}

export async function deleteUserSessions(userId, exceptToken = null) {
  await pool.query(
    'DELETE FROM admin_sessions WHERE user_id = $1 AND ($2::text IS NULL OR token_hash <> $2)',
    [userId, exceptToken ? hashToken(exceptToken) : null]
  )
}

export async function pruneSessions() {
  await pool.query(
    `DELETE FROM admin_sessions WHERE expires_at <= now() OR last_seen_at <= now() - make_interval(secs => $1)`,
    [SESSION_IDLE_MS / 1000]
  )
}

// ─── Audit log ──────────────────────────────────────────────────────
export async function audit(req, action, { university = null, details = null, user = req.adminUser } = {}) {
  try {
    await pool.query(
      `INSERT INTO admin_audit_log (user_id, email, action, university, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [user?.id || null, user?.email || null, action, university, details ? JSON.stringify(details) : null]
    )
  } catch (error) {
    console.error('admin audit log write failed:', error.message)
  }
}

export async function listAudit({ university = null, limit = 200 } = {}) {
  const { rows } = await pool.query(
    `SELECT id, created_at, user_id, email, action, university, details
       FROM admin_audit_log
      WHERE ($1::text IS NULL OR university = $1)
      ORDER BY created_at DESC
      LIMIT $2`,
    [university, Math.min(Math.max(Number(limit) || 200, 1), 1000)]
  )
  return rows
}
