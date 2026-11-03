import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DEFAULT_UNIVERSITY, isUniversity } from '../config/universities.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DATA_ROOT = path.resolve(process.env.APP_DATA_DIR || path.join(__dirname, '..', 'data'))
const CURRICULUM_DIR = path.join(DATA_ROOT, 'curriculums')
const ELECTIVE_DIR = path.join(DATA_ROOT, 'elective-pools')
const SITE_SETTINGS_FILE = path.join(DATA_ROOT, 'site-settings.json')
const SAFE_KEY = /^[a-z0-9][a-z0-9_-]{0,79}$/
const SITE_FONTS = new Set(['grotesk', 'system', 'inter', 'arial', 'rounded'])

// Site settings: `global` applies to the whole site (font), `universities`
// holds each university's own term, survey link, announcement and notice, so
// one university's announcement never shows on another's pages.
export const DEFAULT_GLOBAL_SETTINGS = { mainFont: 'grotesk' }
export const DEFAULT_UNIVERSITY_SETTINGS = {
  catalogTerm: process.env.CATALOG_TERM || '2026-2027 Güz',
  surveyUrl: '',
  announcementUrl: '',
  catalogNotice: '',
  catalogNoticeUpdatedAt: '',
}
// Kept for callers that only need the defaults of the merged shape.
export const DEFAULT_SITE_SETTINGS = { ...DEFAULT_GLOBAL_SETTINGS, ...DEFAULT_UNIVERSITY_SETTINGS }

function ensureDirectories() {
  mkdirSync(CURRICULUM_DIR, { recursive: true })
  mkdirSync(ELECTIVE_DIR, { recursive: true })
}

function safeKey(value, label = 'key') {
  const key = String(value || '').trim().toLowerCase()
  if (!SAFE_KEY.test(key)) throw new Error(`Invalid ${label}`)
  return key
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function atomicWrite(file, value) {
  ensureDirectories()
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  renameSync(temp, file)
}

// Cached like readCurriculumData below -- otherwise every /api/curriculums
// list request re-reads and re-parses every curriculum file from disk
// synchronously, which also means it blocks the event loop under load.
// Invalidated in writeCurriculumData, the only place this data changes.
let curriculumListCache = null

export function listCurriculumData() {
  if (curriculumListCache) return curriculumListCache
  ensureDirectories()
  curriculumListCache = readdirSync(CURRICULUM_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => {
      try { return readJson(path.join(CURRICULUM_DIR, entry.name)) } catch { return null }
    })
    .filter(Boolean)
  return curriculumListCache
}

// readCurriculumData (always called with the default resolveElectives=true
// in practice) is on nearly every hot path: schedule generation, fitting
// suggestions, degree-audit matching, curriculum detail views. It's just a
// JSON file re-read and re-parsed from disk every single call otherwise.
// Cached here, invalidated directly in the two write functions below since
// they're the only places this data ever changes.
const curriculumCache = new Map()
const poolCache = new Map()

export function readCurriculumData(id, { resolveElectives = true } = {}) {
  const key = safeKey(id, 'curriculum id')
  if (resolveElectives && curriculumCache.has(key)) return curriculumCache.get(key)

  const file = path.join(CURRICULUM_DIR, `${key}.json`)
  if (!existsSync(file)) {
    if (resolveElectives) curriculumCache.set(key, null)
    return null
  }
  const data = readJson(file)
  if (!resolveElectives || !data.electivePoolRefs) {
    if (resolveElectives) curriculumCache.set(key, data)
    return data
  }

  const electives = { ...(data.electives || {}) }
  for (const [type, poolKey] of Object.entries(data.electivePoolRefs)) {
    const pool = readElectivePool(poolKey)
    electives[type] = pool?.courses || []
  }
  const resolved = { ...data, electives }
  curriculumCache.set(key, resolved)
  return resolved
}

export function writeCurriculumData(data) {
  const id = safeKey(data?.id, 'curriculum id')
  const saved = { ...data, id, updatedAt: new Date().toISOString() }
  atomicWrite(path.join(CURRICULUM_DIR, `${id}.json`), saved)
  curriculumCache.delete(id)
  curriculumListCache = null
  return saved
}

export function listElectivePools() {
  ensureDirectories()
  return readdirSync(ELECTIVE_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => {
      try {
        const pool = readJson(path.join(ELECTIVE_DIR, entry.name))
        return { key: pool.key, label: pool.label, courseCount: pool.courses?.length || 0, updatedAt: pool.updatedAt }
      } catch { return null }
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label, 'tr'))
}

export function readElectivePool(key) {
  const safe = safeKey(key, 'elective pool key')
  if (poolCache.has(safe)) return poolCache.get(safe)
  const file = path.join(ELECTIVE_DIR, `${safe}.json`)
  const pool = existsSync(file) ? readJson(file) : null
  poolCache.set(safe, pool)
  return pool
}

export function writeElectivePool(pool) {
  const key = safeKey(pool?.key, 'elective pool key')
  const saved = { ...pool, key, updatedAt: new Date().toISOString() }
  atomicWrite(path.join(ELECTIVE_DIR, `${key}.json`), saved)
  poolCache.delete(key)
  // A pool's courses feed into every curriculum that embeds it via
  // electivePoolRefs. Rather than tracking that reverse mapping, just clear
  // every cached curriculum too -- pool edits are a rare admin action, so
  // the cost of re-resolving on the next read is negligible.
  curriculumCache.clear()
  return saved
}

// Before per-university settings the file held one flat object; that was
// Özyeğin's, so it becomes Özyeğin's settings plus the global font.
function readSettingsFile() {
  ensureDirectories()
  let raw = {}
  try { if (existsSync(SITE_SETTINGS_FILE)) raw = readJson(SITE_SETTINGS_FILE) } catch { raw = {} }
  if (raw.version === 2) return { version: 2, global: raw.global || {}, universities: raw.universities || {} }
  const { mainFont, ...ozyegin } = raw
  return { version: 2, global: mainFont ? { mainFont } : {}, universities: Object.keys(ozyegin).length ? { [DEFAULT_UNIVERSITY]: ozyegin } : {} }
}

export function readGlobalSettings() {
  return { ...DEFAULT_GLOBAL_SETTINGS, ...readSettingsFile().global }
}

export function readUniversitySettings(university = DEFAULT_UNIVERSITY) {
  if (!isUniversity(university)) throw new Error('Unknown university')
  return { ...DEFAULT_UNIVERSITY_SETTINGS, ...(readSettingsFile().universities[university] || {}) }
}

// What the public site gets for one university: global + that university's.
export function readSiteSettings(university = DEFAULT_UNIVERSITY) {
  return { ...readGlobalSettings(), ...readUniversitySettings(university), university }
}

function validateOptionalHttpsUrl(value, label) {
  const trimmed = String(value || '').trim().slice(0, 500)
  if (!trimmed) return trimmed
  let parsed
  try { parsed = new URL(trimmed) } catch { throw new Error(`${label} must be a valid URL`) }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) {
    throw new Error(`${label} must use HTTPS`)
  }
  return trimmed
}

export function writeGlobalSettings(input, updatedBy = null) {
  const file = readSettingsFile()
  const mainFont = SITE_FONTS.has(input?.mainFont) ? input.mainFont : DEFAULT_GLOBAL_SETTINGS.mainFont
  file.global = { mainFont, updatedAt: new Date().toISOString(), updatedBy }
  atomicWrite(SITE_SETTINGS_FILE, file)
  return readGlobalSettings()
}

export function writeUniversitySettings(university, input, updatedBy = null) {
  if (!isUniversity(university)) throw new Error('Unknown university')
  const catalogTerm = String(input?.catalogTerm || '').trim().slice(0, 60)
  if (!catalogTerm) throw new Error('Academic term is required')
  const surveyUrl = validateOptionalHttpsUrl(input?.surveyUrl, 'Survey link')
  const announcementUrl = validateOptionalHttpsUrl(input?.announcementUrl, 'Announcement link')
  const catalogNotice = String(input?.catalogNotice || '').trim().slice(0, 500)

  // Only bump the notice's own timestamp when its text actually changes --
  // not on every settings save (term updates etc. shouldn't make a
  // previously-dismissed notice reappear for users).
  const previous = readUniversitySettings(university)
  const catalogNoticeUpdatedAt = catalogNotice !== previous.catalogNotice
    ? new Date().toISOString()
    : previous.catalogNoticeUpdatedAt

  const file = readSettingsFile()
  file.universities[university] = {
    catalogTerm, surveyUrl, announcementUrl, catalogNotice, catalogNoticeUpdatedAt,
    updatedAt: new Date().toISOString(), updatedBy,
  }
  atomicWrite(SITE_SETTINGS_FILE, file)
  return readUniversitySettings(university)
}
