import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const outputDir = path.join(__dirname, 'downloads', 'offered_courses');
  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('dialog', async dialog => {
    await dialog.dismiss();
  });

  // Track downloads globally on context
  let capturedDownload = null;
  context.on('download', download => {
    console.log(`   📥 Global Download Event Triggered! URL: ${download.url()}`);
    capturedDownload = download;
  });

  try {
    console.log('🌐 Navigating to OZU Offered Courses...');
    await page.goto('https://sis.ozyegin.edu.tr/OZU_GWT/WEB/CourseCatalogOfferUI?locale=tr');
    await page.waitForTimeout(3000);

    const subject = 'EE';
    console.log(`🔍 Selecting Subject "${subject}"...`);

    const inputHandle = await page.evaluateHandle(() => {
      const tds = Array.from(document.querySelectorAll('td'));
      const labelTd = tds.find(td => td.textContent.trim().startsWith('Konu'));
      return labelTd ? labelTd.nextElementSibling.querySelector('input') : null;
    });

    const input = inputHandle.asElement();
    if (input) {
      await input.click();
      await input.fill('');
      await input.type(subject, { delay: 100 });
      await page.waitForTimeout(1000);
      
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
    }
    await page.waitForTimeout(1000);

    // Search button
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

    console.log('⏳ Waiting for results...');
    let hasResults = false;
    try {
      await page.waitForFunction(() => {
        const excelBtn = document.querySelector('img[src*="excel_export"]');
        const excelVisible = excelBtn && excelBtn.getBoundingClientRect().width > 0;
        
        const bodyText = document.body.textContent || '';
        const noResults = bodyText.includes('0 Kayıt Bulundu') || bodyText.includes('Kayıt bulunamadı');
        
        return excelVisible || noResults;
      }, { timeout: 8000 });

      hasResults = await page.evaluate(() => {
        const excelBtn = document.querySelector('img[src*="excel_export"]');
        return !!(excelBtn && excelBtn.getBoundingClientRect().width > 0);
      });
    } catch (e) {
      console.log('   Timeout waiting for results.');
    }

    if (hasResults) {
      console.log('🎉 Results loaded! Clicking Excel button...');
      await page.locator('img[src*="excel_export"]').first().click();

      // Poll for capturedDownload to be non-null
      console.log('⏳ Waiting for global download capture...');
      for (let i = 0; i < 100; i++) {
        if (capturedDownload) break;
        await page.waitForTimeout(100);
      }

      if (capturedDownload) {
        const destPath = path.join(outputDir, `${subject}_offered.xls`);
        await capturedDownload.saveAs(destPath);
        console.log(`✅ Downloaded successfully to ${destPath}`);
      } else {
        console.log('❌ Failed to capture global download event.');
      }
    } else {
      console.log('ℹ️ No courses offered for this subject.');
    }

  } catch (err) {
    console.error('❌ Test failed:', err);
  } finally {
    await browser.close();
  }
}

run();
