#!/usr/bin/env node
/**
 * download_all.js
 * 
 * Downloads the offerings Excel sheets and ECTS/Syllabus PDFs for all subjects in a single command.
 * 
 * Usage: node download_all.js [--term "Term Name"]
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function main() {
  const config = parseArgs();
  const termArg = config.term ? ` --term "${config.term}"` : '';

  console.log(`\n==================================================`);
  console.log(`📥 1. DOWNLOADING OFFERINGS EXCEL SHEETS...`);
  console.log(`==================================================\n`);
  try {
    execSync(`node scrape_offerings.js${termArg}`, { stdio: 'inherit', cwd: __dirname });
  } catch (err) {
    console.error('❌ Failed during offerings Excel download:', err.message);
    process.exit(1);
  }

  console.log(`\n==================================================`);
  console.log(`📥 2. DOWNLOADING ECTS & SYLLABUS PDFS...`);
  console.log(`==================================================\n`);
  try {
    execSync(`node run_all.js${termArg}`, { stdio: 'inherit', cwd: __dirname });
  } catch (err) {
    console.error('❌ Failed during ECTS & Syllabus PDF download:', err.message);
    process.exit(1);
  }

  console.log(`\n🎉 All downloads completed successfully!`);
}

main().catch(console.error);
