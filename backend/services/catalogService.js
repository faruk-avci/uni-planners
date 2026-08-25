import { pool } from '../config/db.js';
import { PROGRAMS } from '../config/programs.js';
import { formatCourseCode, parseSchedule } from '../utils/helpers.js';
import { readCurriculumData } from './curriculumStore.js';

// ─── Catalog cache ─────────────────────────────────────────────────
const CATALOG_TTL_MS = parseInt(process.env.CATALOG_TTL_MS, 10) || 5 * 60 * 1000;
let catalog = { byCode: new Map(), all: [], loadedAt: 0 };
let catalogLoading = null;

export function stripEntry(e) {
  const { normCode, ...rest } = e;
  return rest;
}

export async function reloadCatalog() {
  const [{ rows: courses }, { rows: sections }, { rows: assessments }] = await Promise.all([
    pool.query('SELECT * FROM catalog_courses'),
    pool.query('SELECT * FROM catalog_sections ORDER BY course_code, section_no'),
    pool.query('SELECT * FROM course_assessments ORDER BY course_code, category, id'),
  ]);

  const secByCourse = {};
  for (const s of sections) {
    (secByCourse[s.course_code] ||= []).push({
      name: `${formatCourseCode(s.course_code)}${s.section_no}`,
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
  catalog = { byCode, all, loadedAt: Date.now() };
  return catalog;
}

export async function getCatalog() {
  if (catalog.all.length === 0) {
    if (!catalogLoading) catalogLoading = reloadCatalog().finally(() => { catalogLoading = null; });
    await catalogLoading;
  } else if (Date.now() - catalog.loadedAt > CATALOG_TTL_MS && !catalogLoading) {
    catalogLoading = reloadCatalog()
      .catch(e => console.error('catalog reload failed:', e.message))
      .finally(() => { catalogLoading = null; });
  }
  return catalog;
}

// ─── Elective-type lookup ──────────────────────────────────────────
export const CURRICULUM_PROGRAMS = {
  ...Object.fromEntries(PROGRAMS.map(program => [program.id, program.codes])),
};
export const MAJOR_TO_CURRICULUM = Object.fromEntries(
  Object.entries(CURRICULUM_PROGRAMS).flatMap(([id, programs]) => programs.map(program => [program, id]))
);
export const equivalentProgramsFor = program => (
  CURRICULUM_PROGRAMS[MAJOR_TO_CURRICULUM[program]] || [program]
);

export const ELECTIVE_TYPE_ORDER = [
  'program', 'program_FIN', 'program_MGMT', 'program_MIS', 'program_OPER', 'program_external',
  'specialization', 'design_studio', 'finishing_project',
  'faculty', 'non_faculty', 'certificate', 'social', 'social_restricted',
  'language', 'restricted', 'other', 'free',
];
export function curriculumData(curriculumId) {
  if (!CURRICULUM_PROGRAMS[curriculumId]) return null;
  return readCurriculumData(curriculumId);
}

export function electiveTypeMap(curriculumId) {
  const map = new Map();
  try {
    const data = readCurriculumData(curriculumId);
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
