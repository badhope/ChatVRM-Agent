import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = '/tmp/pa-settings-v2';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:3000';

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
    if (resp.status() >= 400 && !resp.url().includes('__test__')) {
      networkErrors.push(`[${resp.status()}] ${resp.request().method()} ${resp.url()}`);
    }
  });

  // Set locale to EN
  await page.goto(`${FRONTEND_URL}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('i18nextLng', 'en');
    localStorage.setItem('pa-locale', 'en');
  });

  // ---- Scenario 1: Normal load ----
  console.log('\n========== /settings (EN) — normal load ==========');
  await page.goto(`${FRONTEND_URL}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const enText = await page.evaluate(() => document.body.innerText);
  const literalEn = enText.match(/[a-zA-Z]+\.[a-zA-Z_.]+(?=[\s,。!?])/g) || [];
  console.log('  Body has key-like leaks:', literalEn.filter((k) => k.startsWith('settings.') || k.startsWith('errors.') || k.startsWith('memory.')).length);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-en-normal.png'), fullPage: true });

  // ---- Scenario 2: Switch personality ----
  console.log('\n========== Switch personality ==========');
  // Wait for personality buttons to render (they have aria "Friendly Mentor" etc.)
  await page.waitForSelector('button:has-text("Creative Genius")', { timeout: 10000 });
  const creativeBtn = page.locator('button:has-text("Creative Genius")').first();
  if (await creativeBtn.count() > 0) {
    await creativeBtn.click();
    await page.waitForTimeout(2000);
    const after = await page.evaluate(() => document.body.innerText);
    const ok = after.includes('Creative Genius') && after.includes('Current');
    console.log('  Switched to Creative Genius:', ok);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-en-after-switch.png'), fullPage: true });
  } else {
    console.log('  Creative Genius button not found');
  }

  // ---- Scenario 3: Click Clear Memory → confirm dialog ----
  console.log('\n========== Confirm dialog ==========');
  const clearBtn = page.locator('button:has-text("Clear memory")').first();
  if (await clearBtn.count() > 0) {
    await clearBtn.click();
    await page.waitForTimeout(800);
    const dialogVisible = await page.locator('[role="dialog"]').isVisible();
    const dialogTitle = await page.locator('[role="dialog"] h3').first().textContent();
    console.log('  Dialog visible:', dialogVisible, '· title:', dialogTitle);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-en-confirm-dialog.png'), fullPage: true });
    // Click cancel
    const cancelBtn = page.locator('[role="dialog"] button:has-text("Cancel")');
    if (await cancelBtn.count() > 0) {
      await cancelBtn.click();
      await page.waitForTimeout(300);
      console.log('  Cancelled, dialog closed:', !(await page.locator('[role="dialog"]').isVisible()));
    }
  }

  // ---- Scenario 4: Simulate network error → expect inline error ----
  console.log('\n========== Network error scenario ==========');
  // Block backend API requests only — match host:port or specific paths, not /src/api/*.ts
  const networkApiUrl = (url) => {
    const u = new URL(url.toString());
    return u.port === '3000' || /^\/api\//.test(u.pathname);
  };
  await page.route(networkApiUrl, (route) => route.abort('failed'));
  // Reload settings page
  await page.goto(`${FRONTEND_URL}/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-en-network-error.png'), fullPage: true });
  // Now the ErrorState should show "Network error — check your connection" + a "Network error" kind chip
  const body = await page.evaluate(() => document.body.innerText);
  const hasNetworkLabel = body.includes('Network error');
  const hasRetry = (await page.locator('button:has-text("Retry"), button:has-text("重试")').count()) > 0;
  console.log('  Network error label visible:', hasNetworkLabel);
  console.log('  Retry button visible:', hasRetry);
  // Unblock — must pass the SAME url function we used to register
  await page.unroute(networkApiUrl);

  // ---- Scenario 5: 404 simulation ----
  console.log('\n========== 404 scenario ==========');
  // Re-route specific endpoint to return 404
  const personalityRoute = (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) });
  await page.route('**/api/personality', personalityRoute);
  await page.route('**/api/personality/', personalityRoute);
  await page.goto(`${FRONTEND_URL}/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-en-404-personality.png'), fullPage: true });
  // Check if error message is shown
  const notFoundShown = (await page.locator('text=/Could not load|personality/i').count()) > 0;
  console.log('  Personality load error visible:', notFoundShown);
  // For 404, retry should NOT be shown (not retryable)
  const retryBtnCount = await page.locator('button:has-text("Retry")').count();
  console.log('  Retry button count (should be 0 for not-retryable 404):', retryBtnCount);
  await page.unroute('**/api/personality');
  await page.unroute('**/api/personality/');

  // ---- Scenario 6: Chinese locale ----
  console.log('\n========== /settings (ZH) — normal load ==========');
  await page.evaluate(() => {
    localStorage.setItem('i18nextLng', 'zh');
    localStorage.setItem('pa-locale', 'zh');
  });
  await page.goto(`${FRONTEND_URL}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const zhText = await page.evaluate(() => document.body.innerText);
  const literalZh = zhText.match(/[a-zA-Z]+\.[a-zA-Z_.]+(?=[\s,。!?])/g) || [];
  console.log('  ZH body has key-like leaks:', literalZh.filter((k) => k.startsWith('settings.') || k.startsWith('errors.')).length);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-zh-normal.png'), fullPage: true });

  // Open confirm dialog in ZH
  const clearBtnZh = page.locator('button:has-text("清空记忆")').first();
  if (await clearBtnZh.count() > 0) {
    await clearBtnZh.click();
    await page.waitForTimeout(800);
    const titleZh = await page.locator('[role="dialog"] h3').first().textContent();
    console.log('  ZH confirm title:', titleZh);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07-zh-confirm-dialog.png'), fullPage: true });
    const cancelBtn = page.locator('[role="dialog"] button:has-text("取消")');
    if (await cancelBtn.count() > 0) {
      await cancelBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // ---- Scenario 7: Retry actually recovers from network error ----
  console.log('\n========== Retry recovery ==========');
  // We are currently in ZH locale; reset to EN for this scenario so we
  // can match against English error labels.
  await page.evaluate(() => {
    localStorage.setItem('i18nextLng', 'en');
    localStorage.setItem('pa-locale', 'en');
  });
  await page.route(networkApiUrl, (route) => route.abort('failed'));
  await page.goto(`${FRONTEND_URL}/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  // Look for the error in compact ErrorState (the kind chip "Network error" is rendered)
  const errCount = await page.locator('text=Network error').count();
  console.log('  "Network error" mentions before retry:', errCount, '(should be ≥ 3 for emotion/personality/stats)');
  // Unblock then click ALL retry buttons (one per section) — re-query each time
  // because each successful retry removes the button from the DOM.
  await page.unroute(networkApiUrl);
  let totalClicks = 0;
  for (let i = 0; i < 6; i++) {
    const btns = await page.locator('button:has-text("Retry")').all();
    if (btns.length === 0) break;
    await btns[0].click();
    totalClicks++;
    await page.waitForTimeout(800);
  }
  console.log('  Retry buttons clicked:', totalClicks);
  await page.waitForTimeout(1500);
  const errCountAfter = await page.locator('text=Network error').count();
  console.log('  "Network error" mentions after clicking all retries:', errCountAfter, '(should be 0)');

  // ---- Scenario 8: Last updated timestamp changes ----
  console.log('\n========== Last updated / staleness ==========');
  await page.goto(`${FRONTEND_URL}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const lastUpdatedText = await page.locator('text=/Updated|更新于/').first().textContent();
  console.log('  Last updated label:', lastUpdatedText?.trim());

  // ---- Scenario 9: Confirm clear → actually calls API and updates UI ----
  console.log('\n========== Clear memory end-to-end ==========');
  const apiCallsCleared = [];
  page.on('request', (req) => {
    if (req.url().endsWith('/api/memory/clear') || req.url().endsWith('/api/memory/clear/')) {
      apiCallsCleared.push(`${req.method()} ${new URL(req.url()).pathname}`);
    }
  });
  // Try both EN and ZH labels
  let clearBtnFinal = page.locator('button:has-text("Clear memory")').first();
  if ((await clearBtnFinal.count()) === 0) {
    clearBtnFinal = page.locator('button:has-text("清空记忆")').first();
  }
  if (await clearBtnFinal.count() > 0) {
    await clearBtnFinal.click();
    await page.waitForTimeout(500);
    let okBtn = page.locator('[role="dialog"] button:has-text("Clear all")');
    if ((await okBtn.count()) === 0) {
      okBtn = page.locator('[role="dialog"] button:has-text("确认清空")');
    }
    if (await okBtn.count() > 0) {
      await okBtn.click();
      await page.waitForTimeout(1500);
      console.log('  POST /api/memory/clear called:', apiCallsCleared.length > 0);
      // The success toast text in EN is "Cleared" and in ZH is "已清空"
      const successToast = (await page.locator('text=Cleared').count() + await page.locator('text=已清空').count()) > 0;
      console.log('  Success toast visible:', successToast);
    }
  }

  await browser.close();

  console.log('\n========== CONSOLE ERRORS ==========');
  if (consoleErrors.length === 0) console.log('  NONE');
  else for (const e of consoleErrors) console.log('  ' + e);

  console.log('\n========== PAGE ERRORS ==========');
  if (pageErrors.length === 0) console.log('  NONE');
  else for (const e of pageErrors) console.log('  ' + e);

  console.log('\n========== NETWORK ERRORS (unrelated to test injection) ==========');
  const realNetworkErrors = networkErrors.filter((e) => !e.includes('__test__'));
  if (realNetworkErrors.length === 0) console.log('  NONE');
  else for (const e of realNetworkErrors) console.log('  ' + e);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
