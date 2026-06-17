import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = '/home/eo/Desktop/ozu-planner/backend/.env';
const outputPath = '/home/eo/Desktop/ozu-planner-v2/frontend/src/data/courses_catalog.json';

// Helper to parse schedule string (e.g., "Pazartesi | 10:40 - 12:30")
function parseSchedule(scheduleStr) {
  if (!scheduleStr) return [];
  const times = [];
  // Split by newline, + or carriage return
  const parts = scheduleStr.split(/[+\n\r]+/).map(p => p.trim()).filter(Boolean);
  
  for (const part of parts) {
    const match = part.match(/^\s*([A-Za-zÇŞĞÖÜıİöüçşğ]+)\s*\|\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*$/);
    if (match) {
      times.push({
        day: match[1].trim(),
        start: match[2].trim(),
        end: match[3].trim()
      });
    }
  }
  return times;
}

// Format course code (e.g., "EE201" -> "EE 201")
function formatCourseCode(code) {
  const match = code.match(/^([A-Z]+)(\d+.*)$/i);
  if (match) {
    return `${match[1]} ${match[2]}`;
  }
  return code;
}

// Load .env
let env = {};
if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8');
  envText.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (match) {
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.substring(1, val.length - 1);
      env[match[1]] = val;
    }
  });
}

const dbConfig = {
  host: env.DB_HOST || 'localhost',
  port: fs.existsSync(path.join(__dirname, 'pg_data')) ? 5433 : parseInt(env.DB_PORT || '5432'),
  user: env.DB_USER || 'ozu_user',
  password: env.DB_PASSWORD || 'password123',
  database: env.DB_NAME || 'ozu_schedule'
};

async function run() {
  const client = new Client(dbConfig);
  try {
    await client.connect();
    console.log('✅ Connected to database for export');

    // Fetch courses
    const coursesRes = await client.query('SELECT * FROM catalog_courses ORDER BY course_code');
    const courses = coursesRes.rows;

    // Fetch sections
    const sectionsRes = await client.query('SELECT * FROM catalog_sections ORDER BY course_code, section_no');
    const sections = sectionsRes.rows;

    // Group sections by course_code
    const sectionsByCourse = {};
    for (const sec of sections) {
      if (!sectionsByCourse[sec.course_code]) {
        sectionsByCourse[sec.course_code] = [];
      }
      
      const parsedTimes = parseSchedule(sec.schedule);
      const formattedCode = formatCourseCode(sec.course_code);
      
      sectionsByCourse[sec.course_code].push({
        name: `${formattedCode}${sec.section_no}`,
        lecturer: sec.instructor || 'Staff',
        times: parsedTimes
      });
    }

    // Format final list
    const exportData = courses.map(c => {
      const codeFormatted = formatCourseCode(c.course_code);
      return {
        code: codeFormatted,
        name: c.title,
        credits: parseFloat(c.credits),
        faculty: c.faculty || 'Faculty of Engineering',
        prereq: c.prerequisites || '',
        coreq: c.corequisites || '',
        description: c.description || '',
        required: c.required_programs || [],
        elective: c.elective_programs || [],
        sections: sectionsByCourse[c.course_code] || []
      };
    });

    // Make sure output folder exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)){
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf8');
    console.log(`🎉 Exported ${exportData.length} courses to ${outputPath}`);
    await client.end();
  } catch (err) {
    console.error('❌ Export failed:', err.message);
    if (client) {
      try { await client.end(); } catch (e) {}
    }
  }
}

run();
