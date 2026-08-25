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
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const execFileAsync = promisify(execFile);

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
    term: '',
    output: 'course_programs.json',
    concurrency: 6
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--term') {
      config.term = args[i + 1] || '';
      i++;
    } else if (args[i] === '--output') {
      config.output = args[i + 1] || config.output;
      i++;
    } else if (args[i] === '--concurrency') {
      config.concurrency = Math.max(1, Number.parseInt(args[i + 1], 10) || config.concurrency);
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

  allPdfs.sort();
  const parsedPdfs = new Array(allPdfs.length);
  const errorDetails = [];
  let cursor = 0;

  async function worker() {
    while (cursor < allPdfs.length) {
      const index = cursor++;
      const pdfPath = allPdfs[index];
      const processingPath = /[^\x00-\x7f]/.test(pdfPath)
        ? path.join(os.tmpdir(), `ozu-ects-${process.pid}-${index}.pdf`)
        : pdfPath;
      try {
        // Some Windows pdftotext distributions cannot open paths containing
        // a dotted capital İ. Use an ASCII temporary path when necessary.
        if (processingPath !== pdfPath) fs.copyFileSync(pdfPath, processingPath);
        let text = '';
        let lastError = null;
        for (let attempt = 1; attempt <= 2 && !text; attempt++) {
          try {
            const result = await execFileAsync('pdftotext', ['-layout', processingPath, '-'], {
              encoding: 'utf8',
              timeout: 20000,
              maxBuffer: 10 * 1024 * 1024,
              windowsHide: true
            });
            text = result.stdout;
          } catch (error) {
            lastError = error;
          }
        }
        if (!text) throw lastError || new Error('pdftotext returned no content.');
        const parsed = parsePdfText(text);
        if (!parsed.code) throw new Error('Course code could not be extracted.');
        parsedPdfs[index] = parsed;
      } catch (error) {
        errorDetails.push({ file: pdfPath, error: error.message });
      } finally {
        if (processingPath !== pdfPath && fs.existsSync(processingPath)) {
          fs.unlinkSync(processingPath);
        }
      }
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(config.concurrency, allPdfs.length) },
    () => worker()
  ));

  const results = {};
  let processed = 0;
  for (const parsed of parsedPdfs) {
    if (!parsed) continue;
    if (!results[parsed.code]) {
      results[parsed.code] = {
        code: parsed.code,
        codeFormatted: parsed.codeFormatted,
        required: parsed.required,
        elective: parsed.elective
      };
    }
    processed++;
  }
  const errors = errorDetails.length;

  // Sort by course code
  const sortedKeys = Object.keys(results).sort();
  const sortedResults = sortedKeys.map(k => results[k]);

  const outputPath = path.join(baseDir, path.basename(config.output));
  fs.writeFileSync(outputPath, JSON.stringify(sortedResults, null, 2));
  const errorPath = path.join(baseDir, `${path.parse(config.output).name}_errors.json`);
  fs.writeFileSync(errorPath, `${JSON.stringify(errorDetails, null, 2)}\n`);

  console.log(`\n🎉 Done!`);
  console.log(`   Processed: ${processed} PDFs`);
  console.log(`   Unique courses: ${sortedResults.length}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Output: ${outputPath}`);
  if (allPdfs.length === 0 || sortedResults.length === 0 || errors > 0) {
    console.error('ECTS extraction did not pass validation; refusing to continue the term pipeline.');
    process.exitCode = 1;
  }
}

run();
