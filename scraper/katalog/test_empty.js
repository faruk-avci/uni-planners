import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto('https://sis.ozyegin.edu.tr/OZU_GWT/WEB/CourseCatalogOfferUI?locale=tr');
    await page.waitForTimeout(4000);
    
    // Focus and select AIC
    const inputHandle = await page.evaluateHandle(() => {
      const tds = Array.from(document.querySelectorAll('td'));
      const labelTd = tds.find(td => td.textContent.trim().startsWith('Konu'));
      return labelTd && labelTd.nextElementSibling ? labelTd.nextElementSibling.querySelector('input') : null;
    });
    
    const input = inputHandle.asElement();
    await input.click();
    await input.fill('');
    await input.type('AIC', { delay: 100 });
    await page.waitForTimeout(1500);
    
    // Click option
    const optionBox = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr[role="listitem"]'));
      const matching = rows.find(r => {
        const rect = r.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && r.textContent.trim().startsWith('AIC');
      });
      if (matching) {
        const rect = matching.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
      return null;
    });
    
    if (optionBox) {
      await page.mouse.click(optionBox.x, optionBox.y);
    }
    await page.waitForTimeout(1500);
    
    // Click search
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
      await page.mouse.click(searchBtnBox.x, searchBtnBox.y);
    }
    
    // Wait 5 seconds and take screenshot
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'empty_search.png' });
    console.log('Screenshot saved to empty_search.png');
    
    // Check if any popup is present
    const dialogs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('div'))
        .filter(div => div.textContent.includes('Kayıt bulunamadı') || div.textContent.includes('Warn') || div.textContent.includes('Hata'))
        .map(div => div.textContent.trim().substring(0, 100));
    });
    console.log('Dialog/Alert text found in DOM:', dialogs);
    
  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
}

run();
