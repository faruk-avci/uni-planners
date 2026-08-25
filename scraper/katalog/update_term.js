#!/usr/bin/env node
/**
 * Complete term refresh:
 *   1. Offerings Excel and course documents download in parallel.
 *   2. Excel/PDF processors run in parallel after downloads finish.
 *   3. Validated catalog and syllabus assessments are imported sequentially.
 */

import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  const config = { term: '', pdfConcurrency: 2, headless: true, importData: true, help: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--term') config.term = String(args[++i] || '').trim();
    else if (args[i] === '--pdf-concurrency') config.pdfConcurrency = Math.min(8, Math.max(1, parseInt(args[++i], 10) || 2));
    else if (args[i] === '--headless') config.headless = args[++i] !== 'false';
    else if (args[i] === '--no-import' || args[i] === '--prepare-only') config.importData = false;
    else if (args[i] === '--help' || args[i] === '-h') config.help = true;
    else throw new Error(`Unknown option: ${args[i]}`);
  }
  return config;
}

function printHelp() {
  console.log(`
UniPlanners term updater

Usage:
  npm run term:update -- --term "2026 - 2027 Güz"

Options:
  --term LABEL          Exact term label shown in SIS (required)
  --prepare-only        Download and process files without importing them
  --no-import           Backward-compatible alias for --prepare-only
  --pdf-concurrency N   Parallel document bots, from 1 to 8 (default: 2)
  --headless false      Show Chromium for SIS debugging
  --help                Show this help

Pipeline:
  1. Download offered-course Excel files and ECTS/syllabus PDFs
  2. Process program mappings and syllabus assessment weights
  3. Validate outputs and atomically import them into PostgreSQL
`);
}

function assertPrerequisites() {
  const pdfTool = spawnSync('pdftotext', ['-v'], { stdio: 'ignore' });
  if (pdfTool.error?.code === 'ENOENT') {
    throw new Error('pdftotext is missing. On Ubuntu install it with: sudo apt install poppler-utils');
  }
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
  if (config.help) {
    printHelp();
    return;
  }
  if (!config.term) {
    printHelp();
    process.exit(1);
  }

  assertPrerequisites();
  const outputDir = path.join(__dirname, 'downloads', termSlug(config.term));
  console.log('\nUniPlanners term update');
  console.log(`  Term: ${config.term}`);
  console.log(`  Mode: ${config.importData ? 'download, process, and import' : 'prepare only; database unchanged'}`);
  console.log(`  Output: ${outputDir}`);
  console.log(`  Document bots: ${config.pdfConcurrency}`);

  const termArgs = ['--term', config.term];
  console.log('\n[1/3] Downloading offerings and course documents');
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

  console.log('\n[2/3] Processing and validating downloaded files');
  await Promise.all([
    runNode('extract_programs.js', [...termArgs, '--output', 'course_programs_pdf.json']),
    runNode('build_program_mappings.js', [...termArgs, '--output', 'course_programs_fallback.json']),
    runNode('parse_assessments.js', termArgs)
  ]);
  await runNode('merge_program_mappings.js', termArgs);
  validateProcessorOutputs(config.term);

  if (!config.importData) {
    console.log(`\nPreparation complete. Review ${outputDir} before running the import.`);
    return;
  }

  console.log('\n[3/3] Importing the validated term into PostgreSQL');
  await runNode('import_all_offerings.js', termArgs);
  await runNode('import_assessments.js', termArgs);
  updateBackendTerm(config.term);

  console.log(`\nTerm refresh complete: ${config.term}`);
  console.log('Restart the backend so CATALOG_TERM and its in-memory catalog refresh immediately.');
}

run().catch(error => {
  console.error(`\nTerm refresh failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
