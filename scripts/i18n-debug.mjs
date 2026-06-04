import { chromium } from 'playwright';

const FRONTEND_URL = 'http://localhost:5173/';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${FRONTEND_URL}chat`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Look for emptySub
  const html = await page.evaluate(() => {
    const found = document.body.innerHTML;
    // find lines with 'emptySub' and 'Real streaming'
    const m = found.match(/.{0,100}Real streaming.{0,100}/);
    return m ? m[0] : 'not found';
  });
  console.log('HTML around "Real streaming":');
  console.log(html);

  console.log('\n--- i18n debug ---');
  const i18nState = await page.evaluate(() => {
    // Try to read the i18n instance from window
    return {
      language: document.documentElement.lang,
      body: document.body.innerText.includes('{provider}'),
      body2: document.body.innerText.includes('{n}'),
    };
  });
  console.log(JSON.stringify(i18nState, null, 2));

  // Click on language switcher to zh
  console.log('\n--- Try switching to zh ---');
  // Find the language menu
  const langBtn = page.locator('button:has-text("EN")').first();
  console.log(`EN button found: ${await langBtn.count()}`);
  if (await langBtn.count() > 0) {
    await langBtn.click();
    await page.waitForTimeout(500);
    const zhBtn = page.locator('text=/中文|中/').first();
    console.log(`zh button found: ${await zhBtn.count()}`);
    if (await zhBtn.count() > 0) {
      await zhBtn.click();
      await page.waitForTimeout(1000);
      const newText = await page.evaluate(() => document.body.innerText.slice(0, 600));
      console.log(`\nText after switch:\n${newText}`);
    }
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
