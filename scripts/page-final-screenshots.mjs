import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = '/tmp/pa-screenshots-final';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const FRONTEND_URL = 'http://localhost:5173/';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${err.message}`));
  page.on('response', (resp) => {
    if (resp.status() >= 400) consoleErrors.push(`[net ${resp.status()}] ${resp.url()}`);
  });

  // Visit all pages
  for (const p of ['/', '/dashboard', '/chat', '/agent', '/tools', '/memory', '/graph', '/config', '/settings']) {
    const url = `${FRONTEND_URL}${p === '/' ? '' : p.slice(1)}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);
    const fname = p === '/' ? '00-landing' : p.slice(1);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${fname}.png`), fullPage: true });
    console.log(`✓ ${url}`);
  }

  // Config page interactions
  await page.goto(`${FRONTEND_URL}config`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);

  // Open sandbox section
  try {
    const sandbox = page.locator('button:has-text("Sandbox")').first();
    await sandbox.click();
    await page.waitForTimeout(500);
  } catch {}

  // Open reliability section
  try {
    const rel = page.locator('button:has-text("Reliability")').first();
    await rel.click();
    await page.waitForTimeout(500);
  } catch {}

  // Open data management section
  try {
    const data = page.locator('button:has-text("Data management")').first();
    await data.click();
    await page.waitForTimeout(500);
  } catch {}

  // Open environment section
  try {
    const env = page.locator('button:has-text("Environment")').first();
    await env.click();
    await page.waitForTimeout(500);
  } catch {}

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'config-all-sections-open.png'), fullPage: true });
  console.log('✓ config-all-sections-open');

  // Try opening provider modal
  const cfgBtn = page.locator('button:has-text("Configure")').first();
  if (await cfgBtn.count() > 0) {
    await cfgBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'config-provider-modal.png'), fullPage: true });
    console.log('✓ config-provider-modal');
  }

  await browser.close();

  console.log(`\nConsole errors: ${consoleErrors.length}`);
  consoleErrors.forEach((e) => console.log(`  ! ${e}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
