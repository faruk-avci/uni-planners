// Loads Bilkent's term offerings into the catalog tables (university =
// 'bilkent'), replacing only Bilkent's rows in one transaction.
//
//   node scripts/import-bilkent-catalog.mjs
//
// Input, all shipped with the site in frontend/public/data/bilkent:
//   sections.json  section times saved from STARS (import-stars-offerings.mjs)
//   courses.json   catalog names, prerequisites and descriptions
//   bilkent-dNN    curricula: which programs require or allow each course
// Restart the API afterwards so its in-memory catalog reloads.
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// On the server the API reads its settings from this file via systemd.
if (!process.env.DB_HOST && existsSync('/etc/uniplanner/backend.env')) process.loadEnvFile('/etc/uniplanner/backend.env')

const { ensureSchema, pool } = await import('../config/db.js')
const { BILKENT_PROGRAM_BY_ID } = await import('../config/bilkentPrograms.js')

const UNIVERSITY = 'bilkent'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.resolve(process.env.STATIC_CURRICULUM_DIR || path.join(__dirname, '..', '..', 'frontend', 'public', 'data'), UNIVERSITY)
const DAYS = { Mon: 'Pazartesi', Tue: 'Salı', Wed: 'Çarşamba', Thu: 'Perşembe', Fri: 'Cuma', Sat: 'Cumartesi', Sun: 'Pazar' }

const readJson = name => JSON.parse(readFileSync(path.join(DATA, name), 'utf8'))
const normalize = code => String(code || '').replace(/\s+/g, '').toUpperCase()
const clip = (value, max) => (value == null ? null : String(value).slice(0, max))

const offerings = readJson('sections.json')
const catalog = new Map(readJson('courses.json').map(course => [normalize(course.code), course]))
const departmentOf = new Map((offerings.subjects || []).map(item => [item.subject, item.department]))

// Programs that list a course as required (in the term plan) or allow it as
// an elective (in one of their pools). Major codes are department prefixes.
const required = new Map()
const elective = new Map()
const add = (map, code, program) => {
  const key = normalize(code)
  if (!key) return
  if (!map.has(key)) map.set(key, new Set())
  map.get(key).add(program)
}
for (const entry of readJson('index.json').filter(item => item.starsExport)) {
  const program = BILKENT_PROGRAM_BY_ID.get(entry.id)
  if (!program) continue
  const data = readJson(`${entry.id}.json`)
  for (const code of program.codes) {
    for (const terms of Object.values(data.semesters || {})) {
      for (const items of Object.values(terms)) for (const item of items) if (item.code) add(required, item.code, code)
    }
    for (const pool of Object.values(data.electivePoolCourses || {})) {
      for (const course of pool.courses || []) add(elective, course.code, code)
    }
  }
}

const courses = []
const sections = []
for (const [code, list] of Object.entries(offerings.sections || {})) {
  const norm = normalize(code)
  const match = code.match(/^([A-Z]+)\s*(\S+)$/)
  if (!match || !list.length) continue
  const info = catalog.get(norm)
  const credits = list.find(item => item.bilkentCredits != null)?.bilkentCredits ?? info?.credits ?? 0
  courses.push({
    course_code: norm,
    subject: match[1],
    course_no: match[2],
    title: clip(list[0].name || info?.name || code, 255),
    faculty: clip(departmentOf.get(match[1]) || info?.dept || '', 255),
    credits: Math.min(Number(credits) || 0, 99.9),
    description: info?.description || null,
    corequisites: clip(info?.coreq || '', 255),
    prerequisites: clip(info?.prereq || '', 255),
    required_programs: [...(required.get(norm) || [])],
    // A course a program requires is not also listed as its elective.
    elective_programs: [...(elective.get(norm) || [])].filter(program => !required.get(norm)?.has(program)),
  })
  for (const item of list) {
    const meetings = (item.meetings || []).filter(meeting => DAYS[meeting.day])
    sections.push({
      course_code: norm,
      section_no: clip(item.section, 10),
      instructor: clip((item.instructors || []).join(', ') || item.instructor || '', 255),
      schedule: meetings.map(meeting => `${DAYS[meeting.day]} | ${meeting.start} - ${meeting.end}`).join(' + '),
      room: [...new Set(meetings.map(meeting => meeting.room).filter(Boolean))].join('; ') || null,
    })
  }
}

if (courses.length === 0) {
  console.error('sections.json has no courses; refusing to empty the Bilkent catalog.')
  process.exit(1)
}

try {
  await ensureSchema()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM catalog_sections WHERE university = $1', [UNIVERSITY])
    await client.query('DELETE FROM catalog_courses WHERE university = $1', [UNIVERSITY])
    for (const c of courses) {
      await client.query(
        `INSERT INTO catalog_courses (university, course_code, subject, course_no, title, faculty, credits,
           description, corequisites, prerequisites, required_programs, elective_programs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [UNIVERSITY, c.course_code, c.subject, c.course_no, c.title, c.faculty, c.credits,
          c.description, c.corequisites, c.prerequisites, c.required_programs, c.elective_programs]
      )
    }
    for (const s of sections) {
      await client.query(
        `INSERT INTO catalog_sections (university, course_code, section_no, instructor, schedule, room)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (university, course_code, section_no) DO NOTHING`,
        [UNIVERSITY, s.course_code, s.section_no, s.instructor, s.schedule, s.room]
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
  const withTimes = sections.filter(s => s.schedule).length
  console.log(`Bilkent ${offerings.term || offerings.semester}: ${courses.length} courses, ${sections.length} sections (${withTimes} with times).`)
  console.log(`Courses some program requires: ${courses.filter(c => c.required_programs.length).length}; allowed as an elective: ${courses.filter(c => c.elective_programs.length).length}.`)
  console.log('Restart the API so the in-memory catalog reloads.')
} finally {
  await pool.end()
}
