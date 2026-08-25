import XLSX from 'xlsx'

const clean = value => String(value ?? '').trim()
const normalizeHeader = value => clean(value)
  .replaceAll('ı', 'i').replaceAll('İ', 'I')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9]/g, '').toUpperCase()

const slug = value => clean(value)
  .replaceAll('ı', 'i').replaceAll('İ', 'i')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72)

const formatCode = value => {
  const compact = clean(value).toUpperCase().replace(/\s+/g, '')
  const match = compact.match(/^([A-Z]+)(\d+[A-Z]*)$/)
  return match ? `${match[1]} ${match[2]}` : clean(value).toUpperCase()
}

const number = value => {
  const parsed = Number.parseFloat(clean(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function rowsFromWorkbook(buffer) {
  if (!buffer?.length) throw new Error('Excel file is empty')
  const workbook = XLSX.read(buffer, { type: 'buffer', dense: true })
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!firstSheet) throw new Error('Excel file has no worksheet')
  return XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '', raw: false, blankrows: false })
}

function findHeader(rows, requiredAliases) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 12); rowIndex += 1) {
    const headers = rows[rowIndex].map(normalizeHeader)
    const positions = Object.fromEntries(Object.entries(requiredAliases).map(([field, aliases]) => [
      field,
      headers.findIndex(header => aliases.includes(header)),
    ]))
    if (positions.code >= 0 && positions.title >= 0) return { rowIndex, positions }
  }
  throw new Error('Could not find the course-code and title columns')
}

function semesterFrom(value) {
  const text = clean(value)
  const normalized = normalizeHeader(text)
  const year = Number.parseInt(normalized.match(/([1-9])(?:YIL|YEAR)/)?.[1], 10)
  const term = normalized.includes('BAHAR') || normalized.includes('SPRING') ? 'spring'
    : normalized.includes('GUZ') || normalized.includes('FALL') || normalized.includes('AUTUMN') ? 'fall' : null
  return year && term ? { year: String(year), term, label: text } : null
}

const curriculumAliases = {
  code: ['CODE', 'DERS', 'DERSKODU', 'COURSECODE'],
  title: ['TITLE', 'BASLIK', 'DERINADI', 'DERSADI', 'COURSETITLE'],
  credits: ['CREDITS', 'CREDIT', 'KREDI', 'AKTS', 'ECTS'],
  prereq: ['PREREQUISITECHANGED', 'PREREQUISITE', 'ONKOSUL'],
  coreq: ['COREQUISITECHANGED', 'COREQUISITE', 'YANKOSUL'],
  practical: ['PRACTICALLESSON', 'UYGULAMALIDERS'],
  semester: ['SEMESTER', 'DONEM'],
}

const electiveAliases = {
  code: ['DERS', 'CODE', 'DERSKODU', 'COURSECODE'],
  title: ['BASLIK', 'TITLE', 'DERSADI', 'COURSETITLE'],
  credits: ['KREDI', 'CREDITS', 'CREDIT', 'AKTS', 'ECTS'],
  prereq: ['ONKOSUL', 'PREREQUISITE', 'PREREQUISITECHANGED'],
  coreq: ['YANKOSUL', 'COREQUISITE', 'COREQUISITECHANGED'],
  practical: ['UYGULAMALIDERS', 'PRACTICALLESSON'],
}

function cell(row, positions, field) {
  const index = positions[field]
  return index >= 0 ? row[index] : ''
}

export function parseCurriculumWorkbook(buffer) {
  const rows = rowsFromWorkbook(buffer)
  const { rowIndex, positions } = findHeader(rows, curriculumAliases)
  if (positions.semester < 0) throw new Error('Could not find the SEMESTER column')

  const semesters = {}
  const requirements = new Map()
  let courseCount = 0
  for (const row of rows.slice(rowIndex + 1, rowIndex + 5001)) {
    const title = clean(cell(row, positions, 'title'))
    const code = formatCode(cell(row, positions, 'code'))
    if (!title && !code) continue
    const semester = semesterFrom(cell(row, positions, 'semester'))
    if (!semester) continue
    semesters[semester.year] ||= { fall: [], spring: [] }

    const base = {
      code,
      title_tr: title || code,
      title_en: title || code,
      credits: number(cell(row, positions, 'credits')),
      prereq: clean(cell(row, positions, 'prereq')),
      coreq: clean(cell(row, positions, 'coreq')),
      practical: clean(cell(row, positions, 'practical')) === '1',
    }
    if (code) {
      courseCount += 1
      semesters[semester.year][semester.term].push(base)
      continue
    }

    const electiveType = slug(title) || `elective-${requirements.size + 1}`
    semesters[semester.year][semester.term].push({ ...base, electiveType })
    const existing = requirements.get(electiveType) || { key: electiveType, label: title, occurrences: [] }
    existing.occurrences.push({ year: Number(semester.year), term: semester.term, credits: base.credits })
    requirements.set(electiveType, existing)
  }

  if (courseCount === 0) throw new Error('No curriculum courses were found')
  return { semesters, courseCount, electiveRequirements: [...requirements.values()] }
}

export function parseElectiveWorkbook(buffer) {
  const rows = rowsFromWorkbook(buffer)
  const { rowIndex, positions } = findHeader(rows, electiveAliases)
  const courses = []
  const seen = new Set()
  for (const row of rows.slice(rowIndex + 1, rowIndex + 10001)) {
    const code = formatCode(cell(row, positions, 'code'))
    if (!code || seen.has(code)) continue
    seen.add(code)
    const title = clean(cell(row, positions, 'title')) || code
    courses.push({
      code,
      title_tr: title,
      title_en: title,
      credits: number(cell(row, positions, 'credits')),
      prereq: clean(cell(row, positions, 'prereq')),
      coreq: clean(cell(row, positions, 'coreq')),
      practical: clean(cell(row, positions, 'practical')) === '1',
    })
  }
  if (courses.length === 0) throw new Error('No elective courses were found')
  return courses
}

export function electiveKeyForLabel(label) {
  return slug(label)
}
