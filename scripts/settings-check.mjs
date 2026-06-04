import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = '/tmp/pa-settings-check';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const FRONTEND_URL = 'http://localhost:5173';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const networkErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => pageErrors.push(`[pageerror] ${err.message}`));
  page.on('response', (resp) => {
    if (resp.status() >= 400) networkErrors.push(`[${resp.status()}] ${resp.request().method()} ${resp.url()}`);
  });

  // EN locale
  await page.goto(`${FRONTEND_URL}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.setItem('i18nextLng', 'en'));
  await page.evaluate(() => localStorage.setItem('pa-locale', 'en'));

  // Visit /settings
  console.log('\n========== /settings (EN) ==========');
  await page.goto(`${FRONTEND_URL}/settings`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  const enText = await page.evaluate(() => document.body.innerText);
  console.log('Visible text (first 1500):\n' + enText.slice(0, 1500));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'settings-en.png'), fullPage: true });

  // Look for literal i18n keys (settings.something)
  const literalKeys = enText.match(/settings\.[a-zA-Z_.]+/g) || [];
  console.log(`\nLiteral i18n keys leaked: ${literalKeys.length}`);
  for (const k of [...new Set(literalKeys)]) console.log('  - ' + k);

  // ZH locale
  await page.evaluate(() => localStorage.setItem('i18nextLng', 'zh'));
  await page.evaluate(() => localStorage.setItem('pa-locale', 'zh'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  console.log('\n========== /settings (ZH) ==========');
  const zhText = await page.evaluate(() => document.body.innerText);
  console.log('Visible text (first 1500):\n' + zhText.slice(0, 1500));
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'settings-zh.png'), fullPage: true });

  // Look for literal i18n keys
  const literalKeysZh = zhText.match(/settings\.[a-zA-Z_.]+/g) || [];
  console.log(`\nLiteral i18n keys leaked: ${literalKeysZh.length}`);
  for (const k of [...new Set(literalKeysZh)]) console.log('  - ' + k);

  // Click on a different personality to test the switch API
  console.log('\n========== Test personality switch (ZH) ==========');
  const creativeBtn = page.locator('button:has-text("创意天才")').first();
  if (await creativeBtn.count() > 0) {
    await creativeBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'settings-zh-creative.png'), fullPage: true });
    const afterText = await page.evaluate(() => document.body.innerText);
    const stillCreative = afterText.includes('当前') && afterText.includes('创意天才');
    console.log(`  Clicked 创意天才, current badge on 创意天才: ${stillCreative}`);
  } else {
    console.log('  创意天才 button not found');
  }

  // Click on Dark theme
  const darkBtn = page.locator('button:has-text("深色")').first();
  if (await darkBtn.count() > 0) {
    await darkBtn.click();
    await page.waitForTimeout(500);
  }

  await browser.close();

  console.log('\n========== CONSOLE ERRORS ==========');
  if (consoleErrors.length === 0) console.log('NONE');
  else for (const e of consoleErrors) console.log(e);

  console.log('\n========== PAGE ERRORS ==========');
  if (pageErrors.length === 0) console.log('NONE');
  else for (const e of pageErrors) console.log(e);

  console.log('\n========== NETWORK ERRORS ==========');
  if (networkErrors.length === 0) console.log('NONE');
  else for (const e of networkErrors) console.log(e);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
