// Universities the site serves. Every per-university setting, survey and
// admin permission is keyed by `slug`.
//
// curriculumSource:
//   'panel'  - curricula are uploaded in the panel (Excel import)
//   'static' - curricula ship with the frontend (frontend/public/data/<slug>)
// sectionSeparator: how a section is written after the course code,
//   Özyeğin "ACCT 201A", Bilkent "CS 101-1".
export const UNIVERSITIES = [
  { slug: 'ozyegin', name: 'Özyeğin Üniversitesi', shortName: 'Özyeğin', curriculumSource: 'panel', sectionSeparator: '' },
  { slug: 'bilkent', name: 'Bilkent Üniversitesi', shortName: 'Bilkent', curriculumSource: 'static', sectionSeparator: '-' },
]

export const UNIVERSITY_SLUGS = UNIVERSITIES.map(university => university.slug)
export const UNIVERSITY_BY_SLUG = new Map(UNIVERSITIES.map(university => [university.slug, university]))
export const DEFAULT_UNIVERSITY = 'ozyegin'

export const isUniversity = slug => UNIVERSITY_BY_SLUG.has(slug)
