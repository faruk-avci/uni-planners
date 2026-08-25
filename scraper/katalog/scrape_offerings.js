#!/usr/bin/env node
/**
 * Download offered-course Excel files from the OZU SIS.
 *
 * Examples:
 *   node scrape_offerings.js --term "2025 - 2026 Bahar"
 *   node scrape_offerings.js --term "2025 - 2026 Bahar" --subjects "EE,ANTH"
 *   node scrape_offerings.js --term "2025 - 2026 Bahar" --start 1 --end 33
 */

import { chromium } from 'playwright';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OFFERINGS_URL = 'https://sis.ozyegin.edu.tr/OZU_GWT/WEB/CourseCatalogOfferUI?locale=tr';

function parseArgs() {
  const args = process.argv.slice(2);
  const config = { headless: true, term: '', max: 0, start: 1, end: 0, subjects: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--headless') {
      config.headless = args[i + 1] !== 'false';
      i++;
    } else if (args[i] === '--term') {
      config.term = args[i + 1] || '';
      i++;
    } else if (args[i] === '--max') {
      config.max = parseInt(args[i + 1], 10) || 0;
      i++;
    } else if (args[i] === '--start') {
      config.start = Math.max(1, parseInt(args[i + 1], 10) || 1);
      i++;
    } else if (args[i] === '--end') {
      config.end = Math.max(0, parseInt(args[i + 1], 10) || 0);
      i++;
    } else if (args[i] === '--subjects') {
      config.subjects = String(args[i + 1] || '').split(',').map(value => value.trim()).filter(Boolean);
      i++;
    }
  }
  return config;
}

function termSlug(term) {
  return term.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
}

function normalizeSubject(value) {
  return String(value || '').trim().replaceAll('\u00c4\u00b0', '\u0130');
}

function validateOfferingFile(filePath, expectedSubject) {
  try {
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(worksheet);
    return rows.length > 0 && rows.every(row => (
      String(row.SUBJECT || '').trim().toUpperCase() === expectedSubject.toUpperCase()
    ));
  } catch {
    return false;
  }
}

async function selectTerm(page, term) {
  const input = page.locator('input[name="TERMCODE"]');
  await input.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => {
    const value = document.querySelector('input[name="TERMCODE"]')?.value?.trim();
    return value && value !== 'Loading...';
  }, { timeout: 30000 });

  if (!term || (await input.inputValue()).trim() === term.trim()) return true;

  await input.click();
  await input.press('Control+A');
  await input.press('Backspace');
  await input.type(term.trim().split(/\s+/).pop(), { delay: 80 });
  await page.waitForTimeout(1500);

  let optionHandle;
  try {
    optionHandle = await page.waitForFunction(expected => {
      const option = Array.from(document.querySelectorAll('*')).find(element => (
        element.children.length === 0
        && element.textContent.trim() === expected
        && element.getBoundingClientRect().width > 0
      ));
      if (!option) return null;
      const rect = option.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, term.trim(), { timeout: 15000 });
  } catch {
    throw new Error(`Term option "${term}" did not load.`);
  }

  const optionBox = await optionHandle.jsonValue();
  await page.mouse.click(optionBox.x, optionBox.y);
  await page.waitForFunction(expected => (
    document.querySelector('input[name="TERMCODE"]')?.value?.trim() === expected
  ), term.trim(), { timeout: 10000 });
  return true;
}

async function preparePage(page, term) {
  await page.goto(OFFERINGS_URL, { waitUntil: 'load', timeout: 60000 });
  await selectTerm(page, term);

  // SmartGWT reloads its subject datasource after a term change. If typing
  // starts too early, the text appears in the input but no subject is selected.
  await page.waitForTimeout(5000);
}

async function selectSubject(page, subject) {
  const input = page.locator('input[name="COURSESUBJECT"]');
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await input.click();
  await input.press('Control+A');
  await input.press('Backspace');
  await input.type(subject, { delay: 80 });

  let optionBox = null;
  for (let attempt = 0; attempt < 30 && !optionBox; attempt++) {
    optionBox = await page.evaluate(expected => {
      const option = Array.from(document.querySelectorAll('tr[role="listitem"]')).find(row => {
        const rect = row.getBoundingClientRect();
        // textContent concatenates SmartGWT cells ("EEElektrik-...").
        // innerText preserves the cell boundary so the code can be exact.
        const code = row.innerText.trim().split(/\s+/)[0];
        return rect.width > 0 && rect.height > 0 && code === expected;
      });
      if (!option) return null;
      const rect = option.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, subject);
    if (!optionBox) await page.waitForTimeout(500);
  }
  if (!optionBox) {
    const visibleOptions = await page.locator('tr[role="listitem"]:visible').allInnerTexts().catch(() => []);
    throw new Error(`Subject option "${subject}" did not load. Visible options: ${visibleOptions.join(' | ') || '(none)'}`);
  }

  await page.mouse.click(optionBox.x, optionBox.y);
  await page.waitForFunction(expected => (
    document.querySelector('input[name="COURSESUBJECT"]')?.value?.trim() === expected
  ), subject, { timeout: 10000 });
}

async function searchSubject(page) {
  await page.getByText('Arama', { exact: true }).last().click();
  await page.waitForTimeout(750);
  const outcomeHandle = await page.waitForFunction(() => {
    const excel = Array.from(document.querySelectorAll('img[src*="excel_export"]'))
      .some(image => image.getBoundingClientRect().width > 0);
    if (excel) return 'results';

    const bodyText = document.body.innerText || '';
    if (bodyText.includes('Kay\u0131t bulunamad\u0131') || bodyText.includes('0 Kay\u0131t Bulundu')) {
      return 'empty';
    }
    return false;
  }, { timeout: 30000 });
  return outcomeHandle.jsonValue();
}

async function closeExtraPages(context) {
  const pages = context.pages();
  for (let i = 1; i < pages.length; i++) {
    try { await pages[i].close(); } catch { /* already closed */ }
  }
}

async function run() {
  const config = parseArgs();
  console.log('Starting OZU Offered Courses Scraper...');
  console.log(`   Headless mode: ${config.headless}`);
  console.log(`   Term:          ${config.term || '(page default)'}`);

  const codesPath = path.join(__dirname, 'codes.json');
  if (!fs.existsSync(codesPath)) {
    console.error(`Cannot find codes.json at ${codesPath}`);
    process.exit(1);
  }

  const codes = JSON.parse(fs.readFileSync(codesPath, 'utf8'));
  const allActiveSubjects = codes.DATA.rows
    .filter(row => row.SUBJECTTYPE === '1')
    .map(row => normalizeSubject(row.NAME))
    .sort();
  const endIndex = config.end > 0 ? Math.min(config.end, allActiveSubjects.length) : allActiveSubjects.length;
  let activeSubjects = config.subjects.length
    ? config.subjects.map(normalizeSubject)
    : allActiveSubjects.slice(config.start - 1, endIndex);
  if (config.max > 0) activeSubjects = activeSubjects.slice(0, config.max);

  console.log(config.subjects.length
    ? `   Requested subjects: ${activeSubjects.join(', ')}`
    : `   Subject range: ${config.start}-${endIndex} (${activeSubjects.length}/${allActiveSubjects.length})`);

  const baseOutputDir = config.term
    ? path.join(__dirname, 'downloads', termSlug(config.term))
    : path.join(__dirname, 'downloads');
  const browser = await chromium.launch({
    headless: config.headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  page.on('dialog', async dialog => {
    console.log(`   Dialog: [${dialog.type()}] ${dialog.message()}`);
    await dialog.dismiss();
  });

  const failures = [];
  const emptySubjects = [];

  try {
    for (let index = 0; index < activeSubjects.length; index++) {
      const subject = activeSubjects[index];
      const subjectDir = path.join(baseOutputDir, subject);
      const destPath = path.join(subjectDir, `${subject}_offered.xls`);
      const emptyMarkerPath = path.join(subjectDir, `${subject}_offered.empty.json`);
      fs.mkdirSync(subjectDir, { recursive: true });
      console.log(`\n[${index + 1}/${activeSubjects.length}] Subject: ${subject}`);

      if (fs.existsSync(destPath)) {
        if (validateOfferingFile(destPath, subject)) {
          if (fs.existsSync(emptyMarkerPath)) fs.unlinkSync(emptyMarkerPath);
          console.log('   Existing Excel validated; skipping.');
          continue;
        }
        console.error('   Existing Excel failed validation; downloading again.');
        fs.unlinkSync(destPath);
      }

      if (fs.existsSync(emptyMarkerPath)) {
        try {
          const marker = JSON.parse(fs.readFileSync(emptyMarkerPath, 'utf8'));
          if (marker.term === config.term && marker.subject === subject && marker.empty === true) {
            console.log('   Existing explicit-empty result validated; skipping.');
            emptySubjects.push(subject);
            continue;
          }
        } catch {
          // Invalid/stale markers are ignored and replaced by a fresh SIS result.
        }
        fs.unlinkSync(emptyMarkerPath);
      }

      // The independent document bot also writes [] only after SIS explicitly
      // reports an empty subject. Reuse that term-scoped confirmation when a
      // legacy run predates the offered-empty marker.
      const documentMetadataPath = path.join(subjectDir, 'courses.json');
      if (fs.existsSync(documentMetadataPath)) {
        try {
          const documentCourses = JSON.parse(fs.readFileSync(documentMetadataPath, 'utf8'));
          if (Array.isArray(documentCourses) && documentCourses.length === 0) {
            fs.writeFileSync(emptyMarkerPath, `${JSON.stringify({
              term: config.term,
              subject,
              empty: true,
              confirmedAt: new Date().toISOString(),
              source: 'document-catalog'
            }, null, 2)}\n`);
            console.log('   Existing document-catalog empty result validated; skipping.');
            emptySubjects.push(subject);
            continue;
          }
        } catch {
          // Invalid document metadata cannot establish an empty offering.
        }
      }

      let completed = false;
      for (let attempt = 1; attempt <= 3 && !completed; attempt++) {
        try {
          console.log(`   Attempt ${attempt}/3: loading a fresh SIS form...`);
          await preparePage(page, config.term);
          await selectSubject(page, subject);
          const selectedTerm = await page.locator('input[name="TERMCODE"]').inputValue();
          const selectedSubject = await page.locator('input[name="COURSESUBJECT"]').inputValue();
          if (selectedTerm.trim() !== config.term.trim() || selectedSubject.trim() !== subject) {
            throw new Error(`Selection mismatch: "${selectedTerm}" / "${selectedSubject}".`);
          }
          console.log(`   Verified selection: ${selectedTerm} / ${selectedSubject}`);

          const outcome = await searchSubject(page);
          if (outcome === 'empty') {
            console.log('   SIS explicitly reported no courses.');
            fs.writeFileSync(emptyMarkerPath, `${JSON.stringify({
              term: config.term,
              subject,
              empty: true,
              confirmedAt: new Date().toISOString()
            }, null, 2)}\n`);
            emptySubjects.push(subject);
            completed = true;
            continue;
          }

          // SmartGWT dispatches this download from the browser context rather
          // than from the visible page.
          const downloadPromise = context.waitForEvent('download', { timeout: 20000 });
          await page.locator('img[src*="excel_export"]:visible').first().click();
          const download = await downloadPromise;
          await download.saveAs(destPath);
          if (!validateOfferingFile(destPath, subject)) {
            fs.unlinkSync(destPath);
            throw new Error(`Downloaded Excel did not contain ${subject} rows.`);
          }
          if (fs.existsSync(emptyMarkerPath)) fs.unlinkSync(emptyMarkerPath);
          console.log(`   Excel saved and validated (${fs.statSync(destPath).size} bytes).`);
          completed = true;
        } catch (error) {
          console.error(`   Attempt ${attempt} failed: ${error.message}`);
        } finally {
          await closeExtraPages(context);
        }
      }

      if (!completed) {
        failures.push(subject);
        console.error(`   ${subject} was neither downloaded nor explicitly confirmed empty.`);
      }
    }

    console.log(`\nFinished. Output: ${baseOutputDir}`);
    console.log(`   Explicitly empty subjects: ${emptySubjects.length}`);
    if (failures.length > 0) {
      console.error(`   Failed subjects: ${failures.join(', ')}`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

run().catch(error => {
  console.error('Scraper crashed:', error);
  process.exitCode = 1;
});
