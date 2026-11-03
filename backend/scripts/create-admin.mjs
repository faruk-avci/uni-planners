// Creates a panel superadmin, or issues a fresh setup link for an existing
// account (recovery when someone is locked out or lost their authenticator).
//
//   node scripts/create-admin.mjs you@example.com [--name "Ad Soyad"] [--reset]
//        [--panel-url https://panel.uniplanners.org]
//
// Prints a one-time setup link (valid 72 h). Opening it lets the person choose
// a password and set up two-factor sign-in. Share it only with that person.
import { existsSync } from 'fs'

// On the server the API reads its settings from this file via systemd.
if (!process.env.DB_HOST && existsSync('/etc/uniplanner/backend.env')) process.loadEnvFile('/etc/uniplanner/backend.env')

const { ensureSchema, pool } = await import('../config/db.js')
const { createUser, findUserForLogin, normalizeEmail, resetUser, validEmail } = await import('../services/adminAccounts.js')

const args = process.argv.slice(2)
const option = name => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const VALUE_OPTIONS = new Set(['--name', '--panel-url'])
const email = normalizeEmail(args.find((arg, index) => !arg.startsWith('--') && !VALUE_OPTIONS.has(args[index - 1])))
const panelUrl = (option('--panel-url') || process.env.PANEL_URL || 'https://panel.uniplanners.org').replace(/\/$/, '')

if (!validEmail(email)) {
  console.error('Usage: node scripts/create-admin.mjs you@example.com [--name "Ad Soyad"] [--reset]')
  process.exit(1)
}

try {
  await ensureSchema()
  const existing = await findUserForLogin(email)
  let token
  if (existing) {
    if (!args.includes('--reset')) {
      console.error(`${email} already has an account. Add --reset to issue a new setup link (clears its password and 2FA).`)
      process.exit(1)
    }
    token = await resetUser(existing.id)
    await pool.query('UPDATE admin_users SET is_superadmin = true, disabled = false WHERE id = $1', [existing.id])
    await pool.query(`INSERT INTO admin_audit_log (user_id, email, action, details) VALUES ($1, $2, 'user_reset_cli', NULL)`, [existing.id, email])
    console.log(`Reset ${email} (superadmin).`)
  } else {
    const created = await createUser({ email, displayName: option('--name') || '', isSuperadmin: true })
    token = created.setupToken
    await pool.query(`INSERT INTO admin_audit_log (user_id, email, action, details) VALUES ($1, $2, 'user_created_cli', '{"isSuperadmin":true}')`, [created.id, email])
    console.log(`Created superadmin ${email}.`)
  }
  console.log(`\nOne-time setup link (valid 72 hours):\n${panelUrl}/#/setup/${token}\n`)
} finally {
  await pool.end()
}
