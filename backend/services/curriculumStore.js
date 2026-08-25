import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DATA_ROOT = path.resolve(process.env.APP_DATA_DIR || path.join(__dirname, '..', 'data'))
const CURRICULUM_DIR = path.join(DATA_ROOT, 'curriculums')
const ELECTIVE_DIR = path.join(DATA_ROOT, 'elective-pools')
const SITE_SETTINGS_FILE = path.join(DATA_ROOT, 'site-settings.json')
const SAFE_KEY = /^[a-z0-9][a-z0-9_-]{0,79}$/
const SITE_FONTS = new Set(['system', 'inter', 'arial', 'rounded'])

export const DEFAULT_SITE_SETTINGS = {
  mainFont: 'system',
  catalogTerm: process.env.CATALOG_TERM || '2025-2026 Yaz',
  surveyUrl: '',
}

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

export function listCurriculumData() {
  ensureDirectories()
  return readdirSync(CURRICULUM_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => {
      try { return readJson(path.join(CURRICULUM_DIR, entry.name)) } catch { return null }
    })
    .filter(Boolean)
}

export function readCurriculumData(id, { resolveElectives = true } = {}) {
  const key = safeKey(id, 'curriculum id')
  const file = path.join(CURRICULUM_DIR, `${key}.json`)
  if (!existsSync(file)) return null
  const data = readJson(file)
  if (!resolveElectives || !data.electivePoolRefs) return data

  const electives = { ...(data.electives || {}) }
  for (const [type, poolKey] of Object.entries(data.electivePoolRefs)) {
    const pool = readElectivePool(poolKey)
    electives[type] = pool?.courses || []
  }
  return { ...data, electives }
}

export function writeCurriculumData(data) {
  const id = safeKey(data?.id, 'curriculum id')
  const saved = { ...data, id, updatedAt: new Date().toISOString() }
  atomicWrite(path.join(CURRICULUM_DIR, `${id}.json`), saved)
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
  const file = path.join(ELECTIVE_DIR, `${safe}.json`)
  return existsSync(file) ? readJson(file) : null
}

export function writeElectivePool(pool) {
  const key = safeKey(pool?.key, 'elective pool key')
  const saved = { ...pool, key, updatedAt: new Date().toISOString() }
  atomicWrite(path.join(ELECTIVE_DIR, `${key}.json`), saved)
  return saved
}

export function readSiteSettings() {
  ensureDirectories()
  if (!existsSync(SITE_SETTINGS_FILE)) return { ...DEFAULT_SITE_SETTINGS }
  try {
    return { ...DEFAULT_SITE_SETTINGS, ...readJson(SITE_SETTINGS_FILE) }
  } catch {
    return { ...DEFAULT_SITE_SETTINGS }
  }
}

export function writeSiteSettings(input) {
  const mainFont = SITE_FONTS.has(input?.mainFont) ? input.mainFont : DEFAULT_SITE_SETTINGS.mainFont
  const catalogTerm = String(input?.catalogTerm || '').trim().slice(0, 60)
  const surveyUrl = String(input?.surveyUrl || '').trim().slice(0, 500)
  if (!catalogTerm) throw new Error('Academic term is required')
  if (surveyUrl) {
    let parsed
    try { parsed = new URL(surveyUrl) } catch { throw new Error('Survey link must be a valid URL') }
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) {
      throw new Error('Survey link must use HTTPS')
    }
  }
  const saved = { mainFont, catalogTerm, surveyUrl, updatedAt: new Date().toISOString() }
  atomicWrite(SITE_SETTINGS_FILE, saved)
  return saved
}
