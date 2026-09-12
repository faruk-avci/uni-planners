#!/usr/bin/env node
/**
 * Overlay room assignments onto existing catalog_sections rows.
 *
 * Source is a hand-collected CSV (course_code,section_no,room) that is not
 * part of the SIS scrape -- import_all_offerings.js and import_manual_catalog.js
 * both TRUNCATE and reinsert catalog_sections, wiping this column, so run
 * this *after* either of those, not before.
 *
 * A room cell may list several rooms separated by ";" (a section that meets
 * in different rooms across its weekly schedule); stored as-is, formatted
 * for display where it's read.
 *
 * Usage:
 *   node import_rooms.js [--file /path/to/rooms.csv]
 *   (defaults to guz_2026_2027_rooms.csv at the repo root)
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { getDbConfig } from './db.js';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  const config = { file: path.join(__dirname, '..', '..', 'guz_2026_2027_rooms.csv') };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file') config.file = args[++i] || '';
    else throw new Error(`Unknown option: ${args[i]}`);
  }
  return config;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  const [header, ...rows] = lines;
  const cols = header.split(',').map(c => c.trim().toLowerCase());
  const codeIdx = cols.indexOf('course_code');
  const secIdx = cols.indexOf('section_no');
  const roomIdx = cols.indexOf('room');
  if (codeIdx === -1 || secIdx === -1 || roomIdx === -1) {
    throw new Error(`CSV header must have course_code,section_no,room columns (got: ${header})`);
  }
  return rows.map(line => {
    const cells = line.split(',');
    return {
      course_code: (cells[codeIdx] || '').trim().toUpperCase(),
      section_no: (cells[secIdx] || '').trim(),
      room: (cells[roomIdx] || '').trim() || null,
    };
  }).filter(r => r.course_code && r.section_no);
}

async function run() {
  const config = parseArgs();
  if (!config.file) {
    console.error('Usage: node import_rooms.js [--file /path/to/rooms.csv]');
    process.exit(1);
  }
  const filePath = path.resolve(config.file);
  if (!fs.existsSync(filePath)) {
    console.error(`File does not exist: ${filePath}`);
    process.exit(1);
  }

  console.log(`Reading ${filePath}...`);
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
  console.log(`Parsed ${rows.length} room rows.`);

  if (rows.length === 0) {
    console.error('Refusing to run against an empty CSV.');
    process.exit(1);
  }

  const client = new Client(getDbConfig());
  try {
    await client.connect();
    console.log(`Connected to PostgreSQL (${getDbConfig().database}).`);
    await client.query('ALTER TABLE catalog_sections ADD COLUMN IF NOT EXISTS room TEXT');

    await client.query('BEGIN');
    let matched = 0;
    const unmatched = [];
    for (const r of rows) {
      const { rowCount } = await client.query(
        'UPDATE catalog_sections SET room = $1 WHERE course_code = $2 AND section_no = $3',
        [r.room, r.course_code, r.section_no]
      );
      if (rowCount > 0) matched++;
      else unmatched.push(`${r.course_code} ${r.section_no}`);
    }
    await client.query('COMMIT');

    console.log(`Updated room for ${matched}/${rows.length} sections.`);
    if (unmatched.length > 0) {
      console.log(`${unmatched.length} row(s) had no matching section in catalog_sections (course not offered this term / different section code):`);
      console.log(unmatched.slice(0, 30).join(', ') + (unmatched.length > 30 ? ', …' : ''));
    }
  } catch (err) {
    console.error('Database operation failed:', err.message);
    try { await client.query('ROLLBACK'); } catch { /* connection may already be gone */ }
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
