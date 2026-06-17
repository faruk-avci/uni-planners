import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const xlsPath = path.join(__dirname, 'courseCatalogDS_tmp_CN8466617512072214216.xls');
const programsJsonPath = path.join(__dirname, 'downloads/course_programs.json');
const envPath = '/home/eo/Desktop/ozu-planner/backend/.env';

// 1. Read ECTS programs JSON
console.log('📖 Reading ECTS program mappings...');
const programsData = JSON.parse(fs.readFileSync(programsJsonPath, 'utf8'));
const programMap = new Map();
for (const item of programsData) {
  programMap.set(item.code.toUpperCase(), {
    required: item.required || [],
    elective: item.elective || []
  });
}

// 2. Read XLS file
console.log('📊 Reading Excel catalog file...');
const workbook = XLSX.readFile(xlsPath);
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(worksheet);

console.log(`📋 Found ${rows.length} rows in the XLS catalog.`);

// 3. Process and group courses/sections
const courses = {};
const sections = [];

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

  // Lookup ECTS programs
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

  sections.push({
    course_code: courseCode,
    section_no: sectionNo,
    instructor,
    schedule
  });
}

// 4. Load database credentials from backend .env
console.log('⚙️ Loading PostgreSQL config...');
let env = {};
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8');
  envText.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (match) {
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.substring(1, val.length - 1);
      if (val.startsWith("'") && val.endsWith("'")) val = val.substring(1, val.length - 1);
      env[match[1]] = val;
    }
  });
}

const localClusterExists = fs.existsSync(path.join(__dirname, 'pg_data'));
const dbPort = localClusterExists ? 5433 : parseInt(env.DB_PORT || '5432');

const dbConfig = {
  host: env.DB_HOST || 'localhost',
  port: dbPort,
  user: env.DB_USER || 'ozu_user',
  password: env.DB_PASSWORD || 'password123',
  database: env.DB_NAME || 'ozu_schedule'
};

console.log('Connecting to database with config:', {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database,
  password: '***'
});

async function run() {
  const client = new Client(dbConfig);
  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    // Create tables
    console.log('Creating database tables...');
    await client.query('DROP TABLE IF EXISTS catalog_sections CASCADE');
    await client.query('DROP TABLE IF EXISTS catalog_courses CASCADE');

    await client.query(`
      CREATE TABLE catalog_courses (
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
      CREATE TABLE catalog_sections (
        id SERIAL PRIMARY KEY,
        course_code VARCHAR(20) REFERENCES catalog_courses(course_code) ON DELETE CASCADE,
        section_no VARCHAR(10) NOT NULL,
        instructor VARCHAR(255),
        schedule TEXT
      )
    `);

    console.log('✓ Tables created successfully');

    // Insert Courses
    console.log('Inserting courses...');
    for (const c of Object.values(courses)) {
      await client.query(`
        INSERT INTO catalog_courses (
          course_code, subject, course_no, title, faculty, credits, 
          description, corequisites, prerequisites, required_programs, elective_programs
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        c.course_code, c.subject, c.course_no, c.title, c.faculty, c.credits,
        c.description, c.corequisites, c.prerequisites, c.required_programs, c.elective_programs
      ]);
    }
    console.log(`✓ Inserted ${Object.keys(courses).length} courses`);

    // Insert Sections
    console.log('Inserting sections...');
    for (const s of sections) {
      await client.query(`
        INSERT INTO catalog_sections (course_code, section_no, instructor, schedule)
        VALUES ($1, $2, $3, $4)
      `, [s.course_code, s.section_no, s.instructor, s.schedule]);
    }
    console.log(`✓ Inserted ${sections.length} sections`);

    console.log('\n🎉 Import complete!');
    await client.end();

  } catch (err) {
    console.error('\n❌ Database operation failed:', err.message);
    
    // Print a sample parsed object for verification
    const sampleKey = Object.keys(courses)[0];
    if (sampleKey) {
      console.log('\n🔍 Sample parsed course data that is ready to load:');
      console.log(JSON.stringify(courses[sampleKey], null, 2));
      const sectionSample = sections.filter(s => s.course_code === sampleKey);
      console.log('\n🔍 Sample parsed section data:');
      console.log(JSON.stringify(sectionSample, null, 2));
    }

    console.log('\n💡 Tip: If connection failed, you can run this script directly once you have postgres access using:');
    console.log('   node import_catalog.js');
    if (client) {
      try { await client.end(); } catch (e) {}
    }
  }
}

run();
