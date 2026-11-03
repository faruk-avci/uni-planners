// Per-university surveys, editable in the panel.
//
// data/surveys/<university>.json keeps the live definition and every earlier
// version. Changing the questions creates a new version; responses store the
// version they answered, so results are always read against the questions
// that were actually asked. Until a survey is first saved, the definition in
// config/surveys.js is used as version 1.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import path from 'path'
import { SURVEYS } from '../config/surveys.js'
import { isUniversity } from '../config/universities.js'
import { DATA_ROOT } from './curriculumStore.js'

const SURVEY_DIR = path.join(DATA_ROOT, 'surveys')
const KEY = /^[a-z][a-z0-9_]{0,39}$/
const TYPES = new Set(['scale', 'multi', 'text', 'email'])
const cache = new Map()

function fileFor(university) {
  if (!isUniversity(university)) throw new Error('Unknown university')
  return path.join(SURVEY_DIR, `${university}.json`)
}

function defaultRecord(university) {
  const base = SURVEYS[university] || SURVEYS.ozyegin
  const current = { version: 1, title: base.title, questions: base.questions, active: true, updatedAt: null, updatedBy: null }
  return { current, history: [{ version: 1, title: base.title, questions: base.questions, savedAt: null }] }
}

function readRecord(university) {
  if (cache.has(university)) return cache.get(university)
  const file = fileFor(university)
  let record = defaultRecord(university)
  try { if (existsSync(file)) record = JSON.parse(readFileSync(file, 'utf8')) } catch { /* keep default */ }
  cache.set(university, record)
  return record
}

function writeRecord(university, record) {
  mkdirSync(SURVEY_DIR, { recursive: true })
  const file = fileFor(university)
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(temp, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  renameSync(temp, file)
  cache.set(university, record)
}

export function getSurvey(university) {
  if (!isUniversity(university)) return null
  return readRecord(university).current
}

// The questions a given version asked (for reading older responses).
export function getSurveyVersion(university, version) {
  const record = readRecord(university)
  return record.history.find(item => item.version === Number(version)) || (record.current.version === Number(version) ? record.current : null)
}

export function listSurveyVersions(university) {
  return readRecord(university).history.map(({ version, savedAt }) => ({ version, savedAt }))
}

// What the browser needs to render the form; null when closed or unknown.
export function publicSurvey(university) {
  const survey = getSurvey(university)
  if (!survey || !survey.active) return null
  return { university, version: survey.version, title: survey.title, questions: survey.questions }
}

// ─── Validation of an edited definition ────────────────────────────
const text = (value, max, label, required = true) => {
  const clean = String(value ?? '').trim()
  if (required && !clean) throw new Error(`${label} boş olamaz`)
  if (clean.length > max) throw new Error(`${label} en fazla ${max} karakter olabilir`)
  return clean
}
const bilingual = (value, max, label, required = true) => ({
  tr: text(value?.tr, max, `${label} (TR)`, required),
  en: text(value?.en, max, `${label} (EN)`, required),
})

function cleanQuestion(input, index) {
  const at = `Soru ${index + 1}`
  const key = String(input?.key || '').trim()
  if (!KEY.test(key)) throw new Error(`${at}: anahtar küçük harf, rakam ve _ içermeli (örn. genel_puan)`)
  if (!TYPES.has(input?.type)) throw new Error(`${at}: bilinmeyen soru tipi`)
  const question = { key, type: input.type, required: Boolean(input.required), label: bilingual(input.label, 300, `${at} metni`) }
  const hint = { tr: text(input.hint?.tr, 200, `${at} ipucu`, false), en: text(input.hint?.en, 200, `${at} ipucu`, false) }
  if (hint.tr || hint.en) question.hint = hint
  if (input.type === 'scale') {
    const min = Number(input.min)
    const max = Number(input.max)
    if (![0, 1].includes(min) || !Number.isInteger(max) || max < 2 || max > 10 || max <= min) {
      throw new Error(`${at}: ölçek 0 veya 1'den başlamalı, 2 ile 10 arasında bitmeli`)
    }
    Object.assign(question, { min, max })
  } else if (input.type === 'multi') {
    const options = Array.isArray(input.options) ? input.options : []
    if (options.length < 1 || options.length > 20) throw new Error(`${at}: 1 ile 20 arasında seçenek olmalı`)
    const values = new Set()
    question.options = options.map((option, i) => {
      const value = String(option?.value || '').trim()
      if (!KEY.test(value) || values.has(value)) throw new Error(`${at}, seçenek ${i + 1}: benzersiz bir anahtar gerekli`)
      values.add(value)
      return { value, tr: text(option.tr, 200, `${at}, seçenek ${i + 1} (TR)`), en: text(option.en, 200, `${at}, seçenek ${i + 1} (EN)`) }
    })
    question.allowOther = Boolean(input.allowOther)
  } else {
    const fallback = input.type === 'email' ? 200 : 1000
    const maxLength = Number(input.maxLength) || fallback
    if (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > 2000) throw new Error(`${at}: uzunluk sınırı 1-2000 olmalı`)
    question.maxLength = maxLength
  }
  return question
}

export function validateSurveyDefinition(input) {
  const questions = Array.isArray(input?.questions) ? input.questions : []
  if (questions.length < 1 || questions.length > 30) throw new Error('Ankette 1 ile 30 arasında soru olmalı')
  const cleaned = questions.map(cleanQuestion)
  const keys = new Set()
  for (const question of cleaned) {
    if (keys.has(question.key)) throw new Error(`"${question.key}" anahtarı birden fazla soruda kullanılmış`)
    keys.add(question.key)
  }
  return { title: bilingual(input?.title, 200, 'Anket başlığı'), questions: cleaned, active: input?.active !== false }
}

// Saves an edited survey. A new version is created only when the questions
// change; renaming or opening/closing keeps the version (and its results).
export function saveSurvey(university, input, updatedBy = null) {
  const clean = validateSurveyDefinition(input)
  const record = readRecord(university)
  const questionsChanged = JSON.stringify(clean.questions) !== JSON.stringify(record.current.questions)
  const version = questionsChanged ? Math.max(...record.history.map(item => item.version), record.current.version) + 1 : record.current.version
  const now = new Date().toISOString()
  const current = { version, title: clean.title, questions: clean.questions, active: clean.active, updatedAt: now, updatedBy }
  const history = questionsChanged
    ? [...record.history, { version, title: clean.title, questions: clean.questions, savedAt: now }]
    : record.history.map(item => (item.version === version ? { ...item, title: clean.title } : item))
  writeRecord(university, { current, history })
  return { survey: current, newVersion: questionsChanged }
}
