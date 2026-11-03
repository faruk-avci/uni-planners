// Everything that differs between universities lives here; components read
// UNIVERSITY_INFO instead of checking which university they are on.
//
// One university per page load: the first path segment decides it
// (/bilkent/..., /ozyegin/...). Pages without one (/, /how-to, /share/...)
// count as Özyeğin. Moving to another university is a full page load (see
// navigate in App), so this never changes while the app runs.
const UNIVERSITIES = {
  ozyegin: {
    mark: 'Ö',
    name: { tr: 'Özyeğin Üniversitesi', en: 'Özyeğin University' },
    registrationSystem: 'ÖzÜ SIS',
    registrationShort: 'SIS',
    registrationUrl: 'https://sis.ozyegin.edu.tr/',
    creditUnitEn: 'ECTS',
    // Course load the basket warns about (ÖzÜ rules).
    creditLoad: { warn: 36, danger: 42 },
    // Classes start at :40 past the hour (08:40, 09:40...).
    slotMinute: 40,
    searchExample: 'EE 201',
    // The term recap and the degree-audit upload are built on ÖzÜ data.
    features: { recap: true, degreeAudit: true },
  },
  bilkent: {
    mark: 'B',
    name: { tr: 'Bilkent Üniversitesi', en: 'Bilkent University' },
    registrationSystem: 'STARS',
    registrationShort: 'STARS',
    registrationUrl: 'https://stars.bilkent.edu.tr/',
    creditUnitEn: 'Credits',
    creditLoad: null,
    slotMinute: 30,
    searchExample: 'CS 101',
    features: { recap: false, degreeAudit: false },
  },
}

const DEFAULT_UNIVERSITY = 'ozyegin'
export const universityOfPath = pathname => {
  const slug = String(pathname || '').split('/')[1]
  return UNIVERSITIES[slug] ? slug : DEFAULT_UNIVERSITY
}

export const UNIVERSITY = universityOfPath(window.location.pathname)
export const UNIVERSITY_INFO = UNIVERSITIES[UNIVERSITY]

// Credits are ECTS at Özyeğin and Bilkent credits at Bilkent.
export const creditUnit = language => (language === 'tr' ? 'Kredi' : UNIVERSITY_INFO.creditUnitEn)

// Every university's pages live under its slug: /ozyegin/curriculum,
// /bilkent/anket... (/curriculum still works and redirects to Özyeğin's).
export function pathFor(page, university = UNIVERSITY) {
  if (page === 'landing') return '/'
  if (page === 'howto') return '/how-to'
  if (page === 'recap') return '/ozyegin/recap/26-27-guz'
  if (page === 'survey') return `/${university}/anket`
  if (page === 'curriculum') return `/${university}/curriculum`
  return `/${university}`
}

// localStorage keys for per-university state: uniplanner_<university>_major...
export const storageKey = name => name.replace(/^uniplanner_/, `uniplanner_${UNIVERSITY}_`)

// Özyeğin used unprefixed keys before there were several universities; move
// them once so returning visitors keep their major, year and curriculum.
if (UNIVERSITY === DEFAULT_UNIVERSITY) {
  try {
    for (const name of ['uniplanner_major', 'uniplanner_grade', 'uniplanner_curriculum']) {
      const legacy = localStorage.getItem(name)
      if (legacy !== null && localStorage.getItem(storageKey(name)) === null) localStorage.setItem(storageKey(name), legacy)
      localStorage.removeItem(name)
    }
  } catch { /* storage disabled */ }
}
