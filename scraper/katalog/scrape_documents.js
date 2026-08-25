#!/usr/bin/env node
/**
 * Download ECTS and syllabus PDFs for one SIS subject.
 * This bot intentionally does not download the offerings Excel; that is the
 * responsibility of scrape_offerings.js so both pipelines can run in parallel.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_URL = 'https://sis.ozyegin.edu.tr/OZU_GWT/WEB/CourseCatalogOfferUI?locale=tr';

function parseArgs() {
  const args = process.argv.slice(2);
  const config = { subject: '', term: '', headless: true };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--subject' || args[i] === '--major') {
      config.subject = String(args[++i] || '').trim();
    } else if (args[i] === '--term') {
      config.term = String(args[++i] || '').trim();
    } else if (args[i] === '--headless') {
      config.headless = args[++i] !== 'false';
    }
  }
  return config;
}

function termSlug(term) {
  return term.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
}

function isValidPdf(filePath) {
  try {
    if (fs.statSync(filePath).size < 500) return false;
    const fd = fs.openSync(filePath, 'r');
    const signature = Buffer.alloc(5);
    fs.readSync(fd, signature, 0, 5, 0);
    fs.closeSync(fd);
    return signature.toString('ascii') === '%PDF-';
  } catch {
    return false;
  }
}

function normalizeCourseCode(value) {
  return String(value || '').replace(/\s+/g, '').toLocaleUpperCase('tr-TR');
}

function expectedSectionCodes(outputDir) {
  const offeredFile = fs.readdirSync(outputDir)
    .find(file => /_offered\.xls$/i.test(file));
  if (!offeredFile) return null;

  const workbook = XLSX.readFile(path.join(outputDir, offeredFile));
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const codes = new Set();
  for (const row of XLSX.utils.sheet_to_json(worksheet, { defval: '' })) {
    const subject = String(row.SUBJECT || '').trim();
    const courseNo = String(row.COURSENO || '').trim();
    const sectionNo = String(row.SECTIONNO || '').trim();
    if (subject && courseNo && sectionNo) {
      codes.add(normalizeCourseCode(`${subject}${courseNo}.${sectionNo}`));
    }
  }
  return codes;
}

function missingExpectedSections(courses, outputDir) {
  const expected = expectedSectionCodes(outputDir);
  if (!expected) return [];
  const actual = new Set(courses.map(course => normalizeCourseCode(course.code)));
  return [...expected].filter(code => !actual.has(code)).sort();
}

function metadataComplete(metadataPath, outputDir) {
  try {
    const courses = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    return Array.isArray(courses)
      && missingExpectedSections(courses, outputDir).length === 0
      && courses.every(course => (
      (course.ectsUnavailable || (
        course.ectsFile && isValidPdf(path.join(outputDir, course.ectsFile))
      ))
      && (!course.hasSyllabus || course.syllabusUnavailable || (
        course.syllabusFile && isValidPdf(path.join(outputDir, course.syllabusFile))
      ))
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
  if ((await input.inputValue()).trim() === term) return;

  await input.click();
  await input.press('Control+A');
  await input.press('Backspace');
  await input.type(term.split(/\s+/).pop(), { delay: 80 });
  await page.waitForTimeout(1500);
  const box = await page.evaluate(expected => {
    const option = Array.from(document.querySelectorAll('*')).find(element => (
      element.children.length === 0
      && element.textContent.trim() === expected
      && element.getBoundingClientRect().width > 0
    ));
    if (!option) return null;
    const rect = option.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, term);
  if (!box) throw new Error(`Term option "${term}" did not load.`);
  await page.mouse.click(box.x, box.y);
  await page.waitForFunction(expected => (
    document.querySelector('input[name="TERMCODE"]')?.value?.trim() === expected
  ), term, { timeout: 10000 });
}

async function selectSubject(page, subject) {
  const input = page.locator('input[name="COURSESUBJECT"]');
  await input.waitFor({ state: 'visible', timeout: 15000 });
  await input.click();
  await input.press('Control+A');
  await input.press('Backspace');
  await input.type(subject, { delay: 80 });

  let box = null;
  for (let attempt = 0; attempt < 30 && !box; attempt++) {
    box = await page.evaluate(expected => {
      const option = Array.from(document.querySelectorAll('tr[role="listitem"]')).find(row => {
        const rect = row.getBoundingClientRect();
        const code = row.innerText.trim().split(/\s+/)[0];
        return rect.width > 0 && rect.height > 0 && code === expected;
      });
      if (!option) return null;
      const rect = option.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, subject);
    if (!box) await page.waitForTimeout(500);
  }
  if (!box) throw new Error(`Subject option "${subject}" did not load.`);
  await page.mouse.click(box.x, box.y);
  await page.waitForFunction(expected => (
    document.querySelector('input[name="COURSESUBJECT"]')?.value?.trim() === expected
  ), subject, { timeout: 10000 });
}

async function waitForResults(page) {
  await page.getByText('Arama', { exact: true }).last().click();
  await page.waitForTimeout(750);
  const handle = await page.waitForFunction(() => {
    const rows = Array.from(document.querySelectorAll('tr[role="listitem"]'));
    if (rows.some(row => row.innerText.includes('credits'))) return 'results';
    const body = document.body.innerText || '';
    if (body.includes('Kay\u0131t bulunamad\u0131') || body.includes('0 Kay\u0131t Bulundu')) return 'empty';
    return false;
  }, { timeout: 30000 });
  return handle.jsonValue();
}

async function exposeAllResultRows(page) {
  const resultCount = await page.evaluate(() => {
    const match = (document.body.innerText || '').match(/\(\s*(\d+)\s+Kayıt Bulundu\s*\)/i);
    return match ? Number(match[1]) : 0;
  });
  if (!resultCount) return 0;

  // The SIS grid virtualizes rows based on the viewport height and has no real
  // paginator. A tall viewport makes the grid render every result so documents
  // below the initial 31 visible rows can also be mapped and downloaded.
  const viewportHeight = Math.min(20000, Math.max(1200, resultCount * 60 + 1000));
  await page.setViewportSize({ width: 1280, height: viewportHeight });
  await page.waitForFunction(expected => (
    Array.from(document.querySelectorAll('tr[role="listitem"]'))
      .filter(row => row.innerText.includes('credits')).length >= expected
  ), resultCount, { timeout: 20000 });
  return resultCount;
}

async function mapCoursesAndButtons(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr[role="listitem"]'))
      .filter(row => row.innerText.includes('credits'));
    const buttons = Array.from(document.querySelectorAll('.imgButton'));

    return rows.map((row, index) => {
      const rowRect = row.getBoundingClientRect();
      const rowY = rowRect.top + rowRect.height / 2;
      const rowButtons = buttons
        .map(button => {
          const rect = button.getBoundingClientRect();
          return { button, x: rect.left, y: rect.top + rect.height / 2 };
        })
        .filter(item => Math.abs(item.y - rowY) < 6)
        .sort((left, right) => left.x - right.x);

      const types = rowButtons.length >= 3 ? ['calendar', 'pdf', 'folder'] : ['calendar', 'pdf'];
      rowButtons.forEach((item, buttonIndex) => {
        item.button.setAttribute('data-document-row', String(index));
        item.button.setAttribute('data-document-type', types[buttonIndex] || `extra-${buttonIndex}`);
      });

      const detailsCell = row.cells[2];
      const leafTables = detailsCell
        ? Array.from(detailsCell.querySelectorAll('table')).filter(table => table.querySelectorAll('table').length === 0)
        : [];
      const headingCells = leafTables[0]?.querySelectorAll('td') || [];
      const detailCells = leafTables[1]?.querySelectorAll('td') || [];
      const code = headingCells[0]?.textContent.trim() || '';
      const title = headingCells[1]?.textContent.trim() || '';
      const credits = (headingCells[2]?.textContent || '').trim().replace(/\s+credits/i, '');
      let requirements = '';
      let instructor = '';
      if (detailCells.length >= 2) {
        requirements = detailCells[0].textContent.trim();
        instructor = detailCells[1].textContent.trim();
      } else if (detailCells.length === 1) {
        instructor = detailCells[0].textContent.trim();
      }

      return {
        index,
        code,
        title,
        credits,
        requirements,
        instructor,
        hasSyllabus: rowButtons.length >= 3
      };
    });
  });
}

async function downloadPdf(page, context, selector, outputPath) {
  if (isValidPdf(outputPath)) return true;
  if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

  let download = null;
  let popup = null;
  const onDownload = item => { download = item; };
  const onPage = item => { popup = item; };
  context.on('download', onDownload);
  context.on('page', onPage);

  try {
    await page.locator(selector).click({ timeout: 10000 });
    for (let attempt = 0; attempt < 200 && !download && !popup; attempt++) {
      await page.waitForTimeout(100);
    }

    if (download) {
      await download.saveAs(outputPath);
    } else if (popup) {
      await popup.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      for (let attempt = 0; attempt < 100 && (!popup.url() || popup.url() === 'about:blank'); attempt++) {
        await page.waitForTimeout(100);
      }
      const url = popup.url();
      if (!url || url === 'about:blank') throw new Error('PDF popup did not navigate.');
      const response = await context.request.get(url, { timeout: 30000 });
      if (!response.ok()) throw new Error(`PDF request returned ${response.status()}.`);
      fs.writeFileSync(outputPath, await response.body());
    } else {
      throw new Error('No download or PDF popup event was received.');
    }

    if (!isValidPdf(outputPath)) {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      throw new Error('Downloaded file is not a valid PDF.');
    }
    return true;
  } finally {
    context.off('download', onDownload);
    context.off('page', onPage);
    if (popup) await popup.close().catch(() => {});
  }
}

async function run() {
  const config = parseArgs();
  if (!config.subject || !config.term) {
    console.error('Usage: node scrape_documents.js --subject EE --term "2025 - 2026 Bahar"');
    process.exit(1);
  }

  const outputDir = path.join(__dirname, 'downloads', termSlug(config.term), config.subject);
  const metadataPath = path.join(outputDir, 'courses.json');
  fs.mkdirSync(outputDir, { recursive: true });
  if (fs.existsSync(metadataPath) && metadataComplete(metadataPath, outputDir)) {
    console.log(`[${config.subject}] Existing document set validated; skipping.`);
    return;
  }

  const browser = await chromium.launch({ headless: config.headless, args: ['--no-sandbox'] });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on('dialog', async dialog => { await dialog.dismiss(); });

  try {
    await page.goto(CATALOG_URL, { waitUntil: 'load', timeout: 60000 });
    await selectTerm(page, config.term);
    await page.waitForTimeout(5000);
    await selectSubject(page, config.subject);
    const selectedSubject = await page.locator('input[name="COURSESUBJECT"]').inputValue();
    if (selectedSubject.trim() !== config.subject) throw new Error(`Selected "${selectedSubject}" instead of "${config.subject}".`);

    const outcome = await waitForResults(page);
    if (outcome === 'empty') {
      fs.writeFileSync(metadataPath, '[]\n');
      console.log(`[${config.subject}] SIS explicitly reported no courses.`);
      return;
    }

    const resultCount = await exposeAllResultRows(page);
    const mappedCourses = await mapCoursesAndButtons(page);
    const seenCourseRows = new Set();
    const courses = mappedCourses.filter(course => {
      if (seenCourseRows.has(course.code)) return false;
      seenCourseRows.add(course.code);
      return true;
    });
    if (courses.length === 0) throw new Error('Results appeared but no course rows could be mapped.');
    if (resultCount && mappedCourses.length < resultCount) {
      throw new Error(`SIS reported ${resultCount} rows but only ${mappedCourses.length} rendered.`);
    }
    const initiallyMissing = missingExpectedSections(courses, outputDir);
    if (initiallyMissing.length > 0) {
      throw new Error(`Mapped rows are missing ${initiallyMissing.length} Excel sections: ${initiallyMissing.join(', ')}`);
    }
    console.log(`[${config.subject}] ${courses.length} unique rows (${resultCount || mappedCourses.length} SIS results); downloading documents...`);

    const failures = [];
    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];
      const safeCode = course.code.replace(/\s+/g, '_');
      const ectsFile = `${safeCode}_ECTS.pdf`;
      const ectsPath = path.join(outputDir, ectsFile);
      let ectsError = null;
      for (let attempt = 1; attempt <= 2 && !course.ectsFile; attempt++) {
        try {
          await downloadPdf(page, context, `div.imgButton[data-document-row="${course.index}"][data-document-type="pdf"]`, ectsPath);
          course.ectsFile = ectsFile;
        } catch (error) {
          ectsError = error;
        }
      }
      if (!course.ectsFile) {
        course.ectsUnavailable = true;
        console.warn(`[${config.subject}] ${course.code} ECTS unavailable after two attempts: ${ectsError?.message}`);
      }

      if (course.hasSyllabus) {
        const syllabusFile = `${safeCode}_Syllabus.pdf`;
        const syllabusPath = path.join(outputDir, syllabusFile);
        let syllabusError = null;
        for (let attempt = 1; attempt <= 2 && !course.syllabusFile; attempt++) {
          try {
            await downloadPdf(page, context, `div.imgButton[data-document-row="${course.index}"][data-document-type="folder"]`, syllabusPath);
            course.syllabusFile = syllabusFile;
          } catch (error) {
            syllabusError = error;
          }
        }
        if (!course.syllabusFile) {
          // Some SIS rows show the folder icon even though the server returns
          // an HTML "unavailable" response. ECTS remains mandatory; syllabus
          // is recorded as unavailable after two validated attempts.
          course.syllabusUnavailable = true;
          console.warn(`[${config.subject}] ${course.code} syllabus unavailable: ${syllabusError?.message}`);
        }
      }
      await page.waitForTimeout(300);
    }

    fs.writeFileSync(metadataPath, `${JSON.stringify(courses, null, 2)}\n`);
    if (failures.length > 0) throw new Error(`Document failures:\n${failures.join('\n')}`);
    if (!metadataComplete(metadataPath, outputDir)) throw new Error('Downloaded document set did not pass final validation.');
    console.log(`[${config.subject}] Document set complete.`);
  } finally {
    await browser.close();
  }
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
