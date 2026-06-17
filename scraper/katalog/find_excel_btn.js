import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('https://sis.ozyegin.edu.tr/OZU_GWT/WEB/CourseCatalogOfferUI?locale=tr');
    await page.waitForTimeout(4000);

    // Find input and select EE
    const inputHandle = await page.evaluateHandle(() => {
      const tds = Array.from(document.querySelectorAll('td'));
      const labelTd = tds.find(td => td.textContent.trim().startsWith('Konu'));
      return labelTd ? labelTd.nextElementSibling.querySelector('input') : null;
    });

    const el = inputHandle.asElement();
    if (el) {
      console.log('Typing EE...');
      await el.click();
      await el.fill('');
      await el.type('EE');
      await page.waitForTimeout(1000);
      
      const optionBox = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('tr[role="listitem"]'));
        const matching = rows.find(r => {
          const rect = r.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;
          return isVisible && r.textContent.trim().startsWith('EE');
        });
        if (matching) {
          const rect = matching.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
        return null;
      });

      if (optionBox) {
        await page.mouse.click(optionBox.x, optionBox.y);
      } else {
        await el.press('ArrowDown');
        await page.waitForTimeout(200);
        await el.press('Enter');
      }
    }
    await page.waitForTimeout(1500);

    // Click Search
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

    console.log('Waiting for search results...');
    await page.waitForTimeout(6000);

    const elementDetails = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      const showDescEl = elements.find(el => el.textContent.trim() === 'Açıklamaları Göster');
      
      if (!showDescEl) return { error: 'Could not find "Açıklamaları Göster"' };

      const rect = showDescEl.getBoundingClientRect();
      
      // Find all elements to the right of "Açıklamaları Göster" on the same vertical alignment
      const peers = elements.map(el => {
        const r = el.getBoundingClientRect();
        const isVisible = r.width > 0 && r.height > 0;
        if (!isVisible) return null;
        
        if (Math.abs(r.top - rect.top) < 15 && r.left > rect.right) {
          return {
            tagName: el.tagName,
            className: el.className,
            id: el.id,
            rect: { x: r.left, y: r.top, w: r.width, h: r.height },
            html: el.outerHTML.substring(0, 300)
          };
        }
        return null;
      }).filter(Boolean);

      return {
        showDescRect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
        peers
      };
    });

    console.log('Results:', JSON.stringify(elementDetails, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
}

run();
