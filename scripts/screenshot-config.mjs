import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = '/tmp/pa-screenshots';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const FRONTEND_URL = 'http://127.0.0.1:5174/';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`PAGE: ${err.message}`));

  console.log(`> goto ${FRONTEND_URL}`);
  await page.goto(FRONTEND_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-landing.png'), fullPage: true });

  // Visit dashboard
  console.log('> navigate to /dashboard');
  await page.goto(`${FRONTEND_URL}dashboard`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-dashboard.png'), fullPage: true });

  // Visit config
  console.log('> navigate to /config');
  await page.goto(`${FRONTEND_URL}config`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-config-initial.png'), fullPage: true });

  // The Config page has collapsible sections, each identified by a heading.
  // Find buttons in the main content (not nav links) by their i18n keys
  const sectionSelectors = [
    { name: 'overview', selector: 'button:has-text("Overview")' },
    { name: 'chat', selector: 'button:has-text("Chat")' },
    { name: 'providers', selector: 'button:has-text("Providers")' },
    { name: 'sandbox', selector: 'button:has-text("Sandbox")' },
    { name: 'reliability', selector: 'button:has-text("Reliability")' },
    { name: 'data', selector: 'button:has-text("Data")' },
    { name: 'env', selector: 'button:has-text("Environment")' },
  ];

  for (const { name, selector } of sectionSelectors) {
    // First make sure we are on /config
    if (!page.url().endsWith('/config')) {
      await page.goto(`${FRONTEND_URL}config`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(800);
    }
    const btn = page.locator(selector).first();
    if (await btn.count() > 0) {
      try {
        await btn.click();
        await page.waitForTimeout(700);
      } catch (e) {
        console.warn(`! click failed for ${name}: ${e.message}`);
      }
    } else {
      console.warn(`! ${name} button not found`);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `04-config-${name}.png`), fullPage: true });
  }

  // Visit chat
  console.log('> navigate to /chat');
  await page.goto(`${FRONTEND_URL}chat`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-chat.png'), fullPage: true });

  // Visit agent
  console.log('> navigate to /agent');
  await page.goto(`${FRONTEND_URL}agent`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-agent.png'), fullPage: true });

  // Visit tools
  console.log('> navigate to /tools');
  await page.goto(`${FRONTEND_URL}tools`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07-tools.png'), fullPage: true });

  // Visit memory
  console.log('> navigate to /memory');
  await page.goto(`${FRONTEND_URL}memory`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08-memory.png'), fullPage: true });

  // Visit graph
  console.log('> navigate to /graph');
  await page.goto(`${FRONTEND_URL}graph`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09-graph.png'), fullPage: true });

  // Visit settings
  console.log('> navigate to /settings');
  await page.goto(`${FRONTEND_URL}settings`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10-settings.png'), fullPage: true });

  await browser.close();

  console.log('\n=== Console errors ===');
  if (consoleErrors.length === 0) {
    console.log('NONE');
  } else {
    for (const e of consoleErrors) console.log(`- ${e}`);
  }
  console.log(`\nScreenshots saved to ${SCREENSHOT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
