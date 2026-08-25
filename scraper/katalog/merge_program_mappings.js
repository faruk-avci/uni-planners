#!/usr/bin/env node
/** Merge curriculum fallback mappings with authoritative mappings from ECTS PDFs. */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function valueAfter(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function termSlug(term) {
  return term.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
}

function normalizeCode(value) {
  return String(value || '').replace(/\s+/g, '').toLocaleUpperCase('tr-TR');
}

function readMappings(filePath) {
  const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(value)) throw new Error(`${path.basename(filePath)} is not an array.`);
  return value;
}

const term = valueAfter('--term');
if (!term) {
  console.error('Usage: node merge_program_mappings.js --term "2025 - 2026 Bahar"');
  process.exit(1);
}

const baseDir = path.join(__dirname, 'downloads', termSlug(term));
const fallbackPath = path.join(baseDir, valueAfter('--fallback', 'course_programs_fallback.json'));
const pdfPath = path.join(baseDir, valueAfter('--pdf', 'course_programs_pdf.json'));
const outputPath = path.join(baseDir, valueAfter('--output', 'course_programs.json'));
const fallback = readMappings(fallbackPath);
const pdf = readMappings(pdfPath);

const merged = new Map();
for (const item of fallback) {
  const code = normalizeCode(item.code);
  if (code) merged.set(code, { ...item, code });
}

// A course present in an ECTS PDF replaces the fallback completely, including
// intentionally empty required/elective lists. Courses without a usable ECTS
// PDF retain their curriculum-index fallback.
for (const item of pdf) {
  const code = normalizeCode(item.code);
  if (!code) continue;
  merged.set(code, {
    code,
    ...(item.codeFormatted ? { codeFormatted: item.codeFormatted } : {}),
    required: [...new Set(item.required || [])].sort(),
    elective: [...new Set(item.elective || [])].sort()
  });
}

const result = [...merged.values()].sort((left, right) => left.code.localeCompare(right.code, 'tr'));
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Merged ${pdf.length} PDF mappings over ${fallback.length} fallbacks; wrote ${result.length} courses to ${outputPath}`);
