// Import Bilkent curricula that the user saved by hand from STARS into the
// local preview data in frontend/public/data/bilkent. Makes no network requests.
//
// Input folder (default bilkent-data/, or the extension's download folder):
//   curriculum/<PROGRAM_CODE>.json   saved by the STARS export extension (preferred)
//   curriculum/<PROGRAM_CODE>.html   the page saved with Ctrl+S
//   curriculum/<PROGRAM_CODE>.txt    the same page copied as text
//   pools/<PROGRAM_CODE>/<POOL>.json elective pools saved by the extension
//
// The STARS copy is the source of truth for the term structure, credits and
// Turkish names; English names, ECTS and prerequisites come from the catalog
// data that is already there. Safe to run again.
//
//   node scripts/bilkent/import-stars-curriculum.mjs
//   node scripts/bilkent/import-stars-curriculum.mjs "%USERPROFILE%/Downloads/uniplanners-bilkent"
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { pathToFileURL } from 'url'

const ROOT = new URL('../../', import.meta.url)
const INPUT = process.argv[2] ? pathToFileURL(resolve(process.argv[2]) + '/') : new URL('bilkent-data/', ROOT)
const IN_DIR = new URL('curriculum/', INPUT)
const POOL_DIR = new URL('pools/', INPUT)
const DATA_DIR = new URL('frontend/public/data/bilkent/', ROOT)

const YEARS = { birinci: 1, ikinci: 2, 'üçüncü': 3, 'dördüncü': 4, 'beşinci': 5, 'altıncı': 6 }
const TERMS = { 'güz': 'fall', bahar: 'spring', yaz: 'summer' }
const COURSE_ROW = /^([A-Z]{2,5} \d{3}[A-Z]?)\s+(.+?)\s+(\d+(?:[.,]\d+)?)$/
const ELECTIVE_ROW = /^(.+?)\s+(\d+(?:[.,]\d+)?)$/
const SLOT_COUNT = /\s*\((\d+)\)\s*$/

const readJson = name => JSON.parse(readFileSync(new URL(name, DATA_DIR), 'utf8'))
const writeJson = (name, value) => writeFileSync(new URL(name, DATA_DIR), JSON.stringify(value))
const num = value => Number(String(value).replace(',', '.'))
const decode = html => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
const slug = text => text.toLocaleLowerCase('tr-TR')
  .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Shared by both parsers: one row of a term.
function addRow(result, year, term, { code, name, credit, pool = '' }) {
  const list = ((result.semesters[year] ||= { fall: [], spring: [] })[term] ||= [])
  if (code) {
    list.push({ code, title_tr: name, bilkentCredits: num(credit) })
    return
  }
  // "Seçmeli Ders (2)  6" -> two 3-credit slots
  const count = Number((name.match(SLOT_COUNT) || [])[1] || 1)
  const title = name.replace(SLOT_COUNT, '').trim()
  for (let i = 0; i < count; i++) list.push({ title_tr: title, bilkentCredits: num(credit) / count, pool })
}

// Saved STARS page: the department title, then one table of year, term and
// course rows. Elective rows link to their pool (secmeli_kod=MATH_EL...).
function parseHtml(html) {
  const title = decode((html.match(/class="c_department"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || '')
  const result = { title, semesters: {}, pools: {}, warnings: [] }
  let year = null
  let term = null
  for (const [, row] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const firstWord = decode(row).toLocaleLowerCase('tr-TR').split(' ')[0]
    if (/class="c_year"/.test(row)) { year = YEARS[firstWord] || null; term = null; continue }
    if (/class="c_term_header"/.test(row)) { term = TERMS[firstWord] || null; continue }
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(match => match[1])
    if (cells.length < 3) continue
    if (!year || !term) { result.warnings.push(`skipped (no year/term yet): ${decode(row)}`); continue }
    const href = decode((cells[1].match(/href="([^"]+)"/) || [])[1] || '')
    const pool = (href.match(/secmeli_kod=([^&]+)/) || [])[1] || ''
    if (pool) result.pools[pool] = href
    addRow(result, year, term, { code: decode(cells[0]), name: decode(cells[1]), credit: decode(cells[2]), pool })
  }
  return result
}

// The same page copied as text.
function parseText(text) {
  const lines = text.split(/\r?\n/).map(line => line.replace(/ /g, ' ').trim()).filter(Boolean)
  const result = { title: lines[0], semesters: {}, pools: {}, warnings: [] }
  let year = null
  let term = null
  for (const line of lines.slice(1)) {
    const words = line.toLocaleLowerCase('tr-TR').split(' ')
    if (words.length === 2 && words[1] === 'yıl' && YEARS[words[0]]) { year = YEARS[words[0]]; term = null; continue }
    if (words.length === 2 && words[1] === 'dönemi' && TERMS[words[0]]) { term = TERMS[words[0]]; continue }
    if (/^ders kod/i.test(line)) continue
    if (!year || !term) { result.warnings.push(`skipped (no year/term yet): ${line}`); continue }
    const course = line.match(COURSE_ROW)
    const elective = !course && line.match(ELECTIVE_ROW)
    if (course) addRow(result, year, term, { code: course[1], name: course[2], credit: course[3] })
    else if (elective) addRow(result, year, term, { name: elective[1], credit: elective[2] })
    else result.warnings.push(`unrecognised row: ${line}`)
  }
  return result
}

// JSON written by the STARS export extension.
function parseExport(json) {
  const result = { title: json.title || '', semesters: {}, pools: {}, warnings: [...(json.warnings || [])] }
  if (json.language && json.language !== 'tur') result.warnings.push(`page language is "${json.language}", names were stored as Turkish`)
  for (const [year, terms] of Object.entries(json.semesters || {})) {
    for (const [term, items] of Object.entries(terms)) {
      for (const item of items) {
        if (item.elective) addRow(result, year, term, { name: item.count > 1 ? `${item.name} (${item.count})` : item.name, credit: item.credits ?? 0, pool: item.pool || '' })
        else addRow(result, year, term, { code: item.code, name: item.name, credit: item.credits ?? 0 })
      }
    }
  }
  for (const [code, pool] of Object.entries(json.pools || {})) result.pools[code] = pool.url
  return result
}

// Elective pools saved by the extension, keyed by pool code.
function readPools(programCode) {
  const dir = new URL(`${programCode}/`, POOL_DIR)
  if (!existsSync(dir)) return {}
  const pools = {}
  for (const name of readdirSync(dir).filter(file => /^[^.]+\.json$/i.test(file))) {
    const pool = JSON.parse(readFileSync(new URL(name, dir), 'utf8'))
    pools[pool.pool || name.replace(/\.json$/i, '')] = { title_tr: pool.title, courses: (pool.courses || []).map(course => ({ code: course.code, name_tr: course.name, bilkentCredits: course.credits })) }
  }
  return pools
}

// Consecutive elective slots of the same kind form a group, in page order.
function electiveGroups(items, keyOf) {
  const groups = []
  for (const item of items.filter(entry => !entry.code)) {
    const key = keyOf(item)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.items.push(item)
    else groups.push({ key, items: [item] })
  }
  return groups
}

const allItems = curriculum => Object.values(curriculum.semesters).flatMap(terms => Object.values(terms)).flat()
const codesOf = curriculum => new Set(allItems(curriculum).map(item => item.code).filter(Boolean))

if (!existsSync(IN_DIR)) {
  console.log('no bilkent-data/curriculum folder, nothing to import')
  process.exit(0)
}

const index = readJson('index.json')
// The site lists only programs exported as JSON by the extension; the flag is
// rebuilt on every run, so removing a file takes its program off the site.
for (const entry of index) delete entry.starsExport
const courses = readJson('courses.json')
const courseByCode = new Map(courses.map(course => [course.code, course]))
const curricula = index.map(entry => ({ entry, data: readJson(`${entry.id}.json`) }))
let coursesChanged = false

// One file per program: extension JSON, then a saved page, then pasted text.
// Pages saved in another language (MATH_BS_2018.eng.json) are skipped.
const names = readdirSync(IN_DIR)
const programCodeOf = name => name.replace(/\.(json|html?|txt)$/i, '')
const RANK = [/^[^.]+\.json$/i, /^[^.]+\.html?$/i, /^[^.]+\.txt$/i]
const files = [...new Set(names.filter(name => RANK.some(pattern => pattern.test(name))).map(programCodeOf))]
  .map(code => RANK.map(pattern => names.find(name => pattern.test(name) && programCodeOf(name) === code)).find(Boolean))

for (const file of files) {
  const programCode = programCodeOf(file)
  const raw = readFileSync(new URL(file, IN_DIR), 'utf8')
  const stars = /\.json$/i.test(file) ? parseExport(JSON.parse(raw)) : /\.txt$/i.test(file) ? parseText(raw) : parseHtml(raw)
  const starsCodes = codesOf(stars)

  // The catalog program that shares the most required courses.
  const best = curricula.map(item => {
    const codes = codesOf(item.data)
    const shared = [...starsCodes].filter(code => codes.has(code)).length
    return { ...item, score: shared / Math.max(starsCodes.size, codes.size, 1) }
  }).sort((a, b) => b.score - a.score)[0]
  if (!best || best.score < 0.5) {
    console.log(`${file}: no matching catalog program (best ${best?.entry.title} ${Math.round((best?.score || 0) * 100)}%), skipped`)
    continue
  }
  const old = best.data
  const oldItems = new Map(allItems(old).filter(item => item.code).map(item => [item.code, item]))
  const differences = []
  const electiveTypes = {}
  const electiveTypesTr = {}
  const semesters = {}

  for (const [year, terms] of Object.entries(stars.semesters)) {
    semesters[year] = {}
    for (const [term, items] of Object.entries(terms)) {
      // Pair elective groups with the catalog's groups when the shapes agree,
      // so the English names carry over.
      const starsGroups = electiveGroups(items, item => item.pool || item.title_tr)
      const oldGroups = electiveGroups(old.semesters[year]?.[term] || [], item => item.electiveType)
      const sameShape = starsGroups.length === oldGroups.length && starsGroups.every((group, i) => group.items.length === oldGroups[i].items.length)
      if (!sameShape && starsGroups.length) differences.push(`${year}/${term}: elective slots differ from the catalog`)
      starsGroups.forEach((group, i) => {
        const pair = sameShape ? oldGroups[i].items[0] : null
        const first = group.items[0]
        const type = first.pool || pair?.electiveType || slug(first.title_tr)
        const title_en = pair?.title_en || old.electiveTypes?.[type] || first.title_tr
        electiveTypes[type] = title_en
        electiveTypesTr[type] = first.title_tr
        group.items.forEach(item => Object.assign(item, { title_en, electiveType: type, credits: pair?.credits ?? 0 }))
      })

      semesters[year][term] = items.map(item => {
        if (!item.code) return { title_en: item.title_en, title_tr: item.title_tr, credits: item.credits, bilkentCredits: item.bilkentCredits, electiveType: item.electiveType }
        const known = oldItems.get(item.code)
        const course = courseByCode.get(item.code)
        if (!known) differences.push(`${year}/${term}: ${item.code} is not in the catalog curriculum`)
        else if (known.bilkentCredits != null && known.bilkentCredits !== item.bilkentCredits) differences.push(`${item.code}: credit ${known.bilkentCredits} in catalog, ${item.bilkentCredits} in STARS`)
        if (course && course.name_tr !== item.title_tr) { course.name_tr = item.title_tr; coursesChanged = true }
        const merged = {
          code: item.code,
          title_en: known?.title_en || course?.name || item.title_tr,
          title_tr: item.title_tr,
          credits: known?.credits ?? course?.ects ?? 0,
          bilkentCredits: item.bilkentCredits,
          prereq: known?.prereq || course?.prereq,
          coreq: known?.coreq || course?.coreq,
        }
        return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined && value !== ''))
      })
    }
  }
  for (const code of oldItems.keys()) if (!starsCodes.has(code)) differences.push(`${code} is in the catalog curriculum but not in STARS`)

  const poolCourses = readPools(programCode)
  for (const pool of Object.values(poolCourses)) {
    for (const entry of pool.courses) {
      const course = courseByCode.get(entry.code)
      if (course && entry.name_tr && course.name_tr !== entry.name_tr) { course.name_tr = entry.name_tr; coursesChanged = true }
    }
  }
  const missingPools = Object.keys(stars.pools).filter(code => !poolCourses[code])

  const title_tr = stars.title.replace(/\s+Bölümü$/, '')
  writeJson(`${old.id}.json`, {
    ...old,
    title_tr,
    programCode,
    starsUrl: `https://stars.bilkent.edu.tr/webserv/curriculum/?dil=tur&options=&bolum_kod=${programCode.split('_')[0]}&program_kod=${programCode}&track_kod=&mod=tntm`,
    electiveTypes,
    electiveTypesTr,
    electivePools: stars.pools,
    electivePoolCourses: poolCourses,
    semesters,
  })
  best.entry.title_tr = title_tr
  if (/\.json$/i.test(file)) best.entry.starsExport = true
  console.log(`${file} -> ${old.id} (${old.title}, ${Math.round(best.score * 100)}% match)`)
  for (const line of [...stars.warnings, ...differences]) console.log('  ' + line)
  if (!stars.warnings.length && !differences.length) console.log('  same courses and credits as the catalog')
  const pools = Object.keys(stars.pools)
  if (pools.length) console.log(`  elective pools: ${pools.length - missingPools.length}/${pools.length} saved${missingPools.length ? ` (missing ${missingPools.join(', ')})` : ''}`)
}

writeJson('index.json', index)
if (coursesChanged) writeJson('courses.json', courses)
