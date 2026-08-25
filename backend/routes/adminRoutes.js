import express from 'express'
import { pool } from '../config/db.js'
import { FACULTIES, PROGRAMS, PROGRAM_BY_ID } from '../config/programs.js'
import { adminLogin, adminLogout, requireAdmin } from '../middleware/adminAuth.js'
import { electiveKeyForLabel, parseCurriculumWorkbook, parseElectiveWorkbook } from '../services/curriculumWorkbook.js'
import {
  listCurriculumData,
  listElectivePools,
  readCurriculumData,
  readSiteSettings,
  writeCurriculumData,
  writeElectivePool,
  writeSiteSettings,
} from '../services/curriculumStore.js'

const router = express.Router()
const excelBody = express.raw({ type: 'application/octet-stream', limit: '10mb' })

router.post('/login', adminLogin)
router.use(requireAdmin)
router.get('/session', (_req, res) => res.json({ authenticated: true }))
router.post('/logout', adminLogout)

router.get('/programs', (_req, res) => res.json({ faculties: FACULTIES, programs: PROGRAMS }))
router.get('/site-settings', (_req, res) => res.json(readSiteSettings()))
router.put('/site-settings', (req, res) => {
  try {
    const saved = writeSiteSettings(req.body)
    res.locals.activity = {
      ...res.locals.activity,
      mainFont: saved.mainFont,
      catalogTerm: saved.catalogTerm,
      hasSurveyLink: Boolean(saved.surveyUrl),
    }
    return res.json(saved)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
})

router.get('/curriculums', (_req, res) => {
  const curricula = listCurriculumData().map(data => ({
    id: data.id,
    title_tr: data.title_tr,
    title_en: data.title_en,
    faculty: data.faculty,
    programCodes: data.programCodes || PROGRAM_BY_ID.get(data.id)?.codes || [],
    sourceFile: data.sourceFile || null,
    updatedAt: data.updatedAt || null,
    courseCount: Object.values(data.semesters || {}).reduce(
      (sum, terms) => sum + (terms.fall?.filter(item => item.code).length || 0) + (terms.spring?.filter(item => item.code).length || 0), 0
    ),
    electiveRequirementCount: Object.keys(data.electivePoolRefs || data.electives || {}).length,
  }))
  res.json(curricula.sort((a, b) => a.title_tr.localeCompare(b.title_tr, 'tr')))
})

router.get('/curriculums/:id', (req, res) => {
  try {
    const data = readCurriculumData(req.params.id)
    if (!data) return res.status(404).json({ error: 'Curriculum not found' })
    return res.json(data)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
})

router.post('/curriculums/inspect-file', excelBody, (req, res) => {
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

router.get('/elective-pools', (_req, res) => res.json(listElectivePools()))

router.post('/elective-pools/inspect-file', excelBody, (req, res) => {
  try {
    const courses = parseElectiveWorkbook(req.body)
    res.locals.activity = {
      ...res.locals.activity,
      fileName: String(req.get('x-file-name') || '').slice(0, 180),
      courseCount: courses.length,
    }
    res.json({ courseCount: courses.length, courses })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

router.put('/elective-pools/:key', (req, res) => {
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
    res.locals.activity = { ...res.locals.activity, electivePool: saved.key, courseCount: courses.length }
    return res.json({ key: saved.key, label: saved.label, courseCount: saved.courses.length, updatedAt: saved.updatedAt })
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
})

router.put('/curriculums/:id', (req, res) => {
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
    res.locals.activity = {
      ...res.locals.activity,
      curriculumId: program.id,
      courseCount: draft.courseCount,
      electiveRequirementCount: Object.keys(mappings).length,
    }
    return res.json(data)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
})

router.get('/suggest-elective-key', (req, res) => {
  const label = String(req.query.label || '')
  res.json({ key: electiveKeyForLabel(label) })
})

// --- Analytics ---

router.get('/analytics/majors', async (_req, res) => {
  try {
    const [current, firstChoice, selections] = await Promise.all([
      pool.query(
        `SELECT major_code AS major, count(*)::int AS visitors
           FROM sessions
          WHERE major_code IS NOT NULL
          GROUP BY major_code
          ORDER BY visitors DESC, major_code`
      ),
      pool.query(
        `SELECT first_major_code AS major, count(*)::int AS visitors
           FROM sessions
          WHERE first_major_code IS NOT NULL
          GROUP BY first_major_code
          ORDER BY visitors DESC, first_major_code`
      ),
      pool.query(
        `SELECT major_code AS major, count(*)::int AS selections,
                count(DISTINCT session_id)::int AS visitors
           FROM major_selection_events
          GROUP BY major_code
          ORDER BY selections DESC, major_code`
      ),
    ])
    res.json({ current: current.rows, firstChoice: firstChoice.rows, selections: selections.rows })
  } catch (err) {
    console.error('GET /admin/analytics/majors error:', err.message)
    res.status(500).json({ error: 'Major analytics could not be loaded' })
  }
})

router.get('/analytics/grades', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT grade_level AS grade, count(*)::int AS visitors
         FROM sessions
        WHERE grade_level IS NOT NULL AND grade_level <> ''
        GROUP BY grade_level
        ORDER BY CASE grade_level
                   WHEN 'prep' THEN 0 WHEN '1' THEN 1 WHEN '2' THEN 2
                   WHEN '3' THEN 3 WHEN '4' THEN 4
                   ELSE 5
                 END`
    )
    res.json({ current: rows })
  } catch (err) {
    console.error('GET /admin/analytics/grades error:', err.message)
    res.status(500).json({ error: 'Grade analytics could not be loaded' })
  }
})

router.get('/analytics/course-add-sources', async (req, res) => {
  const parsedDays = Number.parseInt(req.query.days, 10)
  const days = Number.isFinite(parsedDays) ? Math.min(Math.max(parsedDays, 1), 365) : 30
  try {
    const { rows } = await pool.query(
      `SELECT source, count(*)::int AS additions, count(DISTINCT session_id)::int AS visitors
         FROM course_add_events
        WHERE added_at >= now() - make_interval(days => $1)
        GROUP BY source
        ORDER BY additions DESC, source`,
      [days]
    )
    res.json({ days, total: rows.reduce((sum, row) => sum + row.additions, 0), sources: rows })
  } catch (err) {
    console.error('GET /admin/analytics/course-add-sources error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

router.get('/analytics/requests', async (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10)
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 100
  const action = String(req.query.action || '').trim().slice(0, 80)
  const status = Number.parseInt(req.query.status, 10)
  const sessionId = String(req.query.session || '').trim()
  const conditions = []
  const values = []
  if (action) { values.push(action); conditions.push(`event_action = $${values.length}`) }
  if (Number.isFinite(status)) { values.push(status); conditions.push(`status_code = $${values.length}`) }
  if (sessionId) { values.push(sessionId); conditions.push(`session_id = $${values.length}::uuid`) }
  values.push(limit)

  try {
    const { rows } = await pool.query(
      `SELECT id, request_id, session_id, event_action, method, request_path,
              status_code, duration_ms, request_size, response_size,
              ip_address, user_agent, referrer, metadata, created_at
         FROM server_request_logs
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
        ORDER BY created_at DESC
        LIMIT $${values.length}`,
      values
    )
    res.json({ requests: rows })
  } catch (err) {
    console.error('GET /admin/analytics/requests error:', err.message)
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
  'course_batch_load',
  'assessments_load',
  'course_add_track',
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

router.get('/analytics/events', async (req, res) => {
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
       ) AS combined
       WHERE ($2::timestamptz IS NULL OR created_at >= $2::timestamptz)
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit, sinceValid ? since : null, REQUEST_LOG_EXCLUDED_ACTIONS]
    )
    res.json({ events: rows })
  } catch (err) {
    console.error('GET /admin/analytics/events error:', err.message)
    res.status(500).json({ error: 'Failed to load events' })
  }
})

router.get('/analytics/summary', async (req, res) => {
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
    console.error('GET /admin/analytics/summary error:', err.message)
    res.status(500).json({ error: 'Failed to load summary' })
  }
})

export default router
