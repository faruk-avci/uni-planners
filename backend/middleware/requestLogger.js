import { randomUUID } from 'crypto'
import { enqueueRequestLog } from '../services/activityLogger.js'

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max)
const array = value => Array.isArray(value) ? value : []

function actionFor(method, path) {
  const key = `${method} ${path}`
  const routes = [
    [/^GET \/api\/health$/, 'health_check'],
    [/^POST \/api\/courses\/search$/, 'course_search'],
    [/^GET \/api\/courses\/[^/]+$/, 'course_view'],
    [/^POST \/api\/assessments$/, 'assessments_load'],
    [/^GET \/api\/majors$/, 'major_options_load'],
    [/^GET \/api\/curriculums$/, 'curriculum_list'],
    [/^GET \/api\/curriculums\/[^/]+$/, 'curriculum_view'],
    [/^GET \/api\/site-settings$/, 'site_settings_load'],
    [/^POST \/api\/schedule\/generate$/, 'schedule_generate'],
    [/^POST \/api\/schedule\/fitting$/, 'schedule_fitting'],
    [/^POST \/api\/schedule\/export-calendar$/, 'schedule_export_calendar'],
    [/^GET \/api\/basket$/, 'basket_load'],
    [/^PUT \/api\/basket$/, 'basket_replace'],
    [/^DELETE \/api\/basket$/, 'basket_clear'],
    [/^GET \/api\/basket\/saved$/, 'saved_basket_list'],
    [/^POST \/api\/basket\/saved$/, 'saved_basket_create'],
    [/^DELETE \/api\/basket\/saved\/[^/]+$/, 'saved_basket_delete'],
    [/^GET \/api\/saved-baskets$/, 'saved_basket_list'],
    [/^POST \/api\/saved-baskets$/, 'saved_basket_create'],
    [/^DELETE \/api\/saved-baskets\/[^/]+$/, 'saved_basket_delete'],
    [/^GET \/api\/preferences$/, 'preferences_load'],
    [/^PUT \/api\/preferences\/major$/, 'major_set'],
    [/^PUT \/api\/preferences\/grade$/, 'grade_set'],
    [/^POST \/api\/analytics\/course-add$/, 'course_add_track'],
    [/^POST \/api\/analytics\/site-event$/, 'site_event_track'],
    [/^GET \/api\/dino\/leaderboard$/, 'dino_leaderboard_load'],
    [/^POST \/api\/dino\/score$/, 'dino_score_submit'],
    [/^POST \/api\/shared-schedules$/, 'schedule_share_create'],
    [/^GET \/api\/shared-schedules\/[^/]+$/, 'schedule_share_view'],
    [/^GET \/api\/stats$/, 'site_stats_load'],
    [/^POST \/api\/admin\/login$/, 'admin_login'],
    [/^POST \/api\/admin\/logout$/, 'admin_logout'],
    [/^GET \/api\/admin\/curriculums$/, 'admin_curriculum_list'],
    [/^GET \/api\/admin\/site-settings$/, 'admin_site_settings_load'],
    [/^PUT \/api\/admin\/site-settings$/, 'admin_site_settings_save'],
    [/^GET \/api\/admin\/curriculums\/[^/]+$/, 'admin_curriculum_view'],
    [/^POST \/api\/admin\/curriculums\/inspect-file$/, 'admin_curriculum_inspect'],
    [/^PUT \/api\/admin\/curriculums\/[^/]+$/, 'admin_curriculum_save'],
    [/^GET \/api\/admin\/elective-pools$/, 'admin_elective_pool_list'],
    [/^POST \/api\/admin\/elective-pools\/inspect-file$/, 'admin_elective_inspect'],
    [/^PUT \/api\/admin\/elective-pools\/[^/]+$/, 'admin_elective_pool_save'],
    [/^GET \/api\/admin\/analytics\//, 'admin_analytics_view'],
    [/^POST \/api\/degree-audit$/, 'degree_audit_parse'],
  ]
  return routes.find(([pattern]) => pattern.test(key))?.[1] || 'api_request'
}

function metadataFor(req, path) {
  const body = req.body || {}
  const metadata = {}

  if (path === '/api/courses/search') {
    metadata.query = clean(body.query, 100)
    metadata.major = clean(body.major, 32)
    metadata.courseType = clean(body.type || 'all', 24)
  } else if (/^\/api\/courses\/[^/]+$/.test(path)) {
    metadata.courseCode = clean(req.params?.code || path.split('/').at(-1), 20)
  } else if (path === '/api/assessments') {
    metadata.courseCodes = array(body.codes).map(value => clean(value, 20)).slice(0, 100)
  } else if (path === '/api/schedule/generate') {
    metadata.courses = array(body.courses).map(item => ({
      code: clean(item?.code, 20),
      sections: array(item?.sections).map(value => clean(value, 40)).slice(0, 50),
    })).slice(0, 100)
    metadata.freeDays = array(body.freeDays).map(value => clean(value, 20)).slice(0, 7)
    metadata.preference = clean(body.preference || 'balanced', 20)
    metadata.ignoreCoreqs = Boolean(body.ignoreCoreqs)
  } else if (path === '/api/schedule/fitting') {
    metadata.major = clean(body.major, 32)
    metadata.occupiedSlotCount = array(body.occupied).length
    metadata.excludedCourses = array(body.exclude).map(value => clean(value, 20)).slice(0, 100)
  } else if (path === '/api/schedule/export-calendar') {
    metadata.language = body.language === 'en' ? 'en' : 'tr'
    metadata.courseCount = array(body.schedule?.lessons).length
  } else if (path === '/api/basket' && req.method === 'PUT') {
    metadata.items = array(body.items).map(item => ({
      code: clean(item?.code, 20),
      sections: array(item?.sections).map(value => clean(value, 40)).slice(0, 50),
      source: clean(item?.source, 32),
    })).slice(0, 100)
  } else if (path === '/api/preferences/major') {
    metadata.major = clean(body.major, 32)
    metadata.source = clean(body.source, 24)
  } else if (path === '/api/preferences/grade') {
    metadata.grade = clean(body.grade, 16)
  } else if (path === '/api/analytics/course-add') {
    metadata.courseCode = clean(body.code, 20)
    metadata.source = clean(body.source, 32)
    metadata.selectionMode = clean(body.selectionMode, 16)
  } else if (path === '/api/analytics/site-event') {
    metadata.category = clean(body.category, 32)
    metadata.action = clean(body.action, 64)
    metadata.label = clean(body.label, 100)
  } else if (path === '/api/dino/score') {
    metadata.score = Number(body.score) || 0
    metadata.hasEmail = Boolean(body.email)
  } else if (path === '/api/shared-schedules' && req.method === 'POST') {
    metadata.major = clean(body.major, 32)
    metadata.courseCount = array(body.schedule?.lessons).length
    metadata.totalCredits = Number(body.schedule?.totalCredits) || 0
  } else if (/^\/api\/shared-schedules\/[^/]+$/.test(path)) {
    metadata.shareId = clean(path.split('/').at(-1), 12)
  } else if (path === '/api/basket/saved' && req.method === 'POST') {
    metadata.name = clean(body.name, 60)
    metadata.itemCount = array(body.items).length
  }

  const query = Object.fromEntries(Object.entries(req.query || {}).map(([key, value]) => [clean(key, 50), clean(value, 200)]))
  if (Object.keys(query).length > 0) metadata.queryParams = query
  return metadata
}

export function requestLogger(req, res, next) {
  const startedAt = performance.now()
  const requestId = randomUUID()
  const path = req.originalUrl.split('?')[0]
  let logged = false
  res.setHeader('X-Request-Id', requestId)

  const commit = aborted => {
    if (logged) return
    logged = true
    const baseMetadata = metadataFor(req, path)
    const metadata = { sessionCreated: Boolean(req.sessionCreated), ...baseMetadata, ...(res.locals.activity || {}), ...(aborted ? { aborted: true } : {}) }
    enqueueRequestLog({
      request_id: requestId,
      session_id: req.sessionId || '',
      event_action: actionFor(req.method, path),
      method: req.method,
      request_path: path.slice(0, 500),
      status_code: aborted ? 499 : res.statusCode,
      duration_ms: Number((performance.now() - startedAt).toFixed(3)),
      request_size: Number.parseInt(req.get('content-length'), 10) || null,
      response_size: Number.parseInt(res.getHeader('content-length'), 10) || null,
      ip_address: clean(req.ip, 100) || null,
      user_agent: clean(req.get('user-agent'), 500) || null,
      referrer: clean(req.get('referer'), 500) || null,
      metadata,
      created_at: new Date().toISOString(),
    })
  }

  res.once('finish', () => commit(false))
  res.once('close', () => commit(!res.writableEnded))
  next()
}
