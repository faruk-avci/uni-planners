// Crypto building blocks for panel accounts: password hashing, TOTP two-factor
// codes, encryption of TOTP secrets at rest and opaque session tokens.
// Node's crypto module only; no third-party code handles secrets.
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, scrypt, timingSafeEqual } from 'crypto'

// ─── Passwords (scrypt) ────────────────────────────────────────────
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64 }
export const PASSWORD_MIN_LENGTH = 12

const scryptAsync = (password, salt, { N, r, p, keylen }) => new Promise((resolve, reject) => {
  scrypt(password, salt, keylen, { N, r, p, maxmem: 128 * N * r * 2 }, (error, key) => (error ? reject(error) : resolve(key)))
})

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const key = await scryptAsync(String(password), salt, SCRYPT)
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$')
}

// Used when the e-mail is unknown, so a login takes as long either way and
// the response time does not reveal which addresses have accounts.
const DUMMY_HASH = `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${randomBytes(16).toString('base64')}$${randomBytes(64).toString('base64')}`

export async function verifyPassword(password, stored) {
  const [scheme, N, r, p, salt, hash] = String(stored || DUMMY_HASH).split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const key = await scryptAsync(String(password), Buffer.from(salt, 'base64'), { N: Number(N), r: Number(r), p: Number(p), keylen: expected.length })
  return Boolean(stored) && timingSafeEqual(key, expected)
}

export function passwordProblem(password, email = '') {
  const value = String(password || '')
  if (value.length < PASSWORD_MIN_LENGTH) return `Parola en az ${PASSWORD_MIN_LENGTH} karakter olmalı.`
  if (value.length > 200) return 'Parola en fazla 200 karakter olabilir.'
  if (email && value.toLowerCase().includes(String(email).split('@')[0].toLowerCase())) return 'Parola e-posta adını içermemeli.'
  if (new Set(value).size < 6) return 'Parola çok tekrarlı; daha çeşitli karakterler kullanın.'
  return ''
}

// ─── TOTP (RFC 6238, SHA-1, 6 digits, 30 s) ────────────────────────
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(buffer) {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31]
  return output
}

function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const bytes = []
  for (const char of clean) {
    value = (value << 5) | BASE32.indexOf(char)
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

export const newTotpSecret = () => base32Encode(randomBytes(20))

export function totpCode(secret, counter) {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', base32Decode(secret)).update(message).digest()
  const offset = digest[digest.length - 1] & 15
  const number = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return String(number).padStart(6, '0')
}

export const totpCounter = (time = Date.now()) => Math.floor(time / 30_000)

// Returns the matching counter (one step of clock drift either way), or null.
// Callers store it and reject codes at or below it, so a code works only once.
export function verifyTotp(secret, code, lastCounter = null) {
  const clean = String(code || '').replace(/\s+/g, '')
  if (!/^\d{6}$/.test(clean)) return null
  const now = totpCounter()
  for (const counter of [now - 1, now, now + 1]) {
    if (lastCounter !== null && counter <= Number(lastCounter)) continue
    const expected = Buffer.from(totpCode(secret, counter))
    if (timingSafeEqual(expected, Buffer.from(clean))) return counter
  }
  return null
}

export const otpauthUrl = (email, secret) =>
  `otpauth://totp/${encodeURIComponent(`UniPlanners Panel:${email}`)}?secret=${secret}&issuer=${encodeURIComponent('UniPlanners Panel')}&algorithm=SHA1&digits=6&period=30`

// ─── TOTP secrets at rest (AES-256-GCM) ─────────────────────────────
// The key comes from ADMIN_SECRET, which the server already has. It used to be
// the shared panel password; now it only protects stored secrets.
function encryptionKey() {
  const secret = process.env.ADMIN_SECRET
  if (!secret || secret.length < 32) return null
  return Buffer.from(hkdfSync('sha256', secret, 'uniplanners-panel', 'totp-secret-v1', 32))
}

export const encryptionConfigured = () => Boolean(encryptionKey())

export function sealSecret(plain) {
  const key = encryptionKey()
  if (!key) throw new Error('ADMIN_SECRET (32+ characters) is required to store two-factor secrets')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.')
}

export function openSecret(sealed) {
  const key = encryptionKey()
  const [version, iv, tag, data] = String(sealed || '').split('.')
  if (!key || version !== 'v1') return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

// ─── Opaque tokens ──────────────────────────────────────────────────
// Only the SHA-256 of a session or setup token is stored, so a database dump
// cannot be replayed as a login.
export const newToken = () => randomBytes(32).toString('base64url')
export const hashToken = token => createHash('sha256').update(String(token)).digest('hex')
