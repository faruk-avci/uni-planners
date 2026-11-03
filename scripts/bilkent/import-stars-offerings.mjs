// Import Bilkent section times that the user saved from STARS with the export
// extension (offerings/<SEMESTER>/<SUBJECT>.json) into the local preview data
// (frontend/public/data/bilkent/sections.json). Makes no network requests.
//
//   node scripts/bilkent/import-stars-offerings.mjs
//   node scripts/bilkent/import-stars-offerings.mjs "%USERPROFILE%/Downloads/uniplanners-bilkent"
//
// With several terms saved, the latest SEMESTER code (e.g. 20261) is used.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { pathToFileURL } from 'url'

const ROOT = new URL('../../', import.meta.url)
const INPUT = process.argv[2] ? pathToFileURL(resolve(process.argv[2]) + '/') : new URL('bilkent-data/', ROOT)
const OFFERINGS = new URL('offerings/', INPUT)
const OUT = new URL('frontend/public/data/bilkent/sections.json', ROOT)

if (!existsSync(OFFERINGS)) {
  console.log('no offerings folder, nothing to import')
  process.exit(0)
}
const semesters = readdirSync(OFFERINGS).filter(name => /^\d{5}$/.test(name)).sort()
if (!semesters.length) {
  console.log('no saved terms under offerings/')
  process.exit(0)
}
const semester = semesters[semesters.length - 1]
const dir = new URL(`${semester}/`, OFFERINGS)

const sections = {}
const subjects = []
let term = ''
let total = 0
for (const file of readdirSync(dir).filter(name => /^[A-Z]+\.json$/.test(name)).sort()) {
  const page = JSON.parse(readFileSync(new URL(file, dir), 'utf8'))
  if (page.kind !== 'offerings') continue
  term ||= page.term
  subjects.push({ subject: page.subject, department: page.department, sections: page.sections.length, savedAt: page.savedAt })
  for (const item of page.sections) {
    (sections[item.code] ||= []).push({
      section: item.section,
      name: item.name,
      instructor: item.instructors.join(', '),
      instructors: item.instructors,
      bilkentCredits: item.bilkentCredits,
      ects: item.ects,
      meetings: item.meetings.filter(meeting => meeting.day).map(({ day, start, end, room, kind }) => ({ day, start, end, room, kind })),
      quota: item.quota?.total?.value ?? null,
      enrolled: item.enrolled?.total ?? null,
    })
    total++
  }
  if (page.warnings?.length) console.log(`  ${file}: ${page.warnings.length} rows could not be read`)
}

writeFileSync(OUT, JSON.stringify({ semester, term, source: 'STARS offerings saved with the export extension', subjects, sections }))
console.log(`${semester} (${term}): ${subjects.length} subject codes, ${Object.keys(sections).length} courses, ${total} sections -> sections.json`)
if (semesters.length > 1) console.log(`  other saved terms ignored: ${semesters.slice(0, -1).join(', ')}`)
