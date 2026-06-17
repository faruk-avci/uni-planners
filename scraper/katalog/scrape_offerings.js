#!/usr/bin/env node
/**
 * OZU Offered Courses Excel Scraper
 * Downloads the offered courses Excel sheet for each subject code
 * 
 * Usage: node scrape_offerings.js [--headless true|false]
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  // term: full picklist label, e.g. "2025 - 2026 Yaz" (Summer). Empty = page default.
  const config = { headless: true, term: '', max: 0 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--headless') {
      config.headless = args[i + 1] === 'false' ? false : true;
      i++;
    } else if (args[i] === '--term') {
      config.term = args[i + 1] || '';
      i++;
    } else if (args[i] === '--max') {
      config.max = parseInt(args[i + 1], 10) || 0; // 0 = all
      i++;
    }
  }
  return config;
}

function termSlug(term) {
  return term.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase();
}

/**
 * Select a term in the "Dönem Kodu" autocomplete (SmartGWT combobox).
 * Same technique as the "Konu" field: type to filter, then mouse-click the
 * exact picklist option. Returns true on success.
 */
async function selectTerm(page, term) {
  if (!term) return true; // keep page default

  // Locate the "Dönem Kodu" input via its label cell.
  const inputHandle = await page.evaluateHandle(() => {
    const tds = Array.from(document.querySelectorAll('td'));
    const labelTd = tds.find(td => td.textContent.trim().startsWith('Dönem Kodu'));
    return labelTd?.nextElementSibling?.querySelector('input') || null;
  });
  const input = inputHandle.asElement();
  if (!input) {
    console.error('   ❌ Could not find the "Dönem Kodu" (term) input.');
    return false;
  }

  // Already on the desired term?
  const current = await input.evaluate(el => el.value);
  if (current && current.trim() === term.trim()) return true;

  await input.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Typing the last word ("Yaz"/"Güz"/"Bahar") filters the list reliably.
  const filterText = term.trim().split(/\s+/).pop();
  await input.type(filterText, { delay: 60 });
  await page.waitForTimeout(1200);

  // Find the exact-matching visible option and click its center with a real mouse event.
  const optionBox = await page.evaluate((label) => {
    const el = Array.from(document.querySelectorAll('*')).find(e =>
      e.children.length === 0 &&
      e.textContent.trim() === label &&
      e.getBoundingClientRect().width > 0
    );
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, term.trim());

  if (!optionBox) {
    console.error(`   ❌ Term option "${term}" not found in the dropdown.`);
    return false;
  }
  await page.mouse.click(optionBox.x, optionBox.y);
  await page.waitForTimeout(1000);

  const after = await input.evaluate(el => el.value);
  const ok = after && after.trim() === term.trim();
  console.log(ok ? `   📅 Term set to "${after.trim()}".` : `   ⚠️ Term value is "${after}" (expected "${term}").`);
  return ok;
}

async function run() {
  const config = parseArgs();
  console.log(`🚀 Starting OZU Offered Courses Scraper...`);
  console.log(`   Headless mode:  ${config.headless}`);
  console.log(`   Term:           ${config.term || '(page default)'}`);

  const codesPath = path.join(__dirname, 'codes.json');
  if (!fs.existsSync(codesPath)) {
    console.error(`❌ Cannot find codes.json at ${codesPath}`);
    process.exit(1);
  }

  const codes = JSON.parse(fs.readFileSync(codesPath, 'utf8'));
  let activeSubjects = codes.DATA.rows
    .filter(r => r.SUBJECTTYPE === '1')
    .map(r => r.NAME)
    .sort();
  if (config.max > 0) activeSubjects = activeSubjects.slice(0, config.max);

  console.log(`📊 Found ${activeSubjects.length} active subjects to scrape.`);

  const browser = await chromium.launch({
    headless: config.headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('dialog', async dialog => {
    console.log(`   💬 Dialog popped up: [${dialog.type()}] ${dialog.message()}`);
    await dialog.dismiss();
  });

  let capturedDownload = null;
  context.on('download', download => {
    capturedDownload = download;
  });

  try {
    console.log('🌐 Navigating to OZU Offered Courses page...');
    await page.goto('https://sis.ozyegin.edu.tr/OZU_GWT/WEB/CourseCatalogOfferUI?locale=tr', {
      waitUntil: 'load',
      timeout: 60000
    });
    await page.waitForTimeout(4000);

    if (config.term) {
      const ok = await selectTerm(page, config.term);
      if (!ok) {
        console.error('❌ Could not select the requested term. Aborting.');
        await browser.close();
        process.exit(1);
      }
    }

    const baseOutputDir = config.term
      ? path.join(__dirname, 'downloads', termSlug(config.term))
      : path.join(__dirname, 'downloads');

    for (let index = 0; index < activeSubjects.length; index++) {
      const subject = activeSubjects[index];
      const subjectDir = path.join(baseOutputDir, subject);
      fs.mkdirSync(subjectDir, { recursive: true });
      const destPath = path.join(subjectDir, `${subject}_offered.xls`);

      console.log(`\n[${index + 1}/${activeSubjects.length}] Processing Subject: ${subject}`);

      // Resumable check
      if (fs.existsSync(destPath)) {
        console.log(`   ⏭️ Already downloaded. Skipping.`);
        continue;
      }

      // Safe element polling loop
      let input = null;
      for (let attempt = 0; attempt < 20; attempt++) {
        const inputHandle = await page.evaluateHandle(() => {
          const tds = Array.from(document.querySelectorAll('td'));
          const labelTd = tds.find(td => td.textContent.trim().startsWith('Konu'));
          return labelTd?.nextElementSibling?.querySelector('input') || null;
        });
        input = inputHandle.asElement();
        if (input) break;
        await page.waitForTimeout(200);
      }

      if (!input) {
        console.error(`   ❌ Could not locate the "Konu" input field after polling. Reloading page...`);
        await page.reload();
        await page.waitForTimeout(4000);
        await selectTerm(page, config.term); // reload resets the term
        index--; // Retry same subject
        continue;
      }

      // Attempt input interaction with a short timeout.
      // If a modal error dialog is covering the page, this will fail and trigger a reload.
      try {
        await input.click({ timeout: 2000 });
      } catch (clickErr) {
        console.error(`   ⚠️ Input click blocked (modal popup on screen?). Reloading page...`);
        await page.reload();
        await page.waitForTimeout(4000);
        await selectTerm(page, config.term); // reload resets the term
        index--; // Retry same subject
        continue;
      }

      // Clear the Konu text field
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(200);

      // Type the subject code
      await input.type(subject, { delay: 50 });
      await page.waitForTimeout(1000);

      // Select option
      const optionBox = await page.evaluate((val) => {
        const rows = Array.from(document.querySelectorAll('tr[role="listitem"]'));
        const matching = rows.find(r => {
          const rect = r.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;
          const text = r.textContent.trim();
          return isVisible && (text === val || text.startsWith(val));
        });
        if (matching) {
          const rect = matching.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        return null;
      }, subject);

      if (optionBox) {
        await page.mouse.click(optionBox.x, optionBox.y);
      } else {
        await input.press('ArrowDown');
        await page.waitForTimeout(200);
        await input.press('Enter');
      }
      await page.waitForTimeout(800);

      // Click Search (Arama) button
      const searchBtnBox = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('div, td, button, table'));
        const btn = elements.find(el => el.textContent.trim() === 'Arama' && (el.className.includes('Button') || el.role === 'button' || el.tagName === 'TD'));
        if (btn) {
          const rect = btn.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        return null;
      });

      if (searchBtnBox) {
        await page.mouse.click(searchBtnBox.x, searchBtnBox.y);
      } else {
        await page.locator('text="Arama"').first().click();
      }

      // Wait for table to load results
      let hasResults = false;
      try {
        await page.waitForFunction(() => {
          const excelBtn = document.querySelector('img[src*="excel_export"]');
          const excelVisible = excelBtn && excelBtn.getBoundingClientRect().width > 0;
          
          const bodyText = document.body.textContent || '';
          const noResults = bodyText.includes('0 Kayıt Bulundu') || bodyText.includes('Kayıt bulunamadı');
          
          return excelVisible || noResults;
        }, { timeout: 6000 });

        hasResults = await page.evaluate(() => {
          const excelBtn = document.querySelector('img[src*="excel_export"]');
          return !!(excelBtn && excelBtn.getBoundingClientRect().width > 0);
        });
      } catch (e) {
        console.log('   ⚠️ Timeout waiting for search results.');
      }

      if (hasResults) {
        console.log('   🎉 Results found! Triggering Excel export...');
        capturedDownload = null;
        
        await page.locator('img[src*="excel_export"]').first().click();

        let download = null;
        for (let i = 0; i < 100; i++) {
          if (capturedDownload) {
            download = capturedDownload;
            capturedDownload = null;
            break;
          }
          await page.waitForTimeout(100);
        }

        if (download) {
          await download.saveAs(destPath);
          console.log(`   ✅ Excel saved: ${path.basename(destPath)} (${fs.statSync(destPath).size} bytes)`);
        } else {
          console.log(`   ❌ Failed to capture download for ${subject}`);
        }
      } else {
        console.log('   ℹ️ No courses offered for this subject.');
      }

      // Close popup tabs
      const pages = context.pages();
      for (let i = 1; i < pages.length; i++) {
        try {
          await pages[i].close();
        } catch (e) {}
      }

      await page.waitForTimeout(800);
    }

    console.log(`\n🎉 Scraping finished! All Excel files saved to ${baseOutputDir}`);

  } catch (err) {
    console.error('❌ Scraper crashed:', err);
  } finally {
    await browser.close();
  }
}

run();
