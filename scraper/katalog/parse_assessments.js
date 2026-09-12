#!/usr/bin/env node
/**
 * parse_assessments.js
 * 
 * Extracts "ASSESSMENT METHODS, WEIGHTS AND RULES" sections from Syllabus PDFs,
 * parses the Type + Weight rows, normalizes categories, and outputs JSON.
 * 
 * Usage: node parse_assessments.js
 * Output: downloads/assessments.json
 */

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const OUTPUT_FILE = path.join(DOWNLOADS_DIR, 'assessments.json');

// pdftotext renders these syllabi's Turkish glyphs badly: Ğ/İ/Ş disappear
// entirely and Ö/Ü/Ç come through as U+FFFD. Folding to plain ASCII (and
// dropping U+FFFD) lets one set of patterns match both the clean text and the
// mangled text, e.g. "Ödev" arriving as "�dev" or "dev".
function foldTurkish(value) {
  return String(value)
    .replace(/�/g, '')
    .replace(/[ıİI]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c')
    .toLowerCase()
    .trim();
}

// ── Category normalization map ──
function normalizeCategory(rawType) {
  const t = foldTurkish(rawType);
  if (/lab|laboratuvar/.test(t)) return 'lab';
  if (/project|proje|studio|studyo|portfolio|sketch/.test(t)) return 'project';
  if (/presentation|sunum/.test(t)) return 'presentation';
  if (/report|rapor/.test(t)) return 'report';
  if (/homework|hw|odev|assignment|cpg|classroom/.test(t)) return 'homework';
  if (/quiz|task|exercise/.test(t)) return 'quiz';
  if (/attend[ae]nce|katilim|derse devam/.test(t)) return 'attendance';
  if (/final|butunleme|yariyil sonu|donem sonu/.test(t)) return 'final';
  if (/midterm|mid-term|mid term|mid-jury|mid jury|review|jury|exam|vize|sinav/.test(t)) return 'midterm';
  return 'other';
}

// ── Parse weight string into a numeric value ──
function parseWeight(weightStr) {
  if (!weightStr) return null;
  // "2 x 20%" is two assessments worth 20% each, i.e. 40% of the grade.
  const multiplied = weightStr.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  if (multiplied) return parseFloat(multiplied[1]) * parseFloat(multiplied[2]);

  // Match a percentage or number like "40%" or "40"
  const m = weightStr.match(/(\d+(?:\.\d+)?)\s*%?/i);
  if (m) return parseFloat(m[1]);

  // Point to null if not parsed
  return null;
}

// Turkish syllabi head the same table with "DEĞERLENDİRME YÖNTEMLERİ,
// AĞIRLIKLARI VE KURALLARI". Since pdftotext eats Ğ/İ/Ö there, each of those
// positions is matched with an optional wildcard rather than the real letter.
const SECTION_HEADERS = [
  /ASSESSMENT\s+METHODS[\s,]+WEIGHTS\s+AND\s+RULES/i,
  /DE.?ERLEND.?RME\s+Y.?NTEMLER.?[\s,]*A.?IRLIKLARI\s+VE\s+KURALLARI/i,
];

// ── Extract assessment rows from the text between ASSESSMENT METHODS and Total ──
function extractAssessments(fullText) {
  // Find the ASSESSMENT METHODS section, in either language
  let startIdx = -1;
  for (const header of SECTION_HEADERS) {
    const startMatch = fullText.match(header);
    if (startMatch) {
      startIdx = startMatch.index + startMatch[0].length;
      break;
    }
  }
  if (startIdx === -1) return null;

  const afterSection = fullText.substring(startIdx);

  // Find the "Total" line that ends the table. Turkish syllabi write the
  // percent sign ahead of the number ("Total %100") and sometimes say "Toplam".
  const totalMatch = afterSection.match(/^\s*(?:Total|Toplam)\s+(?:%\s*100|100\s*%?)/im);
  const endIdx = totalMatch ? totalMatch.index + totalMatch[0].length : Math.min(afterSection.length, 3000);
  const sectionText = afterSection.substring(0, endIdx);

  const lines = sectionText.split('\n');
  const assessments = [];

  // Aggressive structural pattern: Group 1 matches Type, Group 2 matches Weight
  // A bare number followed by ". " is an ordinal opening a sub-item ("1. ara
  // sinav  %30"), not the row's weight -- without the lookahead the row reads
  // as 1%.
  const typePattern = /^\s{0,10}([A-Za-zÇĞİÖŞÜa-zçğıöşü�0-9/\-&,:\'\(\)\.#+_*’][A-Za-zÇĞİÖŞÜa-zçğıöşü�0-9/\-&,:\'\(\)\.#+_*’ ]*?)\s{2,}(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*%?|%\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?(?!\s*\.\s)\s*%?|up\s+to\s+\d+(?:\.\d+)?\s*%?|No|Mandatory|-|bonus)\b/i;

  // pdftotext pads inside a type name too ("Midterm Exam  1  25%"), so the
  // loose pattern above would stop at the "1" and call it the weight. Trying a
  // percent-marked weight first makes the real column win; the loose pattern
  // stays as the fallback for rows written without a % ("Final Exam  40").
  const typePatternPct = /^\s{0,10}([A-Za-zÇĞİÖŞÜa-zçğıöşü�0-9/\-&,:\'\(\)\.#+_*’][A-Za-zÇĞİÖŞÜa-zçğıöşü�0-9/\-&,:\'\(\)\.#+_*’ ]*?)\s{2,}(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*%|%\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*%|up\s+to\s+\d+(?:\.\d+)?\s*%)(?=\s|$)/i;
  const matchTypeRow = line => line.match(typePatternPct) || line.match(typePattern);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = matchTypeRow(line);
    if (!match) continue;

    const rawType = match[1].trim();
    const weightRaw = match[2].trim();

    // The weight column must start within the first 38 characters of the line to prevent column 3 mismatching
    const matchIndex = line.indexOf(match[0]);
    const weightIndexInLine = matchIndex + match[0].length - match[2].length;
    if (weightIndexInLine > 38) continue;

    if (/^(total|toplam)/.test(foldTurkish(rawType))) continue;

    const weightVal = parseWeight(weightRaw);
    let typeAccumulator = rawType;
    const matchedLines = [line];

    // Look-ahead to capture multi-line type names
    let j = i + 1;
    let emptyCount = 0;
    while (j < lines.length) {
      const nextLine = lines[j];
      
      const nextMatch = matchTypeRow(nextLine);
      if (nextMatch) {
        const nextMatchIndex = nextLine.indexOf(nextMatch[0]);
        const nextWeightIndex = nextMatchIndex + nextMatch[0].length - nextMatch[2].length;
        if (nextWeightIndex <= 38) {
          break; // Valid next assessment row
        }
      }

      // Check if first column has text (non-space within the first 12 characters)
      const firstColumnMatch = nextLine.match(/^\s{0,12}([A-Za-zÇĞİÖŞÜa-zçğıöşü�0-9/\-&,:\'\(\)\.#+_*’][A-Za-zÇĞİÖŞÜa-zçğıöşü�0-9/\-&,:\'\(\)\.#+_*’ ]*?)(?:\s{2,}|\s*$)/i);
      if (firstColumnMatch) {
        const text = firstColumnMatch[1].trim();
        if (text && !/^(total|toplam)/.test(foldTurkish(text)) && !/^\d+(?:\.\d+)?\s*%?$/.test(text)) {
          typeAccumulator += " " + text;
          matchedLines.push(nextLine);
          emptyCount = 0; // Reset empty count
        } else {
          break;
        }
      } else {
        emptyCount++;
        if (emptyCount > 1) {
          break; // Break if we have more than 1 consecutive empty first column line
        }
      }
      j++;
    }

    assessments.push({
      type: typeAccumulator,
      category: normalizeCategory(typeAccumulator),
      weight: weightVal,
      raw: weightRaw,
      lines: matchedLines,
      startIndex: i
    });

    i = j - 1; // Advance loop past look-ahead lines
  }

  // Post-process to split compound "each" assessments
  const finalAssessments = [];
  for (const a of assessments) {
    const startIndex = a.startIndex;
    const scanEnd = Math.min(lines.length, startIndex + 5);

    let numItems = 1;
    let isEach = false;

    // Check for "each" keyword in the weight/rules columns of the 5-line window
    for (let k = startIndex; k < scanEnd; k++) {
      const parts = lines[k].split(/\s{2,}/);
      for (let p = 1; p < parts.length; p++) {
        const colText = parts[p].trim().toLowerCase();
        const hasEach = /\beach\b(?:\s*[\x22\x27),.!]|\s*$)/.test(colText) ||
                        /\beach\s+(?:is|has|having|carrying|weighing|of|to|will|must|should|represents|carries)\b/.test(colText) ||
                        /\beach\s*(?:is|having|carrying|weighing)?\s*\d/.test(colText);
        if (hasEach) {
          isEach = true;
          break;
        }
      }
      if (isEach) break;
    }
    if (a.raw) {
      const rawText = a.raw.toLowerCase();
      const hasEach = /\beach\b(?:\s*[\x22\x27),.!]|\s*$)/.test(rawText) ||
                      /\beach\s+(?:is|has|having|carrying|weighing|of|to|will|must|should|represents|carries)\b/.test(rawText) ||
                      /\beach\s*(?:is|having|carrying|weighing)?\s*\d/.test(rawText);
      if (hasEach) {
        isEach = true;
      }
    }

    // Accumulate all text in the window to find the count
    let windowText = "";
    for (let k = startIndex; k < scanEnd; k++) {
      windowText += " " + lines[k];
    }

    // Detect count of items (e.g. "Two Midterm Exams", "Midterm Exam (2)")
    if (/\b(?:two|2)\b/i.test(a.type) || /\b(?:two|2)\b/i.test(windowText)) numItems = 2;
    else if (/\b(?:three|3)\b/i.test(a.type) || /\b(?:three|3)\b/i.test(windowText)) numItems = 3;
    else if (/\b(?:four|4)\b/i.test(a.type) || /\b(?:four|4)\b/i.test(windowText)) numItems = 4;
    else if (/\b(?:five|5)\b/i.test(a.type) || /\b(?:five|5)\b/i.test(windowText)) numItems = 5;
    else if (/\b(?:ten|10)\b/i.test(a.type) || /\b(?:ten|10)\b/i.test(windowText)) numItems = 10;

    // Default to N=2 if it's plural and says "each" but has no explicit number
    if (isEach && numItems === 1) {
      if (/(?:exams|midterms|quizzes|projects|homeworks|assignments|tasks|studios|sketchbooks|portfolios|labs)$/i.test(a.type.trim()) ||
          /\b(?:exams|midterms|quizzes|projects|homeworks|assignments|tasks|studios|sketchbooks|portfolios|labs)\b/i.test(a.type)) {
        numItems = 2;
      }
    }

    // Only split if count > 1 AND isEach is true
    if (numItems > 1 && isEach) {
      let indWeight = a.weight;
      
      const eachWeightMatch = windowText.match(/(\d+(?:\.\d+)?)\s*%\s*each/i) || 
                               a.raw.match(/(\d+(?:\.\d+)?)\s*%\s*each/i) ||
                               windowText.match(/each\s*(?:is|having|carrying)?\s*(\d+(?:\.\d+)?)\s*%/i);
      
      if (eachWeightMatch) {
        indWeight = parseFloat(eachWeightMatch[1]);
      } else {
        if (a.weight && a.weight <= 30 && isEach) {
          indWeight = a.weight;
        } else if (a.weight) {
          indWeight = a.weight / numItems;
        }
      }

      // Generate clean singularized type name
      const cleanType = a.type
        .replace(/\(\s*\d+\s*\)/g, '')
        .replace(/\b(?:two|three|four|five|2|3|4|5)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      let singularType = cleanType;
      if (cleanType.toLowerCase().endsWith('exams')) {
        singularType = cleanType.substring(0, cleanType.length - 5) + 'Exam';
      } else if (cleanType.toLowerCase().endsWith('quizzes')) {
        singularType = cleanType.substring(0, cleanType.length - 7) + 'Quiz';
      } else if (cleanType.toLowerCase().endsWith('projects')) {
        singularType = cleanType.substring(0, cleanType.length - 8) + 'Project';
      } else if (cleanType.toLowerCase().endsWith('homeworks')) {
        singularType = cleanType.substring(0, cleanType.length - 9) + 'Homework';
      } else if (cleanType.toLowerCase().endsWith('assignments')) {
        singularType = cleanType.substring(0, cleanType.length - 11) + 'Assignment';
      }

      for (let k = 1; k <= numItems; k++) {
        finalAssessments.push({
          type: `${singularType} #${k}`,
          category: a.category,
          weight: indWeight,
          raw: `${indWeight}%`
        });
      }
    } else {
      const { lines, ...cleanA } = a;
      finalAssessments.push(cleanA);
    }
  }

  return finalAssessments.length > 0 ? finalAssessments : null;
}

// "CS 101L" is the lab component and "MATH 101R" the recitation of an existing
// course -- both are graded through the parent course, so neither gets its own
// row in the workload table.
function isLabOrRecitation(courseCode) {
  return /\d+[LR]$/i.test(String(courseCode).trim());
}

// ── Get course code from filename: "CS_101.A_Syllabus.pdf" → "CS 101" ──
function getCourseCode(filename) {
  // Pattern: SUBJ_NUM.SECTION_Syllabus.pdf or SUBJ_NUM.SEC_Syllabus.pdf
  const m = filename.match(/^([\p{L}]+)_(\d+[\p{L}]?)(?:\.[\p{L}\p{N}]+)?_Syllabus\.pdf$/iu);
  if (!m) return null;
  return `${m[1].toUpperCase()} ${m[2]}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    term: '',
    dir: '',
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--term') {
      config.term = args[i + 1] || '';
      i++;
    } else if (args[i] === '--dir') {
      config.dir = args[i + 1] || '';
      i++;
    }
  }
  return config;
}

function termSlug(term) {
  return term.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
}

// ── Main ──
async function main() {
  const config = parseArgs();
  const baseDir = config.dir
    ? path.resolve(config.dir)
    : config.term
      ? path.join(DOWNLOADS_DIR, termSlug(config.term))
      : DOWNLOADS_DIR;
  const outputFile = path.join(baseDir, 'assessments.json');

  console.log(`Scanning for Syllabus PDFs in ${baseDir}...`);
  if (!fs.existsSync(baseDir)) {
    console.error(`❌ Base directory does not exist: ${baseDir}`);
    process.exit(1);
  }

  const subjects = fs.readdirSync(baseDir).filter(d => {
    const full = path.join(baseDir, d);
    return fs.statSync(full).isDirectory() && d !== 'offered_courses';
  });

  const results = {};  // courseCode → assessments[]
  let totalPdfs = 0;
  let parsed = 0;
  let empty = 0;
  let noSection = 0;
  let skippedDupe = 0;
  let skippedLabRecitation = 0;

  for (const subj of subjects) {
    const dir = path.join(baseDir, subj);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('_Syllabus.pdf'));

    for (const file of files) {
      totalPdfs++;
      const courseCode = getCourseCode(file);
      if (!courseCode) continue;

      // Lab ("CS 101L") and recitation ("MATH 101R") codes are graded as part
      // of their parent course, so they don't belong in the workload table.
      if (isLabOrRecitation(courseCode)) {
        skippedLabRecitation++;
        continue;
      }

      // Skip if we already parsed this course code (sections often share syllabi)
      if (results[courseCode]) {
        skippedDupe++;
        continue;
      }

      const filePath = path.join(dir, file);
      const processingPath = /[^\x00-\x7f]/.test(filePath)
        ? path.join(os.tmpdir(), `ozu-syllabus-${process.pid}-${totalPdfs}.pdf`)
        : filePath;
      let text;
      try {
        if (processingPath !== filePath) fs.copyFileSync(filePath, processingPath);
        text = execFileSync('pdftotext', ['-table', processingPath, '-'], {
          encoding: 'utf-8',
          timeout: 10000,
          stdio: ['pipe', 'pipe', 'pipe']
        });
      } catch (e) {
        empty++;
        continue;
      } finally {
        if (processingPath !== filePath && fs.existsSync(processingPath)) {
          fs.unlinkSync(processingPath);
        }
      }

      if (!text || text.trim().length < 50) {
        empty++;
        continue;
      }

      const assessments = extractAssessments(text);
      if (!assessments) {
        noSection++;
        continue;
      }

      results[courseCode] = assessments;
      parsed++;
    }
  }

  // Write output
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2), 'utf-8');

  console.log(`\nResults:`);
  console.log(`  Total Syllabus PDFs: ${totalPdfs}`);
  console.log(`  Skipped (duplicate course): ${skippedDupe}`);
  console.log(`  Skipped (lab/recitation): ${skippedLabRecitation}`);
  console.log(`  Empty/image PDFs: ${empty}`);
  console.log(`  No assessment section: ${noSection}`);
  console.log(`  Successfully parsed: ${parsed}`);
  console.log(`  Unique courses with assessments: ${Object.keys(results).length}`);
  console.log(`\nOutput: ${outputFile}`);

  // Print a few samples
  const sampleCodes = ['CS 101', 'CS 202', 'EE 201', 'PHYS 102', 'ECON 101'];
  for (const code of sampleCodes) {
    if (results[code]) {
      console.log(`\n  ${code}:`);
      for (const a of results[code]) {
        console.log(`    ${a.type.padEnd(25)} ${String(a.weight ?? '-').padStart(5)}%  [${a.category}]`);
      }
    }
  }
}

main().catch(console.error);
