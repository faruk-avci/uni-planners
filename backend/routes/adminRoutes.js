import express from 'express'
import { pool } from '../config/db.js'
import { FACULTIES, PROGRAMS, PROGRAM_BY_ID } from '../config/programs.js'
import { UNIVERSITIES, UNIVERSITY_BY_SLUG } from '../config/universities.js'
import { csrfGuard, requireAdmin, requireSuperadmin, requireUniversityForMethod, roleFor } from '../middleware/adminAuth.js'
import adminAuthRoutes, { publicUser } from './adminAuthRoutes.js'
import {
  audit, createUser, deleteUser, getUser, listAudit, listUsers, normalizeEmail, resetUser, setAccess, updateUser, validEmail,
} from '../services/adminAccounts.js'
import { electiveKeyForLabel, parseCurriculumWorkbook, parseElectiveWorkbook } from '../services/curriculumWorkbook.js'
import {
  listCurriculumData,
  listElectivePools,
  readCurriculumData,
  readGlobalSettings,
  readUniversitySettings,
  writeCurriculumData,
  writeElectivePool,
  writeGlobalSettings,
  writeUniversitySettings,
} from '../services/curriculumStore.js'
import { listStaticCurricula } from '../services/staticCurricula.js'
import { getSurvey, getSurveyVersion, listSurveyVersions, saveSurvey } from '../services/surveyStore.js'

const router = express.Router()
const excelBody = express.raw({ type: 'application/octet-stream', limit: '10mb' })

// Panel responses carry account and student data: never cache them.
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next() })
router.use(csrfGuard)
router.use(adminAuthRoutes)
router.use(requireAdmin)

const accessibleUniversities = user => UNIVERSITIES.filter(university => roleFor(user, university.slug))

// ─── Overview ───────────────────────────────────────────────────────
// One card per university the signed-in person may see.
router.get('/overview', async (req, res, next) => {
  try {
    const universities = accessibleUniversities(req.adminUser)
    const slugs = universities.map(university => university.slug)
    const { rows: responseRows } = await pool.query(
      `SELECT university, survey_version, count(*)::int AS count, max(submitted_on) AS last
         FROM survey_responses WHERE university = ANY($1)
        GROUP BY university, survey_version`,
      [slugs]
    )
    const cards = universities.map(university => {
      const settings = readUniversitySettings(university.slug)
      const survey = getSurvey(university.slug)
      const responses = responseRows.filter(row => row.university === university.slug)
      const curricula = university.curriculumSource === 'panel'
        ? { total: listCurriculumData().length, listed: listCurriculumData().length }
        : (list => ({ total: list.length, listed: list.filter(item => item.listed).length }))(listStaticCurricula(university.slug))
      return {
        ...university,
        role: roleFor(req.adminUser, university.slug),
        settings: {
          catalogTerm: settings.catalogTerm,
          hasSurveyLink: Boolean(settings.surveyUrl),
          hasAnnouncement: Boolean(settings.announcementUrl),
          catalogNotice: settings.catalogNotice,
          updatedAt: settings.updatedAt || null,
        },
        survey: {
          active: survey.active,
          version: survey.version,
          responses: responses.reduce((sum, row) => sum + row.count, 0),
          currentVersionResponses: responses.find(row => row.survey_version === survey.version)?.count || 0,
          lastResponse: responses.map(row => row.last).sort().pop() || null,
        },
        curricula,
      }
    })
    res.json({ universities: cards })
  } catch (error) { next(error) }
})

// ─── Superadmin: global settings, accounts, audit, raw logs ─────────
router.get('/global-settings', requireSuperadmin, (_req, res) => res.json(readGlobalSettings()))
router.put('/global-settings', requireSuperadmin, async (req, res) => {
  try {
    const before = readGlobalSettings()
    const saved = writeGlobalSettings(req.body, req.adminUser.email)
    await audit(req, 'global_settings_saved', { details: { mainFont: [before.mainFont, saved.mainFont] } })
    return res.json(saved)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
})

const cleanAccess = input => Object.fromEntries(
  Object.entries(input && typeof input === 'object' ? input : {})
    .filter(([slug, role]) => UNIVERSITY_BY_SLUG.has(slug) && ['viewer', 'editor'].includes(role))
)
const userView = user => ({
  ...publicUser(user),
  disabled: user.disabled,
  totpEnabled: user.totp_enabled,
  hasPassword: user.has_password,
  setupPending: Boolean(user.setup_expires_at) && !user.has_password,
  setupExpiresAt: user.setup_expires_at,
  lockedUntil: user.locked_until,
  createdAt: user.created_at,
})

async function activeSuperadminCount(exceptId) {
  const { rows } = await pool.query(
    'SELECT count(*)::int AS count FROM admin_users WHERE is_superadmin AND NOT disabled AND id <> $1',
    [exceptId]
  )
  return rows[0].count
}

router.get('/users', requireSuperadmin, async (_req, res, next) => {
  try { res.json({ users: (await listUsers()).map(userView), universities: UNIVERSITIES }) } catch (error) { next(error) }
})

router.post('/users', requireSuperadmin, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email)
    if (!validEmail(email)) return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin.' })
    const isSuperadmin = Boolean(req.body?.isSuperadmin)
    const access = isSuperadmin ? {} : cleanAccess(req.body?.access)
    if (!isSuperadmin && !Object.keys(access).length) return res.status(400).json({ error: 'En az bir üniversite için yetki seçin.' })
    const { rows } = await pool.query('SELECT 1 FROM admin_users WHERE email = $1', [email])
    if (rows.length) return res.status(409).json({ error: 'Bu e-posta ile bir hesap zaten var.' })
    const { id, setupToken } = await createUser({ email, displayName: req.body?.displayName, isSuperadmin, createdBy: req.adminUser.id })
    await setAccess(id, access, req.adminUser.id)
    await audit(req, 'user_created', { details: { email, isSuperadmin, access } })
    return res.status(201).json({ user: userView(await getUser(id)), setupToken })
  } catch (error) { next(error) }
})

router.patch('/users/:id', requireSuperadmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const user = await getUser(id)
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' })
    const changes = {}
    if (req.body?.displayName !== undefined) changes.displayName = req.body.displayName
    if (req.body?.disabled !== undefined) changes.disabled = Boolean(req.body.disabled)
    if (req.body?.isSuperadmin !== undefined) changes.isSuperadmin = Boolean(req.body.isSuperadmin)
    const losesSuperadmin = user.is_superadmin && (changes.disabled === true || changes.isSuperadmin === false)
    if (id === req.adminUser.id && (changes.disabled === true || changes.isSuperadmin === false)) {
      return res.status(400).json({ error: 'Kendi hesabınızı devre dışı bırakamaz veya yetkisini düşüremezsiniz.' })
    }
    if (losesSuperadmin && (await activeSuperadminCount(id)) === 0) {
      return res.status(400).json({ error: 'En az bir etkin süper yönetici kalmalı.' })
    }
    await updateUser(id, changes)
    if (req.body?.access !== undefined) await setAccess(id, cleanAccess(req.body.access), req.adminUser.id)
    await audit(req, 'user_updated', { details: { email: user.email, ...changes, ...(req.body?.access !== undefined ? { access: cleanAccess(req.body.access) } : {}) } })
    return res.json({ user: userView(await getUser(id)) })
  } catch (error) { next(error) }
})

router.post('/users/:id/reset', requireSuperadmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const user = await getUser(id)
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' })
    if (id === req.adminUser.id) return res.status(400).json({ error: 'Kendi hesabınızı buradan sıfırlayamazsınız; Hesabım sayfasını kullanın.' })
    const setupToken = await resetUser(id)
    await audit(req, 'user_reset', { details: { email: user.email } })
    return res.json({ user: userView(await getUser(id)), setupToken })
  } catch (error) { next(error) }
})

router.delete('/users/:id', requireSuperadmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const user = await getUser(id)
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' })
    if (id === req.adminUser.id) return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz.' })
    if (user.is_superadmin && (await activeSuperadminCount(id)) === 0) return res.status(400).json({ error: 'En az bir etkin süper yönetici kalmalı.' })
    await deleteUser(id)
    await audit(req, 'user_deleted', { details: { email: user.email } })
    return res.json({ ok: true })
  } catch (error) { next(error) }
})

router.get('/audit', requireSuperadmin, async (req, res, next) => {
  try {
    const university = UNIVERSITY_BY_SLUG.has(req.query.university) ? req.query.university : null
    res.json({ entries: await listAudit({ university, limit: req.query.limit }) })
  } catch (error) { next(error) }
})

// ─── Per university ─────────────────────────────────────────────────
// Everything below is scoped to one university: viewers may read, editors may
// also change. A person never reaches another university's routes.
const uni = express.Router({ mergeParams: true })
router.use('/u/:university', requireUniversityForMethod(), uni)

uni.get('/site-settings', (req, res) => res.json(readUniversitySettings(req.university)))
uni.put('/site-settings', async (req, res) => {
  try {
    const before = readUniversitySettings(req.university)
    const saved = writeUniversitySettings(req.university, req.body, req.adminUser.email)
    const changed = ['catalogTerm', 'surveyUrl', 'announcementUrl', 'catalogNotice'].filter(key => before[key] !== saved[key])
    await audit(req, 'site_settings_saved', { university: req.university, details: { changed } })
    return res.json(saved)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
})

uni.get('/audit', async (req, res, next) => {
  try { res.json({ entries: await listAudit({ university: req.university, limit: req.query.limit }) }) } catch (error) { next(error) }
})

// --- Survey: definition, versions, results ---

uni.get('/survey', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT survey_version AS version, count(*)::int AS count FROM survey_responses WHERE university = $1 GROUP BY survey_version',
      [req.university]
    )
    const counts = Object.fromEntries(rows.map(row => [row.version, row.count]))
    res.json({
      survey: getSurvey(req.university),
      versions: listSurveyVersions(req.university).map(item => ({ ...item, responses: counts[item.version] || 0 })),
    })
  } catch (error) { next(error) }
})

uni.put('/survey', async (req, res) => {
  try {
    const before = getSurvey(req.university)
    const { survey, newVersion } = saveSurvey(req.university, req.body, req.adminUser.email)
    await audit(req, 'survey_saved', {
      university: req.university,
      details: { version: survey.version, newVersion, questions: survey.questions.length, active: survey.active, wasActive: before.active },
    })
    return res.json({ survey, newVersion })
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
})

const surveyAnswerText = (question, value) => {
  if (value === undefined || value === null) return ''
  if (question.type === 'multi') {
    const labels = (value.selected || []).map(key => question.options.find(option => option.value === key)?.tr || key)
    if (value.other) labels.push(`Diğer: ${value.other}`)
    return labels.join('; ')
  }
  return String(value)
}

const surveyRows = (university, version) => pool.query(
  `SELECT answers, major_code, grade_level, layout, submitted_on
     FROM survey_responses
    WHERE university = $1 AND survey_version = $2
    ORDER BY submitted_on DESC`,
  [university, version]
)

const isoDate = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '')

// ?version= picks which questions to read responses against (default: live).
function surveyForRequest(req) {
  const version = Number(req.query.version) || getSurvey(req.university).version
  const definition = getSurveyVersion(req.university, version)
  return definition ? { version, definition } : null
}

uni.get('/survey/results', async (req, res, next) => {
  try {
    const picked = surveyForRequest(req)
    if (!picked) return res.status(404).json({ error: 'Survey version not found' })
    const { rows } = await surveyRows(req.university, picked.version)
    const questions = picked.definition.questions.map(question => {
      const values = rows.map(row => row.answers?.[question.key]).filter(value => value !== undefined && value !== null)
      if (question.type === 'scale') {
        const counts = {}
        for (let score = question.min; score <= question.max; score++) counts[score] = 0
        values.forEach(value => { counts[value] = (counts[value] || 0) + 1 })
        const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
        return { key: question.key, type: question.type, label: question.label.tr, min: question.min, max: question.max, answered: values.length, average, counts }
      }
      if (question.type === 'multi') {
        const counts = Object.fromEntries(question.options.map(option => [option.value, 0]))
        const other = []
        values.forEach(value => {
          (value.selected || []).forEach(key => { counts[key] = (counts[key] || 0) + 1 })
          if (value.other) other.push(value.other)
        })
        return {
          key: question.key, type: question.type, label: question.label.tr, answered: values.length,
          options: question.options.map(option => ({ value: option.value, label: option.tr, count: counts[option.value] || 0 })),
          other,
        }
      }
      // text and e-mail questions: list the answers themselves
      const answers = rows
        .filter(row => row.answers?.[question.key])
        .map(row => ({ text: row.answers[question.key], date: isoDate(row.submitted_on), major: row.major_code, grade: row.grade_level, layout: row.layout }))
      return { key: question.key, type: question.type, label: question.label.tr, answered: answers.length, answers }
    })
    const byLayout = {}
    rows.forEach(row => { const key = row.layout || 'unknown'; byLayout[key] = (byLayout[key] || 0) + 1 })
    res.json({ university: req.university, version: picked.version, total: rows.length, byLayout, questions })
  } catch (error) { next(error) }
})

uni.get('/survey/export.csv', async (req, res, next) => {
  try {
    const picked = surveyForRequest(req)
    if (!picked) return res.status(404).json({ error: 'Survey version not found' })
    const { rows } = await surveyRows(req.university, picked.version)
    // Spreadsheet apps run cells starting with = + - @ as formulas; prefix them.
    const cell = value => {
      const text = String(value ?? '')
      return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`
    }
    const header = ['Tarih', 'Bölüm', 'Sınıf', 'Tasarım', ...picked.definition.questions.map(question => question.label.tr)]
    const lines = [header.map(cell).join(',')]
    rows.forEach(row => {
      const layout = row.layout === '2' ? 'Odak' : row.layout === '1' ? 'Klasik' : ''
      lines.push([isoDate(row.submitted_on), row.major_code, row.grade_level, layout, ...picked.definition.questions.map(question => surveyAnswerText(question, row.answers?.[question.key]))].map(cell).join(','))
    })
    await audit(req, 'survey_exported', { university: req.university, details: { version: picked.version, rows: rows.length } })
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="uniplanners-anket-${req.university}-v${picked.version}.csv"`)
    // BOM so Excel opens the Turkish characters correctly.
    res.send('﻿' + lines.join('\r\n'))
  } catch (error) { next(error) }
})

// --- Curricula ---

uni.get('/curriculums', (req, res) => {
  const university = UNIVERSITY_BY_SLUG.get(req.university)
  if (university.curriculumSource === 'static') {
    return res.json({ source: 'static', curricula: listStaticCurricula(req.university) })
  }
  const curricula = listCurriculumData().map(data => ({
    id: data.id,
    title_tr: data.title_tr,
    title_en: data.title_en,
    faculty: data.faculty,
    programCodes: data.programCodes || PROGRAM_BY_ID.get(data.id)?.codes || [],
    sourceFile: data.sourceFile || null,
    updatedAt: data.updatedAt || null,
    listed: true,
    courseCount: Object.values(data.semesters || {}).reduce(
      (sum, terms) => sum + (terms.fall?.filter(item => item.code).length || 0) + (terms.spring?.filter(item => item.code).length || 0), 0
    ),
    electiveRequirementCount: Object.keys(data.electivePoolRefs || data.electives || {}).length,
  }))
  return res.json({ source: 'panel', curricula: curricula.sort((a, b) => a.title_tr.localeCompare(b.title_tr, 'tr')) })
})

// Excel-managed curricula (Özyeğin). Only universities whose curricula are
// uploaded in the panel reach these routes.
const panelCurricula = express.Router({ mergeParams: true })
uni.use((req, res, next) => (UNIVERSITY_BY_SLUG.get(req.university).curriculumSource === 'panel' ? panelCurricula(req, res, next) : next()))

panelCurricula.get('/programs', (_req, res) => res.json({ faculties: FACULTIES, programs: PROGRAMS }))

panelCurricula.get('/curriculums/:id', (req, res) => {
  try {
    const data = readCurriculumData(req.params.id)
    if (!data) return res.status(404).json({ error: 'Curriculum not found' })
    return res.json(data)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
})

panelCurricula.post('/curriculums/inspect-file', excelBody, (req, res) => {
  try {
    const parsed = parseCurriculumWorkbook(req.body)
    res.locals.activity = {
      ...res.locals.activity,
      fileName: String(req.get('x-file-name') || '').slice(0, 180),
      courseCount: parsed.courseCount,
      electiveRequirementCount: parsed.electiveRequirements.length,
    }
    res.json(parsed)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

panelCurricula.get('/elective-pools', (_req, res) => res.json(listElectivePools()))

panelCurricula.post('/elective-pools/inspect-file', excelBody, (req, res) => {
  try {
    const courses = parseElectiveWorkbook(req.body)
    res.json({ courseCount: courses.length, courses })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

panelCurricula.put('/elective-pools/:key', async (req, res) => {
  try {
    const courses = Array.isArray(req.body?.courses) ? req.body.courses : []
    const label = String(req.body?.label || '').trim().slice(0, 180)
    if (!label || courses.length === 0 || courses.length > 10000) {
      return res.status(400).json({ error: 'A label and parsed course list are required' })
    }
    const saved = writeElectivePool({
      key: req.params.key,
      label,
      sourceFile: String(req.body?.sourceFile || '').slice(0, 180),
      courses,
    })
    await audit(req, 'elective_pool_saved', { university: req.university, details: { key: saved.key, courses: courses.length } })
    return res.json({ key: saved.key, label: saved.label, courseCount: saved.courses.length, updatedAt: saved.updatedAt })
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
})

panelCurricula.put('/curriculums/:id', async (req, res) => {
  try {
    const program = PROGRAM_BY_ID.get(String(req.params.id || '').toLowerCase())
    if (!program) return res.status(400).json({ error: 'Unknown undergraduate program' })
    const draft = req.body?.draft
    const mappings = req.body?.electivePoolRefs || {}
    if (!draft?.semesters || !Number.isFinite(Number(draft.courseCount))) {
      return res.status(400).json({ error: 'Inspect a curriculum workbook first' })
    }
    const missing = (draft.electiveRequirements || []).filter(item => !mappings[item.key])
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing elective files: ${missing.map(item => item.label).join(', ')}` })
    }
    const electiveLabels = Object.fromEntries((draft.electiveRequirements || []).map(item => [item.key, item.label]))
    const data = writeCurriculumData({
      id: program.id,
      title_tr: program.tr,
      title_en: program.en,
      faculty: program.faculty,
      programCodes: program.codes,
      sourceFile: String(req.body?.sourceFile || '').slice(0, 180),
      importedAt: new Date().toISOString(),
      semesters: draft.semesters,
      electivePoolRefs: mappings,
      electiveLabels,
    })
    await audit(req, 'curriculum_saved', { university: req.university, details: { id: program.id, courses: draft.courseCount, sourceFile: data.sourceFile } })
    return res.json(data)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
})

panelCurricula.get('/suggest-elective-key', (req, res) => {
  res.json({ key: electiveKeyForLabel(String(req.query.label || '')) })
})

// --- Analytics ---
// Paths avoid the word "analytics": ad and tracker blockers drop requests
// containing it, which left these panel pages empty for people using one.
// Visitors of this university's planner: their major and year choices and
// where they add courses from.

uni.get('/insights/majors', async (req, res) => {
  try {
    const [current, firstChoice, selections] = await Promise.all([
      pool.query(
        `SELECT major_code AS major, count(*)::int AS visitors
           FROM university_preferences
          WHERE university = $1 AND major_code IS NOT NULL
          GROUP BY major_code
          ORDER BY visitors DESC, major_code`,
        [req.university]
      ),
      pool.query(
        `SELECT first_major_code AS major, count(*)::int AS visitors
           FROM university_preferences
          WHERE university = $1 AND first_major_code IS NOT NULL
          GROUP BY first_major_code
          ORDER BY visitors DESC, first_major_code`,
        [req.university]
      ),
      pool.query(
        `SELECT major_code AS major, count(*)::int AS selections,
                count(DISTINCT session_id)::int AS visitors
           FROM major_selection_events
          WHERE university = $1
          GROUP BY major_code
          ORDER BY selections DESC, major_code`,
        [req.university]
      ),
    ])
    res.json({ current: current.rows, firstChoice: firstChoice.rows, selections: selections.rows })
  } catch (err) {
    console.error('GET /admin/insights/majors error:', err.message)
    res.status(500).json({ error: 'Major analytics could not be loaded' })
  }
})

uni.get('/insights/grades', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT grade_level AS grade, count(*)::int AS visitors
         FROM university_preferences
        WHERE university = $1 AND grade_level IS NOT NULL AND grade_level <> ''
        GROUP BY grade_level
        ORDER BY CASE grade_level
                   WHEN 'prep' THEN 0 WHEN '1' THEN 1 WHEN '2' THEN 2
                   WHEN '3' THEN 3 WHEN '4' THEN 4
                   ELSE 5
                 END`,
      [req.university]
    )
    res.json({ current: rows })
  } catch (err) {
    console.error('GET /admin/insights/grades error:', err.message)
    res.status(500).json({ error: 'Grade analytics could not be loaded' })
  }
})

uni.get('/insights/course-add-sources', async (req, res) => {
  const parsedDays = Number.parseInt(req.query.days, 10)
  const days = Number.isFinite(parsedDays) ? Math.min(Math.max(parsedDays, 1), 365) : 30
  try {
    const { rows } = await pool.query(
      `SELECT source, count(*)::int AS additions, count(DISTINCT session_id)::int AS visitors
         FROM course_add_events
        WHERE university = $2 AND added_at >= now() - make_interval(days => $1)
        GROUP BY source
        ORDER BY additions DESC, source`,
      [days, req.university]
    )
    res.json({ days, total: rows.reduce((sum, row) => sum + row.additions, 0), sources: rows })
  } catch (err) {
    console.error('GET /admin/insights/course-add-sources error:', err.message)
    res.status(500).json({ error: 'Course-add analytics could not be loaded' })
  }
})

// Request logs and the raw event stream (user agents, paths): superadmin only.
router.get('/traffic/requests', requireSuperadmin, async (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10)
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 100
  const action = String(req.query.action || '').trim().slice(0, 80)
  const status = Number.parseInt(req.query.status, 10)
  const sessionId = String(req.query.session || '').trim()
  const conditions = []
  const values = []
  if (action) { values.push(action); conditions.push(`event_action = $${values.length}`) }
  if (Number.isFinite(status)) { values.push(status); conditions.push(`status_code = $${values.length}`) }
  if (/^[0-9a-f-]{36}$/i.test(sessionId)) { values.push(sessionId); conditions.push(`session_id = $${values.length}::uuid`) }
  values.push(limit)

  try {
    const { rows } = await pool.query(
      `SELECT id, request_id, session_id, event_action, method, request_path,
              status_code, duration_ms, request_size, response_size,
              user_agent, referrer, metadata, created_at
         FROM server_request_logs
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
        ORDER BY created_at DESC
        LIMIT $${values.length}`,
      values
    )
    res.json({ requests: rows })
  } catch (err) {
    console.error('GET /admin/traffic/requests error:', err.message)
    res.status(500).json({ error: 'Failed to load request logs' })
  }
})

// Requests already carrying their own dedicated, richer log (course_add_events,
// major_selection_events) are excluded here so the same action doesn't show twice.
// Everything else that hits a real endpoint is included by default; only pure
// boilerplate reads that fire on every page load are excluded as noise.
const REQUEST_LOG_EXCLUDED_ACTIONS = [
  'health_check',
  'major_options_load',
  'site_settings_load',
  'basket_load',
  'saved_basket_list',
  'preferences_load',
  'site_stats_load',
  'course_view',
  'assessments_load',
  'course_add_track',
  'site_event_track',
  'major_set',
  'admin_login',
  'admin_logout',
  'admin_curriculum_list',
  'admin_site_settings_load',
  'admin_curriculum_view',
  'admin_elective_pool_list',
  'admin_analytics_view',
  'api_request',
]

router.get('/traffic/events', requireSuperadmin, async (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10)
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 100
  const since = String(req.query.since || '').trim()
  const sinceValid = since && !Number.isNaN(Date.parse(since))

  try {
    const { rows } = await pool.query(
      `SELECT * FROM (
         SELECT id, created_at, session_id, event_category AS category, event_action AS action,
                event_label AS label, event_data AS data, 'site' AS kind
           FROM site_events
         UNION ALL
         SELECT id, added_at AS created_at, session_id, 'course' AS category, source AS action,
                course_code AS label, jsonb_build_object('selectionMode', selection_mode) AS data,
                'course_add' AS kind
           FROM course_add_events
         UNION ALL
         SELECT id, selected_at AS created_at, session_id, 'major' AS category, source AS action,
                major_code AS label, NULL::jsonb AS data, 'major_selection' AS kind
           FROM major_selection_events
         UNION ALL
         SELECT id, created_at, session_id,
                split_part(event_action, '_', 1) AS category,
                regexp_replace(event_action, '^[^_]*_', '') AS action,
                request_path AS label,
                (COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('status', status_code)) AS data,
                'request' AS kind
           FROM server_request_logs
          WHERE NOT (event_action = ANY($3::text[]))
            AND request_path NOT LIKE '/api/admin%'
       ) AS combined
       WHERE ($2::timestamptz IS NULL OR created_at >= $2::timestamptz)
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit, sinceValid ? since : null, REQUEST_LOG_EXCLUDED_ACTIONS]
    )
    res.json({ events: rows })
  } catch (err) {
    console.error('GET /admin/traffic/events error:', err.message)
    res.status(500).json({ error: 'Failed to load events' })
  }
})

router.get('/traffic/summary', requireSuperadmin, async (_req, res) => {
  try {
    const [totalEvents, activeSessions, recentSearches] = await Promise.all([
      pool.query('SELECT count(*)::int FROM site_events'),
      pool.query(`SELECT count(*)::int FROM sessions WHERE last_seen >= now() - interval '24 hours'`),
      pool.query(`SELECT event_label as query, count(*)::int as count
                  FROM site_events
                  WHERE event_category = 'search'
                  GROUP BY event_label
                  ORDER BY count DESC LIMIT 10`),
    ])

    res.json({
      totalEvents: totalEvents.rows[0].count,
      activeSessions24h: activeSessions.rows[0].count,
      topSearches: recentSearches.rows,
    })
  } catch (err) {
    console.error('GET /admin/traffic/summary error:', err.message)
    res.status(500).json({ error: 'Failed to load summary' })
  }
})

// Errors from the routes above: log the detail, answer generically.
router.use((error, _req, res, _next) => {
  console.error('admin route error:', error.message)
  res.status(500).json({ error: 'İstek tamamlanamadı' })
})

export default router
