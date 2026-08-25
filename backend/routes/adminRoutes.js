import express from 'express'
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

export default router
