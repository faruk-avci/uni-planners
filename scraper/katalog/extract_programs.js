#!/usr/bin/env node
/**
 * Extracts "Zorunlu" (required) and "Seçmeli" (elective) program codes
 * from all downloaded ECTS PDFs and outputs a unified JSON.
 *
 * Usage: node extract_programs.js
 * Output: downloads/course_programs.json
 *
 * Requires: pdftotext (from poppler-utils)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

function extractProgramCode(line) {
  // Lines look like: "BABUS-İşletme Lisans" or "BSCS-Bilgisayar Mühendisliği Lisans"
  // We want just the code before the dash: BABUS, BSCS, etc.
  const trimmed = line.trim();
  const dashIndex = trimmed.indexOf('-');
  if (dashIndex > 0) {
    return trimmed.substring(0, dashIndex).trim();
  }
  // Some lines may have spaces: "BSARCH (ENG)-Mimarlık..."
  return trimmed.split('-')[0].trim();
}

function parsePdfText(text) {
  const lines = text.split('\n');

  // Extract the course code from the "Ders Kodu" line
  let courseCode = '';
  for (const line of lines) {
    if (line.includes('Ders Kodu')) {
      const match = line.match(/Ders Kodu\s+(.+)/);
      if (match) {
        courseCode = match[1].trim().replace(/\s+/g, ' ');
      }
      break;
    }
  }

  // If not found via "Ders Kodu", try the first line (header)
  if (!courseCode) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.includes('AKTS')) {
        courseCode = trimmed;
        break;
      }
    }
  }

  // Find the "Dersi Alan Programlar" section and parse Zorunlu / Seçmeli
  let required = [];
  let elective = [];
  let currentSection = null; // 'zorunlu' or 'secmeli'
  let inProgramSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Start of program section
    if (line.includes('Dersi Alan Programlar')) {
      inProgramSection = true;
      // Check if Zorunlu or Seçmeli is on this same line
      if (trimmed.includes('Zorunlu')) {
        currentSection = 'zorunlu';
      } else if (trimmed.includes('Seçmeli')) {
        currentSection = 'secmeli';
      }
      continue;
    }

    // End of program section (next labeled field)
    if (inProgramSection && /^(Ders Kodu|Ders Adı|Öğretim Dili|Ders Türü)/.test(trimmed)) {
      break;
    }

    if (!inProgramSection) continue;

    // Section markers
    if (trimmed === 'Zorunlu') {
      currentSection = 'zorunlu';
      continue;
    }
    if (trimmed === 'Seçmeli') {
      currentSection = 'secmeli';
      continue;
    }

    // Program lines (contain a dash separating code from description)
    if (trimmed && trimmed.includes('-') && currentSection) {
      const code = extractProgramCode(trimmed);
      if (code && code.length >= 2) {
        if (currentSection === 'zorunlu') {
          required.push(code);
        } else {
          elective.push(code);
        }
      }
    }
  }

  return {
    code: courseCode.replace(/\s+/g, ''),  // "CS 101" -> "CS101"
    codeFormatted: courseCode,              // "CS 101"
    required: [...new Set(required)],
    elective: [...new Set(elective)]
  };
}

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

async function run() {
  const config = parseArgs();
  const baseDir = config.term 
    ? path.join(DOWNLOADS_DIR, termSlug(config.term))
    : DOWNLOADS_DIR;

  console.log(`📖 Scanning ECTS PDFs from ${baseDir}...`);
  if (!fs.existsSync(baseDir)) {
    console.error(`❌ Base directory does not exist: ${baseDir}`);
    process.exit(1);
  }

  // Collect all ECTS PDF paths
  const majorDirs = fs.readdirSync(baseDir)
    .filter(d => fs.statSync(path.join(baseDir, d)).isDirectory() && d !== 'offered_courses');

  let allPdfs = [];
  for (const dir of majorDirs) {
    const dirPath = path.join(baseDir, dir);
    const files = fs.readdirSync(dirPath)
      .filter(f => f.endsWith('_ECTS.pdf'));
    for (const f of files) {
      allPdfs.push(path.join(dirPath, f));
    }
  }

  console.log(`📋 Found ${allPdfs.length} ECTS PDFs across ${majorDirs.length} major directories.`);

  const results = {};
  let processed = 0;
  let errors = 0;

  for (const pdfPath of allPdfs) {
    try {
      const text = execSync(`pdftotext -layout "${pdfPath}" -`, {
        encoding: 'utf8',
        timeout: 10000
      });

      const parsed = parsePdfText(text);

      if (!parsed.code) {
        console.warn(`   ⚠️ Could not extract course code from: ${path.basename(pdfPath)}`);
        errors++;
        continue;
      }

      // Deduplicate: multiple sections (e.g. CS_101.A, CS_101.B) have the same ECTS content
      // Use the base course code (without section letter) as key
      if (!results[parsed.code]) {
        results[parsed.code] = {
          code: parsed.code,
          codeFormatted: parsed.codeFormatted,
          required: parsed.required,
          elective: parsed.elective
        };
      }

      processed++;
    } catch (err) {
      console.error(`   ❌ Error processing ${path.basename(pdfPath)}: ${err.message}`);
      errors++;
    }
  }

  // Sort by course code
  const sortedKeys = Object.keys(results).sort();
  const sortedResults = sortedKeys.map(k => results[k]);

  const outputPath = path.join(baseDir, 'course_programs.json');
  fs.writeFileSync(outputPath, JSON.stringify(sortedResults, null, 2));

  console.log(`\n🎉 Done!`);
  console.log(`   Processed: ${processed} PDFs`);
  console.log(`   Unique courses: ${sortedResults.length}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Output: ${outputPath}`);
}

run();
