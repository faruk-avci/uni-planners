#!/usr/bin/env node
/** Run the ECTS/syllabus PDF bot for every active SIS subject. */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  const config = { term: '', concurrency: 2, headless: true, start: 1, end: 0, subjects: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--term') config.term = String(args[++i] || '').trim();
    else if (args[i] === '--concurrency') config.concurrency = Math.max(1, parseInt(args[++i], 10) || 2);
    else if (args[i] === '--headless') config.headless = args[++i] !== 'false';
    else if (args[i] === '--start') config.start = Math.max(1, parseInt(args[++i], 10) || 1);
    else if (args[i] === '--end') config.end = Math.max(0, parseInt(args[++i], 10) || 0);
    else if (args[i] === '--subjects') config.subjects = String(args[++i] || '').split(',').map(value => value.trim()).filter(Boolean);
  }
  return config;
}

function termSlug(term) {
  return term.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
}

function normalizeSubject(value) {
  return String(value || '').trim().replaceAll('\u00c4\u00b0', '\u0130');
}

function runSubject(subject, config) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [
      path.join(__dirname, 'scrape_documents.js'),
      '--subject', subject,
      '--term', config.term,
      '--headless', String(config.headless)
    ], { cwd: __dirname, stdio: 'inherit' });
    child.on('error', error => resolve({ subject, ok: false, error: error.message }));
    child.on('exit', code => resolve({ subject, ok: code === 0, error: code === 0 ? null : `exit ${code}` }));
  });
}

async function run() {
  const config = parseArgs();
  if (!config.term) {
    console.error('Usage: node run_documents.js --term "2026 - 2027 Guz" [--concurrency 2]');
    process.exit(1);
  }

  const codes = JSON.parse(fs.readFileSync(path.join(__dirname, 'codes.json'), 'utf8'));
  const allSubjects = codes.DATA.rows
    .filter(row => row.SUBJECTTYPE === '1')
    .map(row => normalizeSubject(row.NAME))
    .sort();
  const endIndex = config.end > 0 ? Math.min(config.end, allSubjects.length) : allSubjects.length;
  const subjects = config.subjects.length
    ? config.subjects.map(normalizeSubject)
    : allSubjects.slice(config.start - 1, endIndex);
  const queue = [...subjects];
  const results = [];
  console.log(`Document pipeline: ${subjects.length} subjects, concurrency ${config.concurrency}.`);

  async function worker() {
    while (queue.length > 0) {
      const subject = queue.shift();
      const result = await runSubject(subject, config);
      results.push(result);
      console.log(`[documents] ${subject}: ${result.ok ? 'complete' : `FAILED (${result.error})`}`);
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(config.concurrency, subjects.length) },
    () => worker()
  ));

  const report = {
    term: config.term,
    generatedAt: new Date().toISOString(),
    successful: results.filter(result => result.ok).map(result => result.subject).sort(),
    failed: results.filter(result => !result.ok).map(result => ({ subject: result.subject, error: result.error }))
  };
  const reportPath = path.join(__dirname, 'downloads', termSlug(config.term), 'documents_report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Document report: ${reportPath}`);

  if (report.failed.length > 0) {
    console.error(`Document pipeline failed for: ${report.failed.map(item => item.subject).join(', ')}`);
    process.exitCode = 1;
  }
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
