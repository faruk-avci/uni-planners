#!/usr/bin/env node
/**
 * import_assessments.js
 * 
 * Imports parsed assessment data from downloads/assessments.json into the
 * course_assessments table in the PostgreSQL database.
 */

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

async function main() {
  const config = parseArgs();
  const baseDir = config.term
    ? path.join(__dirname, 'downloads', termSlug(config.term))
    : path.join(__dirname, 'downloads');

  const assessmentsFile = path.join(baseDir, 'assessments.json');

  if (!fs.existsSync(assessmentsFile)) {
    console.error(`❌ Assessments JSON file not found: ${assessmentsFile}`);
    console.error('Please run "node parse_assessments.js" first.');
    process.exit(1);
  }

  const assessmentsData = JSON.parse(fs.readFileSync(assessmentsFile, 'utf8'));
  console.log(`📖 Loaded assessments for ${Object.keys(assessmentsData).length} unique courses from ${assessmentsFile}.`);

  // Connect to database (env-driven, shared with backend/.env)
  const client = new Client(getDbConfig());

  try {
    await client.connect();
    console.log('✅ Connected to database.');

    // Ensure the table exists (fresh DBs won't have it yet).
    await client.query(`
      CREATE TABLE IF NOT EXISTS course_assessments (
        id              SERIAL PRIMARY KEY,
        course_code     VARCHAR(20) NOT NULL,
        assessment_type TEXT,
        category        TEXT,
        weight          NUMERIC(6,2),
        raw_text        TEXT
      )
    `);
    // Older local databases created these fields as VARCHAR(100). Syllabus
    // labels can legitimately be longer, so migrate without truncating data.
    await client.query(`
      ALTER TABLE course_assessments
        ALTER COLUMN assessment_type TYPE TEXT,
        ALTER COLUMN category TYPE TEXT
    `);

    // Fetch list of valid course codes to ensure foreign key constraint is satisfied
    const res = await client.query('SELECT course_code FROM catalog_courses');
    const validCourses = new Set(res.rows.map(r => r.course_code.toUpperCase()));
    console.log(`ℹ️ Database contains ${validCourses.size} valid courses in catalog_courses.`);

    // Begin transaction
    await client.query('BEGIN');

    // Clear existing assessments
    await client.query('DELETE FROM course_assessments');
    console.log('🧹 Cleared existing records in course_assessments.');

    let insertCount = 0;
    let skipCount = 0;

    for (const [courseCode, assessments] of Object.entries(assessmentsData)) {
      const codeUpper = courseCode.toUpperCase().replace(/\s+/g, ''); // e.g. "CS101" or "CS 101"
      
      // Check if course code is in catalog_courses (sometimes codes are e.g. CS101 or CS 101)
      let matchedCode = null;
      if (validCourses.has(courseCode.toUpperCase())) {
        matchedCode = courseCode.toUpperCase();
      } else if (validCourses.has(codeUpper)) {
        matchedCode = codeUpper;
      } else {
        // Try parsing space-separated
        const spaceCode = courseCode.replace(/^([A-Z]+)(\d+.*)$/i, '$1 $2').toUpperCase();
        if (validCourses.has(spaceCode)) {
          matchedCode = spaceCode;
        }
      }

      if (!matchedCode) {
        // Course is not in the active catalog (maybe historical syllabus or inactive course)
        skipCount++;
        continue;
      }

      for (const ass of assessments) {
        await client.query(
          `INSERT INTO course_assessments (course_code, assessment_type, category, weight, raw_text)
           VALUES ($1, $2, $3, $4, $5)`,
          [matchedCode, ass.type, ass.category, ass.weight, ass.raw]
        );
        insertCount++;
      }
    }

    await client.query('COMMIT');
    console.log('\n🎉 Import complete!');
    console.log(`  Inserted/Updated rows: ${insertCount}`);
    console.log(`  Skipped courses (not in catalog): ${skipCount}`);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* transaction may not have started */ }
    console.error('❌ Error during import:', error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
