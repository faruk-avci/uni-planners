import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { getDbConfig } from './db.js';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    term: ''
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--term') {
      config.term = args[i + 1] || '';
      i++;
    }
  }
  return config;
}

function termSlug(term) {
  return term.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
}

const config = parseArgs();
const baseDir = config.term
  ? path.join(__dirname, 'downloads', termSlug(config.term))
  : path.join(__dirname, 'downloads');

const programsJsonPath = path.join(baseDir, 'course_programs.json');

// 1. Read ECTS programs JSON
console.log(`📖 Reading ECTS program mappings from ${programsJsonPath}...`);
if (!fs.existsSync(programsJsonPath)) {
  console.error(`❌ Cannot find course_programs.json at ${programsJsonPath}`);
  process.exit(1);
}
const programsData = JSON.parse(fs.readFileSync(programsJsonPath, 'utf8'));
const programMap = new Map();
for (const item of programsData) {
  programMap.set(item.code.toUpperCase(), {
    required: item.required || [],
    elective: item.elective || []
  });
}

// 2. Read all XLS files
console.log(`📂 Scanning directory: ${baseDir}`);
if (!fs.existsSync(baseDir)) {
  console.error(`❌ Directory does not exist: ${baseDir}`);
  process.exit(1);
}

const subjects = fs.readdirSync(baseDir).filter(d => {
  const full = path.join(baseDir, d);
  return fs.statSync(full).isDirectory() && d !== 'offered_courses';
});

const files = [];
for (const subj of subjects) {
  const subjDir = path.join(baseDir, subj);
  const subjFiles = fs.readdirSync(subjDir).filter(f => f.endsWith('.xls'));
  for (const f of subjFiles) {
    files.push(path.join(subjDir, f));
  }
}
console.log(`📊 Found ${files.length} Excel offering files.`);

const courses = {};
const sectionMap = new Map();

function mergeDistinct(left, right, separator) {
  const values = [...String(left || '').split(separator), ...String(right || '').split(separator)]
    .map(value => value.trim())
    .filter(Boolean);
  return [...new Set(values)].join(separator);
}

for (const filePath of files) {
  try {
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(worksheet);

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

      // Lookup program mappings
      const ects = programMap.get(courseCode) || { required: [], elective: [] };

      if (!courses[courseCode]) {
        courses[courseCode] = {
          course_code: courseCode,
          subject,
          course_no: courseNo,
          title,
          faculty,
          credits,
          description,
          corequisites: coreq,
          prerequisites: prereq,
          required_programs: ects.required,
          elective_programs: ects.elective
        };
      }

      const section = {
        course_code: courseCode,
        section_no: sectionNo,
        instructor,
        schedule
      };
      const sectionKey = `${courseCode}\u0000${sectionNo}`;
      const existing = sectionMap.get(sectionKey);
      if (existing) {
        existing.instructor = mergeDistinct(existing.instructor, instructor, ', ');
        existing.schedule = mergeDistinct(existing.schedule, schedule, '\n');
      } else {
        sectionMap.set(sectionKey, section);
      }
    }
  } catch (err) {
    console.error(`⚠️ Failed to parse file ${path.basename(filePath)}:`, err.message);
  }
}

console.log(`📋 Total unique courses: ${Object.keys(courses).length}`);
const sections = [...sectionMap.values()];
console.log(`📋 Total class sections: ${sections.length}`);
if (Object.keys(courses).length === 0 || sections.length === 0) {
  console.error('❌ Refusing to replace the catalog with an empty import.');
  process.exit(1);
}

// 3. PostgreSQL Database Connection Setup (env-driven, shared with backend/.env)
const dbConfig = getDbConfig();

async function run() {
  const client = new Client(dbConfig);
  try {
    await client.connect();
    console.log(`✅ Connected to PostgreSQL on port ${dbConfig.port}`);

    // Keep the existing tables and replace their contents atomically. This
    // preserves dependent tables/constraints and avoids a half-imported catalog.
    console.log('Replacing catalog contents in one transaction...');
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS catalog_courses (
        course_code VARCHAR(20) PRIMARY KEY,
        subject VARCHAR(10) NOT NULL,
        course_no VARCHAR(10) NOT NULL,
        title VARCHAR(255) NOT NULL,
        faculty VARCHAR(255),
        credits DECIMAL(3,1) NOT NULL,
        description TEXT,
        corequisites VARCHAR(255),
        prerequisites VARCHAR(255),
        required_programs TEXT[],
        elective_programs TEXT[]
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS catalog_sections (
        id SERIAL PRIMARY KEY,
        course_code VARCHAR(20) REFERENCES catalog_courses(course_code) ON DELETE CASCADE,
        section_no VARCHAR(10) NOT NULL,
        instructor VARCHAR(255),
        schedule TEXT,
        UNIQUE (course_code, section_no)
      )
    `);
    await client.query('TRUNCATE TABLE catalog_sections RESTART IDENTITY');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS catalog_sections_course_section_uidx
      ON catalog_sections (course_code, section_no)
    `);

    // Insert Courses
    console.log('Inserting courses...');
    for (const c of Object.values(courses)) {
      await client.query(`
        INSERT INTO catalog_courses (
          course_code, subject, course_no, title, faculty, credits, 
          description, corequisites, prerequisites, required_programs, elective_programs
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (course_code) DO UPDATE SET
          subject = EXCLUDED.subject,
          course_no = EXCLUDED.course_no,
          title = EXCLUDED.title,
          faculty = EXCLUDED.faculty,
          credits = EXCLUDED.credits,
          description = EXCLUDED.description,
          corequisites = EXCLUDED.corequisites,
          prerequisites = EXCLUDED.prerequisites,
          required_programs = EXCLUDED.required_programs,
          elective_programs = EXCLUDED.elective_programs
      `, [
        c.course_code, c.subject, c.course_no, c.title, c.faculty, c.credits,
        c.description, c.corequisites, c.prerequisites, c.required_programs, c.elective_programs
      ]);
    }
    console.log(`✓ Inserted ${Object.keys(courses).length} courses`);

    const importedCodes = Object.keys(courses);
    await client.query(
      'DELETE FROM catalog_courses WHERE NOT (course_code = ANY($1::text[]))',
      [importedCodes]
    );

    // Insert Sections
    console.log('Inserting sections...');
    for (const s of sections) {
      await client.query(`
        INSERT INTO catalog_sections (course_code, section_no, instructor, schedule)
        VALUES ($1, $2, $3, $4)
      `, [s.course_code, s.section_no, s.instructor, s.schedule]);
    }
    console.log(`✓ Inserted ${sections.length} sections`);

    await client.query('COMMIT');

    console.log('\n🎉 All offered courses and sections successfully imported!');
    await client.end();

  } catch (err) {
    console.error('\n❌ Database operation failed:', err.message);
    if (client) {
      try { await client.query('ROLLBACK'); } catch (e) {}
      try { await client.end(); } catch (e) {}
    }
    process.exitCode = 1;
  }
}

run();
