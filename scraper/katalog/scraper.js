#!/usr/bin/env node
/**
 * OZU Course Catalog Scraper
 * 
 * Usage: node scraper.js [--major CODE] [--headless true|false]
 * Example: node scraper.js --major CS --headless false
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    major: 'CS',
    headless: true,
    term: ''
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--major' || args[i] === '-m') {
      config.major = args[i + 1] ? args[i + 1].toUpperCase() : 'CS';
      i++;
    } else if (args[i] === '--headless') {
      config.headless = args[i + 1] === 'false' ? false : true;
      i++;
    } else if (args[i] === '--term') {
      config.term = args[i + 1] || '';
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

async function downloadFile(page, context, clickSelector, outputPath) {
  let downloadInfo = null;
  let pageInfo = null;

  const handleDownload = (download) => {
    downloadInfo = download;
  };
  const handlePage = (newPage) => {
    pageInfo = newPage;
  };

  page.once('download', handleDownload);
  context.once('download', handleDownload);
  if (!clickSelector.includes('excel')) {
    context.once('page', handlePage);
  }

  try {
    console.log(`   👉 Clicking button: ${clickSelector}`);
    await page.click(clickSelector);

    // Wait up to 10 seconds for either event
    for (let i = 0; i < 100; i++) {
      if (downloadInfo || pageInfo) break;
      await page.waitForTimeout(100);
    }

    if (downloadInfo) {
      console.log(`   📥 Saved via direct download event: ${path.basename(outputPath)}`);
      await downloadInfo.saveAs(outputPath);
      return true;
    } else if (pageInfo) {
      await pageInfo.waitForLoadState('domcontentloaded');
      const url = pageInfo.url();
      if (url && url !== 'about:blank') {
        console.log(`   📥 Downloading from tab URL: ${url}`);
        const response = await pageInfo.request.get(url);
        const buffer = await response.body();
        fs.writeFileSync(outputPath, buffer);
      }
      await pageInfo.close();
      return true;
    }
    throw new Error(`Timeout waiting for download/page event on click: ${clickSelector}`);
  } catch (error) {
    console.error(`   ❌ Failed download: ${error.message}`);
    return false;
  } finally {
    page.off('download', handleDownload);
    context.off('download', handleDownload);
    context.off('page', handlePage);
  }
}

async function run() {
  const config = parseArgs();
  console.log(`🚀 Starting OZU Catalog Scraper...`);
  console.log(`   Major/Subject:  ${config.major}`);
  console.log(`   Headless mode:  ${config.headless}`);
  console.log(`   Term:           ${config.term || '(page default)'}`);

  const outputDir = config.term
    ? path.join(__dirname, 'downloads', termSlug(config.term), config.major)
    : path.join(__dirname, 'downloads', config.major);
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({
    headless: config.headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  try {
    console.log(`🌐 Navigating to Course Catalog...`);
    await page.goto('https://sis.ozyegin.edu.tr/OZU_GWT/WEB/CourseCatalogOfferUI?locale=tr', {
      waitUntil: 'load',
      timeout: 60000
    });

    console.log(`⏳ Waiting for GWT app initialization...`);
    await page.waitForTimeout(3000);

    if (config.term) {
      const ok = await selectTerm(page, config.term);
      if (!ok) {
        throw new Error(`Could not select the requested term "${config.term}".`);
      }
    }

    // 1. Find and select the Major/Subject dropdown ("Konu")
    console.log(`🔍 Selecting Major "${config.major}"...`);
    const inputHandle = await page.evaluateHandle(() => {
      const tds = Array.from(document.querySelectorAll('td'));
      const labelTd = tds.find(td => td.textContent.trim().startsWith('Konu'));
      if (!labelTd) return null;
      const nextTd = labelTd.nextElementSibling;
      return nextTd ? nextTd.querySelector('input') : null;
    });

    const input = inputHandle.asElement();
    if (!input) {
      throw new Error('Could not find the "Konu" (Subject) input field in the DOM.');
    }

    await input.click();
    await input.fill('');
    await input.type(config.major, { delay: 100 });
    await page.waitForTimeout(1500); // Wait for list to filter

    // Try to find the visible option list item containing the major code and get coordinates
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
    }, config.major);

    if (optionBox) {
      console.log(`   Found option coordinates: (${optionBox.x}, ${optionBox.y}). Clicking...`);
      await page.mouse.click(optionBox.x, optionBox.y);
      console.log(`   Selected "${config.major}" from dropdown list using native mouse click.`);
    } else {
      console.log(`   Could not find option coordinates, attempting keyboard select fallback...`);
      await input.press('ArrowDown');
      await page.waitForTimeout(200);
      await input.press('Enter');
    }
    await page.waitForTimeout(1500); // Wait for dropdown to close and UI to update

    // 2. Click search button
    console.log(`🔍 Clicking Search (Arama) button...`);
    const searchBtnBox = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('div, td, button, table'));
      const btn = elements.find(el => el.textContent.trim() === 'Arama' && (el.className.includes('Button') || el.onclick || el.role === 'button' || el.tagName === 'TD'));
      if (btn) {
        const rect = btn.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
      return null;
    });

    if (searchBtnBox) {
      console.log(`   Found Search button coordinates: (${searchBtnBox.x}, ${searchBtnBox.y}). Clicking...`);
      await page.mouse.click(searchBtnBox.x, searchBtnBox.y);
    } else {
      console.log(`   Fallback search click via text...`);
      await page.locator('text="Arama"').first().click();
    }

    console.log(`⏳ Waiting for search results...`);
    await page.waitForFunction(() => {
      const rows = Array.from(document.querySelectorAll('tr[role="listitem"]'));
      const hasCourses = rows.some(r => r.textContent.includes('credits'));
      const noResults = document.body.textContent && document.body.textContent.includes('Kayıt bulunamadı');
      return hasCourses || noResults;
    }, { timeout: 20000 });

    const hasCourses = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr[role="listitem"]'));
      return rows.some(r => r.textContent.includes('credits'));
    });

    if (!hasCourses) {
      console.log(`   ℹ️ No courses found for major "${config.major}" (Kayıt bulunamadı).`);
      return;
    }

    // 3. Extract rows and assign row type attributes
    console.log(`📊 Mapping course rows and action buttons...`);
    const courses = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr[role="listitem"]'))
        .filter(tr => tr.textContent.includes('credits'));

      const buttons = Array.from(document.querySelectorAll('.imgButton'));

      return rows.map((row, index) => {
        const rowRect = row.getBoundingClientRect();
        const rowY = rowRect.top + rowRect.height / 2;

        // Find buttons with matching Y coordinate
        const rowButtons = buttons
          .map(btn => {
            const rect = btn.getBoundingClientRect();
            return {
              x: rect.left,
              y: rect.top + rect.height / 2
            };
          })
          .filter(btn => Math.abs(btn.y - rowY) < 6);

        // Sort buttons by X coordinate
        rowButtons.sort((a, b) => a.x - b.x);

        // Tag DOM elements
        rowButtons.forEach((btnInfo, btnIndex) => {
          const matchingBtn = buttons.find(b => {
            const r = b.getBoundingClientRect();
            return Math.abs(r.left - btnInfo.x) < 1 && Math.abs((r.top + r.height/2) - btnInfo.y) < 1;
          });
          if (matchingBtn) {
            matchingBtn.setAttribute('data-course-row', index);
            matchingBtn.setAttribute('data-btn-type', rowButtons.length === 3 ? ['calendar', 'pdf', 'folder'][btnIndex] : ['calendar', 'pdf'][btnIndex]);
          }
        });

        // Parse text components from details column (third td, index 2)
        const detailsCell = row.cells[2];
        
        let code = '';
        let title = '';
        let credits = '';
        let requirements = '';
        let instructor = '';

        if (detailsCell) {
          const allTables = Array.from(detailsCell.querySelectorAll('table'));
          const leafTables = allTables.filter(t => t.querySelectorAll('table').length === 0);
          const firstTable = leafTables[0];
          const secondTable = leafTables[1];
          
          if (firstTable) {
            const cells = firstTable.querySelectorAll('td');
            if (cells.length >= 3) {
              code = cells[0].textContent.trim();
              title = cells[1].textContent.trim();
              credits = cells[2].textContent.trim().replace(/\s+credits/i, '');
            }
          }
          
          if (secondTable) {
            const cells = secondTable.querySelectorAll('td');
            if (cells.length >= 2) {
              requirements = cells[0].textContent.trim();
              instructor = cells[1].textContent.trim();
            } else if (cells.length === 1) {
              const txt = cells[0].textContent.trim();
              if (txt.toLowerCase().includes('koşul:')) {
                requirements = txt;
              } else {
                instructor = txt;
              }
            }
          }
        }

        return {
          index,
          code: code || `UNKNOWN_${index}`,
          title,
          credits,
          instructor,
          requirements,
          rawLines: detailsCell ? detailsCell.innerText.split('\n').map(s => s.trim()).filter(Boolean) : [],
          hasSyllabus: rowButtons.length === 3
        };
      });
    });

    console.log(`📋 Found ${courses.length} courses. Starting downloads...`);

    // 4. Download offerings Excel sheet for this major
    const excelPath = path.join(outputDir, `${config.major}_offered.xls`);
    console.log(`\n📥 Downloading offerings Excel sheet for ${config.major}...`);
    try {
      await downloadFile(
        page,
        context,
        'img[src*="excel_export"]',
        excelPath
      );
      // Close popup tabs
      const pages = context.pages();
      for (let i = 1; i < pages.length; i++) {
        try {
          await pages[i].close();
        } catch (e) {}
      }
    } catch (excelErr) {
      console.error(`   ⚠️ Failed to download offerings Excel sheet: ${excelErr.message}`);
    }

    // 5. Download PDFs for each course
    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];
      console.log(`\n[${i + 1}/${courses.length}] Processing ${course.code} - ${course.title || 'No Title'}`);
      
      const safeCode = course.code.replace(/\s+/g, '_');

      // Download ECTS PDF
      const ectsPath = path.join(outputDir, `${safeCode}_ECTS.pdf`);
      console.log(`   🔹 Downloading ECTS Form...`);
      const ectsSuccess = await downloadFile(
        page,
        context,
        `div.imgButton[data-course-row="${i}"][data-btn-type="pdf"]`,
        ectsPath
      );
      if (ectsSuccess) {
        course.ectsFile = `${safeCode}_ECTS.pdf`;
      }

      // Download Syllabus if available
      if (course.hasSyllabus) {
        const syllabusPath = path.join(outputDir, `${safeCode}_Syllabus.pdf`);
        console.log(`   🔹 Downloading Syllabus...`);
        const syllabusSuccess = await downloadFile(
          page,
          context,
          `div.imgButton[data-course-row="${i}"][data-btn-type="folder"]`,
          syllabusPath
        );
        if (syllabusSuccess) {
          course.syllabusFile = `${safeCode}_Syllabus.pdf`;
        }
      } else {
        console.log(`   ℹ️ No syllabus folder icon for this section.`);
      }
      
      // Delay to avoid hammering the server
      await page.waitForTimeout(500);
    }

    // Save final metadata
    const metadataPath = path.join(outputDir, 'courses.json');
    fs.writeFileSync(metadataPath, JSON.stringify(courses, null, 2));
    console.log(`\n🎉 Completed scraping successfully!`);
    console.log(`   Downloaded files folder: ${outputDir}`);
    console.log(`   Metadata saved to:        ${metadataPath}`);

  } catch (error) {
    console.error(`💥 Fatal Scraper Error:`, error);
  } finally {
    await browser.close();
  }
}

run();
