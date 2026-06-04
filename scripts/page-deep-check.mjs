import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = '/tmp/pa-screenshots-v2';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const FRONTEND_URL = 'http://localhost:5173/';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const allConsole = [];
  const allNetwork = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      allConsole.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => allConsole.push(`[pageerror] ${err.message}`));
  page.on('response', (resp) => {
    if (resp.status() >= 400) {
      allNetwork.push(`[${resp.status()}] ${resp.request().method()} ${resp.url()}`);
    }
  });

  // Visit each page and capture full DOM diagnostics
  for (const p of ['/', '/chat', '/agent', '/tools', '/memory', '/graph']) {
    const url = `${FRONTEND_URL}${p === '/' ? '' : p.slice(1)}`;
    console.log(`\n========== ${url} ==========`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    const fname = p === '/' ? 'home' : p.slice(1);

    // Get visible text
    const visibleText = await page.evaluate(() => document.body.innerText.slice(0, 800));
    console.log(`Visible text (first 800 chars):\n${visibleText}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `page-${fname}.png`), fullPage: true });
  }

  // Now Config deep
  console.log(`\n========== /config ==========`);
  await page.goto(`${FRONTEND_URL}config`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'page-config.png'), fullPage: true });

  // Click each section
  for (const name of ['Sandbox', 'Reliability', 'Data management', 'Environment']) {
    try {
      const btn = page.locator(`button:has-text("${name}")`).first();
      if (await btn.count() > 0) {
        await btn.click();
        await page.waitForTimeout(500);
      }
    } catch (e) {}
  }
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'page-config-all-open.png'), fullPage: true });

  // Click the first "Configure" button to open provider modal
  const cfgBtn = page.locator('button:has-text("Configure")').first();
  if (await cfgBtn.count() > 0) {
    await cfgBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'page-config-provider-modal.png'), fullPage: true });
  }

  await browser.close();

  console.log(`\n========== CONSOLE WARNINGS/ERRORS ==========`);
  if (allConsole.length === 0) {
    console.log('NONE');
  } else {
    for (const e of allConsole) console.log(e);
  }
  console.log(`\n========== NETWORK ERRORS ==========`);
  if (allNetwork.length === 0) {
    console.log('NONE');
  } else {
    for (const e of allNetwork) console.log(e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
