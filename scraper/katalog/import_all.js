#!/usr/bin/env node
/**
 * import_all.js
 * 
 * Extracts programs and assessments from downloaded PDFs, and imports
 * offerings, programs, and assessments into the database.
 * 
 * Usage: node import_all.js [--term "Term Name"]
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
  console.log(`🔍 1. EXTRACTING ECTS PROGRAM REQUIREMENT CODES...`);
  console.log(`==================================================\n`);
  try {
    execSync(`node extract_programs.js${termArg}`, { stdio: 'inherit', cwd: __dirname });
  } catch (err) {
    console.error('❌ Failed during program extraction:', err.message);
    process.exit(1);
  }

  console.log(`\n==================================================`);
  console.log(`🗄️ 2. IMPORTING OFFERINGS & ECTS PROGRAMS INTO DB...`);
  console.log(`==================================================\n`);
  try {
    execSync(`node import_all_offerings.js${termArg}`, { stdio: 'inherit', cwd: __dirname });
  } catch (err) {
    console.error('❌ Failed during offerings and ECTS import:', err.message);
    process.exit(1);
  }

  console.log(`\n==================================================`);
  console.log(`🔍 3. PARSING ASSESSMENT METHODS & WEIGHTS FROM SYLLABI...`);
  console.log(`==================================================\n`);
  try {
    execSync(`node parse_assessments.js${termArg}`, { stdio: 'inherit', cwd: __dirname });
  } catch (err) {
    console.error('❌ Failed during assessment parsing:', err.message);
    process.exit(1);
  }

  console.log(`\n==================================================`);
  console.log(`🗄️ 4. IMPORTING ASSESSMENTS INTO DB...`);
  console.log(`==================================================\n`);
  try {
    execSync(`node import_assessments.js${termArg}`, { stdio: 'inherit', cwd: __dirname });
  } catch (err) {
    console.error('❌ Failed during assessment import:', err.message);
    process.exit(1);
  }

  console.log(`\n🎉 All parsing and database imports completed successfully!`);
}

main().catch(console.error);
