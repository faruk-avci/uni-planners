#!/usr/bin/env node
/**
 * Complete term refresh:
 *   1. Offerings Excel and course documents download in parallel.
 *   2. Excel/PDF processors run in parallel after downloads finish.
 *   3. Validated catalog and syllabus assessments are imported sequentially.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  const config = { term: '', pdfConcurrency: 2, headless: true, importData: true };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--term') config.term = String(args[++i] || '').trim();
    else if (args[i] === '--pdf-concurrency') config.pdfConcurrency = Math.max(1, parseInt(args[++i], 10) || 2);
    else if (args[i] === '--headless') config.headless = args[++i] !== 'false';
    else if (args[i] === '--no-import') config.importData = false;
  }
  return config;
}

function termSlug(term) {
  return term.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
}

function runNode(script, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, script), ...args], {
      cwd: __dirname,
      stdio: 'inherit'
    });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}.`));
    });
  });
}

function validateProcessorOutputs(term) {
  const baseDir = path.join(__dirname, 'downloads', termSlug(term));
  const programsPath = path.join(baseDir, 'course_programs.json');
  const assessmentsPath = path.join(baseDir, 'assessments.json');
  if (!fs.existsSync(programsPath)) throw new Error('course_programs.json was not produced.');
  if (!fs.existsSync(assessmentsPath)) throw new Error('assessments.json was not produced.');
  const programs = JSON.parse(fs.readFileSync(programsPath, 'utf8'));
  const assessments = JSON.parse(fs.readFileSync(assessmentsPath, 'utf8'));
  if (!Array.isArray(programs) || programs.length === 0) throw new Error('ECTS processor produced no course mappings.');
  if (!assessments || Array.isArray(assessments) || typeof assessments !== 'object') {
    throw new Error('Syllabus processor output is invalid.');
  }
  if (Object.keys(assessments).length === 0) {
    throw new Error('Syllabus processor produced no assessment mappings.');
  }
  console.log(`Processor validation: ${programs.length} ECTS mappings, ${Object.keys(assessments).length} assessed courses.`);
}

function updateBackendTerm(term) {
  const envPath = path.join(__dirname, '..', '..', 'backend', '.env');
  if (!fs.existsSync(envPath)) return;
  const original = fs.readFileSync(envPath, 'utf8');
  const line = `CATALOG_TERM=${term}`;
  const updated = /^CATALOG_TERM=.*$/m.test(original)
    ? original.replace(/^CATALOG_TERM=.*$/m, line)
    : `${original.replace(/\s*$/, '')}\n${line}\n`;
  fs.writeFileSync(envPath, updated);
}

async function run() {
  const config = parseArgs();
  if (!config.term) {
    console.error('Usage: npm run update-term -- --term "2026 - 2027 Guz"');
    process.exit(1);
  }

  const termArgs = ['--term', config.term];
  console.log('\n=== Phase 1: parallel downloads ===');
  await Promise.all([
    runNode('scrape_offerings.js', [...termArgs, '--headless', String(config.headless)]),
    runNode('run_documents.js', [
      ...termArgs,
      '--headless', String(config.headless),
      '--concurrency', String(config.pdfConcurrency)
    ])
  ]);

  // On a resumed run the document bot may have inspected old metadata before
  // the parallel Excel bot finished. Re-run its inexpensive completeness pass
  // now that every offered-course file is present; complete subjects skip
  // without opening a browser and any missing sections are retried.
  await runNode('run_documents.js', [
    ...termArgs,
    '--headless', String(config.headless),
    '--concurrency', String(config.pdfConcurrency)
  ]);

  console.log('\n=== Phase 2: parallel processors ===');
  await Promise.all([
    runNode('extract_programs.js', [...termArgs, '--output', 'course_programs_pdf.json']),
    runNode('build_program_mappings.js', [...termArgs, '--output', 'course_programs_fallback.json']),
    runNode('parse_assessments.js', termArgs)
  ]);
  await runNode('merge_program_mappings.js', termArgs);
  validateProcessorOutputs(config.term);

  if (!config.importData) {
    console.log('\nDownloads and processors completed. Database import skipped by --no-import.');
    return;
  }

  console.log('\n=== Phase 3: database import ===');
  await runNode('import_all_offerings.js', termArgs);
  await runNode('import_assessments.js', termArgs);
  updateBackendTerm(config.term);

  console.log('\nTerm refresh complete. Restart the backend so CATALOG_TERM and its in-memory catalog refresh immediately.');
}

run().catch(error => {
  console.error(`\nTerm refresh failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
