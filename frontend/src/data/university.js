// One university per page load. The path decides it (/bilkent/... is Bilkent,
// everything else is Özyeğin), and moving to another university is a full
// page load (see navigate in App), so this never changes while the app runs.
export const UNIVERSITY = /^\/bilkent(\/|$)/.test(window.location.pathname) ? 'bilkent' : 'ozyegin'
export const isBilkent = UNIVERSITY === 'bilkent'

export const UNIVERSITY_INFO = {
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
  },
}[UNIVERSITY]

// Credits are ECTS at Özyeğin and Bilkent credits at Bilkent.
export const creditUnit = language => (language === 'tr' ? 'Kredi' : UNIVERSITY_INFO.creditUnitEn)

// Path of a page for the current university. Özyeğin keeps its original,
// shorter paths (/curriculum); other universities nest under their slug.
export function pathFor(page, university = UNIVERSITY) {
  if (page === 'landing') return '/'
  if (page === 'howto') return '/how-to'
  if (page === 'recap') return '/ozyegin/recap/26-27-guz'
  if (page === 'survey') return `/${university}/anket`
  if (page === 'curriculum') return university === 'ozyegin' ? '/curriculum' : `/${university}/curriculum`
  return `/${university}`
}

// The university a path belongs to. The landing page and shared pages count
// as Özyeğin, the only university with a backend so far.
export const universityOfPath = pathname => (/^\/bilkent(\/|$)/.test(pathname) ? 'bilkent' : 'ozyegin')

// localStorage keys that hold per-university state (major, grade, basket...).
// Özyeğin keeps the historical names so returning visitors keep their data.
export const storageKey = name => (isBilkent ? name.replace(/^uniplanner_/, 'uniplanner_bilkent_') : name)
