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

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const OUTPUT_FILE = path.join(DOWNLOADS_DIR, 'assessments.json');

// ── Category normalization map ──
function normalizeCategory(rawType) {
  const t = rawType.toLowerCase().trim();
  if (/lab|laboratory|laboratories/.test(t)) return 'lab';
  if (/project|proje|studio|portfolio|sketch/.test(t)) return 'project';
  if (/presentation|sunum/.test(t)) return 'presentation';
  if (/report|rapor/.test(t)) return 'report';
  if (/homework|hw|ödev|assignment|cpg|classroom/.test(t)) return 'homework';
  if (/quiz|task|exercise/.test(t)) return 'quiz';
  if (/attend[ae]nce|katılım/.test(t)) return 'attendance';
  if (/final|büt/.test(t)) return 'final';
  if (/midterm|mid-term|mid term|mid-jury|mid jury|review|jury|exam|vize|sınav/.test(t)) return 'midterm';
  return 'other';
}

// ── Parse weight string into a numeric value ──
function parseWeight(weightStr) {
  if (!weightStr) return null;
  // Match a percentage or number like "40%" or "40"
  const m = weightStr.match(/(\d+(?:\.\d+)?)\s*%?/i);
  if (m) return parseFloat(m[1]);

  // Point to null if not parsed
  return null;
}

// ── Extract assessment rows from the text between ASSESSMENT METHODS and Total ──
function extractAssessments(fullText) {
  // Find the ASSESSMENT METHODS section
  const startMatch = fullText.match(/ASSESSMENT\s+METHODS[\s,]+WEIGHTS\s+AND\s+RULES/i);
  if (!startMatch) return null;

  const startIdx = startMatch.index + startMatch[0].length;
  const afterSection = fullText.substring(startIdx);

  // Find the "Total" line that ends the table
  const totalMatch = afterSection.match(/^\s*Total\s+100\s*%?/im);
  const endIdx = totalMatch ? totalMatch.index + totalMatch[0].length : Math.min(afterSection.length, 3000);
  const sectionText = afterSection.substring(0, endIdx);

  const lines = sectionText.split('\n');
  const assessments = [];

  // Aggressive structural pattern: Group 1 matches Type, Group 2 matches Weight
  const typePattern = /^\s{0,10}([A-Za-zÇĞİÖŞÜa-zçğıöşü0-9/\-&,:\'\(\)\.#+_*’][A-Za-zÇĞİÖŞÜa-zçğıöşü0-9/\-&,:\'\(\)\.#+_*’ ]*?)\s{2,}(\d+(?:\.\d+)?\s*%?|up\s+to\s+\d+(?:\.\d+)?\s*%?|No|Mandatory|-|bonus)\b/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(typePattern);
    if (!match) continue;

    const rawType = match[1].trim();
    const weightRaw = match[2].trim();

    // The weight column must start within the first 38 characters of the line to prevent column 3 mismatching
    const matchIndex = line.indexOf(match[0]);
    const weightIndexInLine = matchIndex + match[0].length - match[2].length;
    if (weightIndexInLine > 38) continue;

    if (rawType.toLowerCase().startsWith('total')) continue;

    const weightVal = parseWeight(weightRaw);
    let typeAccumulator = rawType;
    const matchedLines = [line];

    // Look-ahead to capture multi-line type names
    let j = i + 1;
    let emptyCount = 0;
    while (j < lines.length) {
      const nextLine = lines[j];
      
      const nextMatch = nextLine.match(typePattern);
      if (nextMatch) {
        const nextMatchIndex = nextLine.indexOf(nextMatch[0]);
        const nextWeightIndex = nextMatchIndex + nextMatch[0].length - nextMatch[2].length;
        if (nextWeightIndex <= 38) {
          break; // Valid next assessment row
        }
      }

      // Check if first column has text (non-space within the first 12 characters)
      const firstColumnMatch = nextLine.match(/^\s{0,12}([A-Za-zÇĞİÖŞÜa-zçğıöşü0-9/\-&,:\'\(\)\.#+_*’][A-Za-zÇĞİÖŞÜa-zçğıöşü0-9/\-&,:\'\(\)\.#+_*’ ]*?)(?:\s{2,}|\s*$)/i);
      if (firstColumnMatch) {
        const text = firstColumnMatch[1].trim();
        if (text && !text.toLowerCase().startsWith('total') && !/^\d+(?:\.\d+)?\s*%?$/.test(text)) {
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

// ── Get course code from filename: "CS_101.A_Syllabus.pdf" → "CS 101" ──
function getCourseCode(filename) {
  // Pattern: SUBJ_NUM.SECTION_Syllabus.pdf or SUBJ_NUM.SEC_Syllabus.pdf
  const m = filename.match(/^([A-ZÇĞİÖŞÜa-zçğıöşü]+)_(\d+[A-Z]?)(?:\.\w+)?_Syllabus\.pdf$/i);
  if (!m) return null;
  return `${m[1].toUpperCase()} ${m[2]}`;
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

// ── Main ──
async function main() {
  const config = parseArgs();
  const baseDir = config.term 
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

  for (const subj of subjects) {
    const dir = path.join(baseDir, subj);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('_Syllabus.pdf'));

    for (const file of files) {
      totalPdfs++;
      const courseCode = getCourseCode(file);
      if (!courseCode) continue;

      // Skip if we already parsed this course code (sections often share syllabi)
      if (results[courseCode]) {
        skippedDupe++;
        continue;
      }

      const filePath = path.join(dir, file);
      let text;
      try {
        text = execSync(`pdftotext -layout "${filePath}" -`, {
          encoding: 'utf-8',
          timeout: 10000,
          stdio: ['pipe', 'pipe', 'pipe']
        });
      } catch (e) {
        empty++;
        continue;
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
