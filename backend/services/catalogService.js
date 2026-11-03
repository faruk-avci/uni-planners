import { pool } from '../config/db.js';
import { PROGRAMS } from '../config/programs.js';
import { BILKENT_PROGRAM_BY_CODE, BILKENT_PROGRAMS } from '../config/bilkentPrograms.js';
import { DEFAULT_UNIVERSITY, UNIVERSITY_BY_SLUG } from '../config/universities.js';
import { formatCourseCode, parseSchedule, sectionLabel } from '../utils/helpers.js';
import { readCurriculumData } from './curriculumStore.js';
import { listedStaticIds, readStaticCurriculum } from './staticCurricula.js';

// ─── Catalog cache, one per university ─────────────────────────────
const CATALOG_TTL_MS = parseInt(process.env.CATALOG_TTL_MS, 10) || 5 * 60 * 1000;
const catalogs = new Map(); // university -> { byCode, all, loadedAt }
const loading = new Map();  // university -> in-flight reload

export function stripEntry(e) {
  const { normCode, ...rest } = e;
  return rest;
}

export async function reloadCatalog(university = DEFAULT_UNIVERSITY) {
  const [{ rows: courses }, { rows: sections }, { rows: assessments }] = await Promise.all([
    pool.query('SELECT * FROM catalog_courses WHERE university = $1', [university]),
    pool.query('SELECT * FROM catalog_sections WHERE university = $1 ORDER BY course_code, section_no', [university]),
    pool.query('SELECT * FROM course_assessments WHERE university = $1 ORDER BY course_code, category, id', [university]),
  ]);

  const secByCourse = {};
  for (const s of sections) {
    (secByCourse[s.course_code] ||= []).push({
      name: sectionLabel(university, formatCourseCode(s.course_code), s.section_no),
      lecturer: s.instructor || 'Staff',
      times: parseSchedule(s.schedule),
    });
  }
  const assByCourse = {};
  for (const a of assessments) {
    (assByCourse[a.course_code] ||= []).push({
      type: a.assessment_type,
      category: a.category,
      weight: a.weight ? parseFloat(a.weight) : null,
      raw_text: a.raw_text,
    });
  }

  const byCode = new Map();
  const all = [];
  for (const c of courses) {
    const entry = {
      code: formatCourseCode(c.course_code),
      normCode: c.course_code.toUpperCase(),
      name: c.title,
      credits: parseFloat(c.credits),
      faculty: c.faculty || '',
      prereq: c.prerequisites || '',
      coreq: c.corequisites || '',
      description: c.description || '',
      required: c.required_programs || [],
      elective: c.elective_programs || [],
      sections: secByCourse[c.course_code] || [],
      assessments: assByCourse[c.course_code] || [],
    };
    byCode.set(entry.normCode, entry);
    all.push(entry);
  }
  const catalog = { byCode, all, loadedAt: Date.now() };
  catalogs.set(university, catalog);
  return catalog;
}

export async function getCatalog(university = DEFAULT_UNIVERSITY) {
  const current = catalogs.get(university);
  const reload = () => {
    if (!loading.has(university)) loading.set(university, reloadCatalog(university).finally(() => loading.delete(university)));
    return loading.get(university);
  };
  if (!current || current.all.length === 0) return reload();
  if (Date.now() - current.loadedAt > CATALOG_TTL_MS && !loading.has(university)) {
    reload().catch(e => console.error(`catalog reload failed (${university}):`, e.message));
  }
  return current;
}

// ─── Programs and curricula ────────────────────────────────────────
// Özyeğin: program codes like BSCS map to panel-uploaded curricula (one
// program can have several equivalent codes). Bilkent: the major code is the
// department prefix (CS) and its curriculum ships with the site.
export const CURRICULUM_PROGRAMS = {
  ...Object.fromEntries(PROGRAMS.map(program => [program.id, program.codes])),
};
export const MAJOR_TO_CURRICULUM = Object.fromEntries(
  Object.entries(CURRICULUM_PROGRAMS).flatMap(([id, programs]) => programs.map(program => [program, id]))
);

const isStatic = university => UNIVERSITY_BY_SLUG.get(university)?.curriculumSource === 'static';

export const equivalentProgramsFor = (program, university = DEFAULT_UNIVERSITY) => (
  isStatic(university) ? [program] : CURRICULUM_PROGRAMS[MAJOR_TO_CURRICULUM[program]] || [program]
);

// Programs students can pick, as major codes.
export function majorCodesFor(university) {
  if (!isStatic(university)) return null; // Özyeğin: read from the catalog
  const listed = listedStaticIds(university);
  return BILKENT_PROGRAMS.filter(program => listed.has(program.id)).flatMap(program => program.codes);
}

export const ELECTIVE_TYPE_ORDER = [
  'program', 'program_FIN', 'program_MGMT', 'program_MIS', 'program_OPER', 'program_external',
  'specialization', 'design_studio', 'finishing_project',
  'faculty', 'non_faculty', 'certificate', 'social', 'social_restricted',
  'language', 'restricted', 'other', 'free',
];

export function curriculumData(curriculumId, university = DEFAULT_UNIVERSITY) {
  if (isStatic(university)) {
    if (!listedStaticIds(university).has(curriculumId)) return null;
    const program = BILKENT_PROGRAMS.find(item => item.id === curriculumId);
    return readStaticCurriculum(university, curriculumId, program);
  }
  if (!CURRICULUM_PROGRAMS[curriculumId]) return null;
  return readCurriculumData(curriculumId);
}

// The curriculum id behind a major code.
export function curriculumIdForMajor(major, university = DEFAULT_UNIVERSITY) {
  if (isStatic(university)) return BILKENT_PROGRAM_BY_CODE.get(major)?.id || null;
  return MAJOR_TO_CURRICULUM[major] || null;
}

export function electiveTypeMap(curriculumId, university = DEFAULT_UNIVERSITY) {
  const map = new Map();
  try {
    const data = curriculumData(curriculumId, university);
    if (!data) return map;
    for (const [type, list] of Object.entries(data.electives || {})) {
      for (const c of list) {
        const norm = String(c.code || '').replace(/\s+/g, '').toUpperCase();
        if (!norm) continue;
        if (!map.has(norm)) map.set(norm, []);
        if (!map.get(norm).includes(type)) map.get(norm).push(type);
      }
    }
  } catch { /* no curriculum file -> empty map */ }
  return map;
}

// Labels for elective types in one language (Bilkent stores both).
export function electiveLabelsFor(curriculum, language = 'tr') {
  return Object.fromEntries(Object.entries(curriculum?.electiveLabels || {}).map(([key, label]) => [
    key,
    label && typeof label === 'object' ? label[language] || label.tr : label,
  ]));
}
