#!/usr/bin/env node
/**
 * Import a full course catalog from one manually-downloaded SIS export
 * (the "Course Catalog" Excel that lists every subject in a single file),
 * bypassing the Playwright scraper entirely.
 *
 * Builds required/elective program mappings from the same local curriculum
 * fallback build_program_mappings.js uses, then replaces catalog_courses and
 * catalog_sections the same way import_all_offerings.js does. Assessment
 * weights (course_assessments) are untouched -- those still need syllabus
 * PDFs from the document bot.
 *
 * Usage:
 *   node import_manual_catalog.js --file /path/to/courseCatalogDS.xls
 *   node import_manual_catalog.js --file /path/to/courseCatalogDS.xls --term "2026 - 2027 Güz"
 */
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { getDbConfig } from './db.js';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Kept in sync by hand with the same table in build_program_mappings.js --
// both read data/course_major_index.json and need the same majorId -> SIS
// program code mapping to produce comparable required/elective lists.
const PROGRAM_CODES = {
  ai: ['BSAI'], anth: ['BAANTH'], arch_en: ['BSARCH (ENG)'], arch_tr: ['BSARCH (TR)'],
  avm: ['BSAVM', 'BSATM'], bus: ['BABUS'], ce: ['BSCE'], code: ['BSCOD', 'BSCODE'],
  cs: ['BSCS'], econ: ['BAECON'], ee: ['BSEE'], entr: ['BAENT'],
  garm: ['BSGARM', 'BSGCA'], hman: ['BSHMAN', 'BSHOTM'], huk: ['BLAW'],
  ide: ['BSIDE', 'BSIPD'], ie: ['BSIE'], inar: ['BSINTAR'], ir: ['BAIR'],
  me: ['BSME'], mis: ['BAMIS'], plt: ['BSPLT', 'BSPF'], psy: ['BAPSYC'],
  uf: ['BABAF'], uti: ['BAIB', 'BAIBUS'],
};

function parseArgs() {
  const args = process.argv.slice(2);
  const config = { file: '', term: '' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file') config.file = args[++i] || '';
    else if (args[i] === '--term') config.term = args[++i] || '';
    else throw new Error(`Unknown option: ${args[i]}`);
  }
  return config;
}

function mergeDistinct(left, right, separator) {
  const values = [...String(left || '').split(separator), ...String(right || '').split(separator)]
    .map(value => value.trim())
    .filter(Boolean);
  return [...new Set(values)].join(separator);
}

function programMappingFor(code, curriculumIndex) {
  const required = new Set();
  const elective = new Set();
  for (const major of curriculumIndex[code]?.majors || []) {
    const programCodes = PROGRAM_CODES[major.majorId] || [];
    const target = major.type === 'mandatory' ? required : elective;
    programCodes.forEach(programCode => target.add(programCode));
  }
  for (const programCode of required) elective.delete(programCode);
  return { required: [...required].sort(), elective: [...elective].sort() };
}

function updateBackendTerm(term) {
  if (!term) return;
  const envPath = path.join(__dirname, '..', '..', 'backend', '.env');
  if (!fs.existsSync(envPath)) return;
  const original = fs.readFileSync(envPath, 'utf8');
  const line = `CATALOG_TERM=${term}`;
  const updated = /^CATALOG_TERM=.*$/m.test(original)
    ? original.replace(/^CATALOG_TERM=.*$/m, line)
    : `${original.replace(/\s*$/, '')}\n${line}\n`;
  fs.writeFileSync(envPath, updated);
  console.log(`Updated backend/.env CATALOG_TERM=${term}`);
}

async function run() {
  const config = parseArgs();
  if (!config.file) {
    console.error('Usage: node import_manual_catalog.js --file /path/to/courseCatalogDS.xls [--term "2026 - 2027 Güz"]');
    process.exit(1);
  }
  const filePath = path.resolve(config.file);
  if (!fs.existsSync(filePath)) {
    console.error(`File does not exist: ${filePath}`);
    process.exit(1);
  }

  const indexPath = path.join(__dirname, '..', '..', 'data', 'course_major_index.json');
  const curriculumIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

  console.log(`Reading ${filePath}...`);
  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(worksheet);
  console.log(`Found ${rows.length} rows.`);

  const courses = {};
  const sectionMap = new Map();

  for (const row of rows) {
    const subject = (row.SUBJECT || '').toString().trim().toUpperCase();
    const courseNo = (row.COURSENO || '').toString().trim();
    const courseCode = `${subject}${courseNo}`;
    const sectionNo = (row.SECTIONNO || '').toString().trim();
    const title = (row.TITLE || '').toString().trim();
    const faculty = (row.FACULTY || '').toString().trim();
    const credits = parseFloat(row.CREDITS || '0');
    const instructor = (row.INSTRUCTORFULLNAME || '').toString().trim();
    const coreq = (row.COREQUISITE || '').toString().trim();
    const prereq = (row.PREREQUISITE || '').toString().trim();
    const description = (row.DESCRIPTION || '').toString().trim();
    const schedule = (row.SCHEDULEFORPRINT || '').toString().trim();

    if (!courseCode || !title) continue;

    if (!courses[courseCode]) {
      const { required, elective } = programMappingFor(courseCode, curriculumIndex);
      courses[courseCode] = {
        course_code: courseCode, subject, course_no: courseNo, title, faculty, credits,
        description, corequisites: coreq, prerequisites: prereq,
        required_programs: required, elective_programs: elective,
      };
    }

    const section = { course_code: courseCode, section_no: sectionNo, instructor, schedule };
    const sectionKey = `${courseCode} ${sectionNo}`;
    const existing = sectionMap.get(sectionKey);
    if (existing) {
      existing.instructor = mergeDistinct(existing.instructor, instructor, ', ');
      existing.schedule = mergeDistinct(existing.schedule, schedule, '\n');
    } else {
      sectionMap.set(sectionKey, section);
    }
  }

  const courseList = Object.values(courses);
  const sections = [...sectionMap.values()];
  const unmapped = courseList.filter(c => c.required_programs.length === 0 && c.elective_programs.length === 0).length;
  console.log(`Parsed ${courseList.length} unique courses, ${sections.length} sections.`);
  console.log(`${unmapped} courses have no required/elective program match in course_major_index.json (commonly lab-component codes like "CS101L" or open electives -- expected, not necessarily an error).`);

  if (courseList.length === 0 || sections.length === 0) {
    console.error('Refusing to replace the catalog with an empty import.');
    process.exit(1);
  }

  const client = new Client(getDbConfig());
  try {
    await client.connect();
    console.log(`Connected to PostgreSQL (${getDbConfig().database}).`);

    console.log('Replacing catalog contents in one transaction...');
    await client.query('BEGIN');
    await client.query('TRUNCATE TABLE catalog_sections RESTART IDENTITY');

    for (const c of courseList) {
      await client.query(`
        INSERT INTO catalog_courses (
          course_code, subject, course_no, title, faculty, credits,
          description, corequisites, prerequisites, required_programs, elective_programs
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (course_code) DO UPDATE SET
          subject = EXCLUDED.subject, course_no = EXCLUDED.course_no, title = EXCLUDED.title,
          faculty = EXCLUDED.faculty, credits = EXCLUDED.credits, description = EXCLUDED.description,
          corequisites = EXCLUDED.corequisites, prerequisites = EXCLUDED.prerequisites,
          required_programs = EXCLUDED.required_programs, elective_programs = EXCLUDED.elective_programs
      `, [
        c.course_code, c.subject, c.course_no, c.title, c.faculty, c.credits,
        c.description, c.corequisites, c.prerequisites, c.required_programs, c.elective_programs,
      ]);
    }
    console.log(`Inserted/updated ${courseList.length} courses.`);

    const importedCodes = courseList.map(c => c.course_code);
    const { rowCount: removed } = await client.query(
      'DELETE FROM catalog_courses WHERE NOT (course_code = ANY($1::text[]))',
      [importedCodes]
    );
    if (removed > 0) console.log(`Removed ${removed} course(s) no longer offered.`);

    for (const s of sections) {
      await client.query(`
        INSERT INTO catalog_sections (course_code, section_no, instructor, schedule)
        VALUES ($1, $2, $3, $4)
      `, [s.course_code, s.section_no, s.instructor, s.schedule]);
    }
    console.log(`Inserted ${sections.length} sections.`);

    await client.query('COMMIT');
    console.log('Catalog import complete. Note: this replaced catalog_sections, so any');
    console.log('previously-imported room data is gone -- rerun import_rooms.js if needed.');
  } catch (err) {
    console.error('Database operation failed:', err.message);
    try { await client.query('ROLLBACK'); } catch { /* connection may already be gone */ }
    process.exitCode = 1;
  } finally {
    await client.end();
  }

  if (!process.exitCode) {
    updateBackendTerm(config.term);
    console.log('Restart the backend so CATALOG_TERM and any in-memory catalog cache refresh.');
  }
}

run();
