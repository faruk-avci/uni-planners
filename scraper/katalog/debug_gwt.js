import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Helper to trace pages
  const tracePage = (p, name) => {
    p.on('console', msg => console.log(`[${name} CONSOLE] [${msg.type()}] ${msg.text()}`));
    p.on('pageerror', err => console.log(`[${name} ERROR] ${err.message}`));
    p.on('request', req => {
      const url = req.url();
      if (!url.includes('blank.gif') && !url.includes('.js') && !url.includes('.css')) {
        console.log(`[${name} REQ] [${req.method()}] ${url}`);
      }
    });
    p.on('response', res => {
      const url = res.url();
      if (!url.includes('blank.gif') && !url.includes('.js') && !url.includes('.css')) {
        console.log(`[${name} RES] [${res.status()}] ${url}`);
        if (url.includes('xls')) {
          res.text().then(text => {
            console.log(`[${name} RES BODY]`, text.substring(0, 200));
          }).catch(() => {});
        }
      }
    });
  };

  tracePage(page, 'MAIN');

  context.on('page', newPage => {
    tracePage(newPage, 'POPUP');
  });

  try {
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

    await page.waitForTimeout(5000);
    console.log('Clicking Excel...');
    await page.locator('img[src*="excel_export"]').first().click();
    
    // Wait for everything to finish
    await page.waitForTimeout(8000);

  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
}

run();
