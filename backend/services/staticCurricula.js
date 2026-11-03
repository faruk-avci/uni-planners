// Read-only view of curricula that ship with the frontend
// (frontend/public/data/<university>), for universities whose curricula are
// imported by script instead of uploaded in the panel. The panel shows what is
// listed on the site and how complete each program is.
import { existsSync, readFileSync, statSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STATIC_ROOT = path.resolve(process.env.STATIC_CURRICULUM_DIR || path.join(__dirname, '..', '..', 'frontend', 'public', 'data'))
const SAFE = /^[a-z0-9][a-z0-9_-]{0,79}$/

const readJson = file => JSON.parse(readFileSync(file, 'utf8'))

// Read once per process; the files only change with a deployment.
const cache = new Map()
function cachedJson(file) {
  if (!cache.has(file)) cache.set(file, existsSync(file) ? readJson(file) : null)
  return cache.get(file)
}

const normalizeCode = code => String(code || '').replace(/\s+/g, '').toUpperCase()

// The university's course list (names, credits, prerequisites) by
// normalised code, e.g. "CS101".
export function staticCourseIndex(university) {
  if (!SAFE.test(university)) return new Map()
  const key = `courses:${university}`
  if (!cache.has(key)) {
    const list = cachedJson(path.join(STATIC_ROOT, university, 'courses.json')) || []
    cache.set(key, new Map(list.map(course => [normalizeCode(course.code), course])))
  }
  return cache.get(key)
}

// Ids of the programs listed on the site (exported from STARS).
export function listedStaticIds(university) {
  if (!SAFE.test(university)) return new Set()
  const index = cachedJson(path.join(STATIC_ROOT, university, 'index.json')) || []
  return new Set(index.filter(entry => entry.starsExport).map(entry => entry.id))
}

// One curriculum in the shape the site's curriculum page expects: `credits`
// are the university's own credits (the page labels them "kredi"), every
// elective type has an entry in `electives` (empty until its pool is saved),
// and labels come in both languages.
export function readStaticCurriculum(university, id, program = null) {
  if (!SAFE.test(university) || !SAFE.test(id)) return null
  const data = cachedJson(path.join(STATIC_ROOT, university, `${id}.json`))
  if (!data) return null
  const courses = staticCourseIndex(university)
  const item = entry => {
    const course = courses.get(normalizeCode(entry.code))
    return {
      code: entry.code || '',
      title_tr: entry.title_tr || course?.name_tr || entry.title_en || course?.name || '',
      title_en: entry.title_en || course?.name || entry.title_tr || '',
      credits: entry.bilkentCredits ?? course?.credits ?? 0,
      ects: entry.credits || course?.ects || null,
      prereq: entry.prereq || course?.prereq || '',
      coreq: entry.coreq || course?.coreq || '',
      ...(entry.electiveType ? { electiveType: entry.electiveType } : {}),
    }
  }
  const poolCourse = entry => {
    const course = courses.get(normalizeCode(entry.code))
    return {
      code: entry.code,
      title_tr: entry.name_tr || course?.name_tr || course?.name || entry.code,
      title_en: course?.name || entry.name_tr || entry.code,
      credits: entry.bilkentCredits ?? course?.credits ?? 0,
      ects: course?.ects ?? null,
      prereq: course?.prereq || '',
      coreq: course?.coreq || '',
    }
  }
  const semesters = Object.fromEntries(Object.entries(data.semesters || {}).map(([year, terms]) => [year, {
    fall: (terms.fall || []).map(item),
    spring: (terms.spring || []).map(item),
  }]))
  const electives = {}
  const electiveLabels = {}
  for (const [type, title] of Object.entries(data.electiveTypes || {})) {
    electives[type] = (data.electivePoolCourses?.[type]?.courses || []).map(poolCourse)
    electiveLabels[type] = { tr: data.electiveTypesTr?.[type] || title, en: title }
  }
  return {
    id,
    title_tr: program?.tr || data.title_tr || data.title,
    title_en: program?.en || data.title,
    faculty: program?.faculty || '',
    programCodes: program?.codes || [],
    creditUnit: university,
    sourceUrl: data.starsUrl || data.sourceUrl || '',
    semesters,
    electives,
    electiveLabels,
  }
}

export function listStaticCurricula(university) {
  if (!SAFE.test(university)) return []
  const dir = path.join(STATIC_ROOT, university)
  const indexFile = path.join(dir, 'index.json')
  if (!existsSync(indexFile)) return []
  return readJson(indexFile).map(entry => {
    if (!SAFE.test(entry.id)) return null
    const file = path.join(dir, `${entry.id}.json`)
    if (!existsSync(file)) return null
    const data = readJson(file)
    const items = Object.values(data.semesters || {}).flatMap(terms => Object.values(terms)).flat()
    const types = Object.keys(data.electiveTypes || {})
    const pools = data.electivePoolCourses || {}
    return {
      id: entry.id,
      title_tr: entry.title_tr || data.title_tr || entry.title,
      title_en: entry.title || data.title_en || data.title,
      programCode: data.programCode || '',
      listed: Boolean(entry.starsExport),
      sourceUrl: data.starsUrl || data.sourceUrl || '',
      courseCount: items.filter(item => item.code).length,
      electiveSlotCount: items.filter(item => !item.code).length,
      electiveTypeCount: types.length,
      poolsSaved: types.filter(type => pools[type]?.courses?.length).length,
      updatedAt: statSync(file).mtime.toISOString(),
    }
  }).filter(Boolean)
}
