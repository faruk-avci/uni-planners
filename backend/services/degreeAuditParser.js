import { execFileSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

// Converts a Turkish-style "171,00" or an English-style "171.00" into a number.
const parseCreditNumber = str => parseFloat(String(str).replace(',', '.'));

export function extractPdfText(buffer) {
  const tmpPath = path.join(tmpdir(), `degree-audit-${randomUUID()}.pdf`);
  writeFileSync(tmpPath, buffer);
  try {
    return execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', tmpPath, '-'], {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
  } finally {
    if (existsSync(tmpPath)) unlinkSync(tmpPath);
  }
}

/**
 * Parses the text of an Özyeğin "Mezuniyet Denetim Raporu" (degree audit).
 *
 * Deliberately does NOT rely on the "Alan Yükümlülükleri" summary table —
 * pdftotext's column alignment for it is unreliable (label and data rows can
 * end up offset by one or more lines, confirmed against a real sample).
 * Instead, credit thresholds are read from the "Ders sayısı en az X olmalı...
 * Tamamlanan kredi toplamı en az Y olmalı" sentence that reliably follows each
 * area's own heading in the DETAYLI ANALİZ section.
 *
 * Taken-course credit/grade columns have the same alignment problem on short
 * tables, so only the course code is trusted from the PDF; credits are looked
 * up from our own catalog at match time instead.
 */
export function parseDegreeAuditText(text) {
  const degreeMatch = text.match(/Derece\s*-\s*([A-ZÇĞİÖŞÜ]+)-/);
  if (!degreeMatch) {
    throw new Error('Degree code could not be found in this report');
  }
  const degreeCode = degreeMatch[1];

  const lines = text.split(/\r?\n/);
  const areas = []; // { label, credits, headingLine }
  const thresholdRe = /Tamamlanan kredi toplamı en az\s+([\d.,]+)\s+olmal/i;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(thresholdRe);
    if (!match) continue;
    let label = '';
    let headingLine = -1;
    for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
      const candidate = lines[j].trim();
      if (candidate) { label = candidate; headingLine = j; break; }
    }
    label = label.replace(/\s+(EKSİK|TAMAM)\s*$/i, '').trim();
    if (!label || headingLine < 0) continue;
    areas.push({ label, credits: parseCreditNumber(match[1]), headingLine });
  }
  const areaThresholds = areas.map(({ label, credits }) => ({ label, credits }));

  // Not a real subject prefix — a grade-status word that can collide with the
  // subject+number pattern when pdftotext merges adjacent rows on some of the
  // report's smaller tables.
  const NOT_A_SUBJECT = new Set(['DEVAM', 'TAMAM', 'EKSIK', 'EKSİK']);

  const takenCodes = new Set();
  const courseRowRe = /\b([A-ZÇĞİÖŞÜ]{2,6})\s{1,20}(\d{2,4}[A-Z]?)\b[^\n]*\b(?:UG|GR)\b/g;
  let rowMatch;
  while ((rowMatch = courseRowRe.exec(text))) {
    if (NOT_A_SUBJECT.has(rowMatch[1])) continue;
    takenCodes.add(`${rowMatch[1]}${rowMatch[2]}`.toUpperCase());
  }

  // The internship ("Staj") table is small enough that pdftotext sometimes
  // splits a single row's subject+number and its "UG"/grade columns onto
  // different lines entirely, defeating the UG-anchored pattern above. Its
  // block only ever contains real completed-course rows, so within its
  // bounds a bare subject+number pair is trusted without requiring "UG".
  const stajArea = areas.find(a => /staj|internship/i.test(a.label));
  if (stajArea) {
    const nextHeading = areas.find(a => a.headingLine > stajArea.headingLine);
    const endLine = nextHeading ? nextHeading.headingLine : Math.min(lines.length, stajArea.headingLine + 15);
    const looseRe = /\b([A-ZÇĞİÖŞÜ]{2,6})\s{1,20}(\d{2,4}[A-Z]?)\b/g;
    for (let i = stajArea.headingLine; i < endLine; i++) {
      let m;
      while ((m = looseRe.exec(lines[i]))) {
        if (NOT_A_SUBJECT.has(m[1])) continue;
        takenCodes.add(`${m[1]}${m[2]}`.toUpperCase());
      }
    }
  }

  // "Ders Kişiselleştirme" (course substitution) table: the university may
  // accept a course the student actually took as satisfying a *different*
  // requirement slot (e.g. CS 112 counted toward a MATH 112 requirement).
  // pdftotext renders this specific table with its right column shifted up by
  // one row relative to the left column — confirmed against the real sample —
  // so rather than trust row adjacency, the two columns are collected
  // separately by horizontal position (course codes right of column ~20 are
  // the curriculum-side course; codes/dashes left of it are the student's
  // actual course, "-" meaning an unconditional waiver) and zipped by order.
  const substitutions = [];
  const substStart = lines.findIndex(l => /^\s*Ders Kişiselleştirme\b/.test(l));
  if (substStart >= 0) {
    const substEnd = lines.findIndex((l, i) => i > substStart && /^Not Ortalamaları/i.test(l));
    const endLine = substEnd >= 0 ? substEnd : lines.length;
    const codeRe = /[A-ZÇĞİÖŞÜ]{2,6}\s+\d{2,4}[A-Z]?/;
    const studentCourses = [];
    const areaCourses = [];
    for (let i = substStart + 1; i < endLine; i++) {
      const line = lines[i];
      const left = line.slice(0, 20);
      const right = line.slice(20);
      const leftMatch = left.match(codeRe);
      if (leftMatch) studentCourses.push(leftMatch[0].replace(/\s+/g, '').toUpperCase());
      else if (left.trim() === '-') studentCourses.push(null);
      const rightMatch = right.match(codeRe);
      if (rightMatch) areaCourses.push(rightMatch[0].replace(/\s+/g, '').toUpperCase());
    }
    for (let i = 0; i < Math.min(studentCourses.length, areaCourses.length); i++) {
      substitutions.push({ studentCourse: studentCourses[i], areaCourse: areaCourses[i] });
    }
  }

  return { degreeCode, areaThresholds, takenCourseCodes: [...takenCodes], substitutions };
}
