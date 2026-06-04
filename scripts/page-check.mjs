import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = '/tmp/pa-screenshots-deep';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const FRONTEND_URL = 'http://localhost:5173/';

const issues = [];
const consoleErrors = [];
const networkErrors = [];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[console] ${msg.text()}`);
    } else if (msg.type() === 'warning') {
      console.log(`[warn] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${err.message}`));
  page.on('response', (resp) => {
    if (resp.status() >= 400) {
      networkErrors.push(`[${resp.status()}] ${resp.request().method()} ${resp.url()}`);
    }
  });

  console.log('=== Visit each page ===\n');

  const pages = ['/', '/dashboard', '/chat', '/agent', '/tools', '/memory', '/graph', '/config', '/settings'];
  for (const p of pages) {
    const url = `${FRONTEND_URL}${p === '/' ? '' : p.slice(1)}`;
    consoleErrors.length = 0;
    networkErrors.length = 0;
    console.log(`--- ${url} ---`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
      const fname = p === '/' ? 'home' : p.slice(1);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `page-${fname}.png`), fullPage: true });

      if (consoleErrors.length > 0) {
        issues.push(`Page ${p} has console errors: ${consoleErrors.join('; ')}`);
        consoleErrors.forEach((e) => console.log(`  ! ${e}`));
      }
      if (networkErrors.length > 0) {
        issues.push(`Page ${p} has network errors: ${networkErrors.join('; ')}`);
        networkErrors.forEach((e) => console.log(`  ! ${e}`));
      }

      // Inspect layout
      const layout = await page.evaluate(() => {
        const root = document.querySelector('main, [role="main"], #root > *');
        if (!root) return null;
        const rect = root.getBoundingClientRect();
        return {
          body: { w: document.body.scrollWidth, h: document.body.scrollHeight, ch: document.body.clientHeight },
          root: { w: rect.width, h: rect.height, top: rect.top, left: rect.left },
        };
      });
      console.log(`  Layout: ${JSON.stringify(layout)}`);

      // Count cards/sections
      const counts = await page.evaluate(() => ({
        buttons: document.querySelectorAll('button').length,
        inputs: document.querySelectorAll('input, textarea, select').length,
        cards: document.querySelectorAll('[class*="card" i], [class*="Card"]').length,
        sections: document.querySelectorAll('section').length,
      }));
      console.log(`  Counts: ${JSON.stringify(counts)}`);

      // Check for visible elements that have no content
      const emptyElements = await page.evaluate(() => {
        const empties = [];
        document.querySelectorAll('div, section, article').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width > 200 && r.height > 50 && el.children.length === 0 && el.textContent?.trim() === '') {
            empties.push({ tag: el.tagName, class: el.className, w: r.width, h: r.height });
          }
        });
        return empties.slice(0, 5);
      });
      if (emptyElements.length > 0) {
        console.log(`  Empty large elements: ${emptyElements.length}`);
        emptyElements.forEach((e) => console.log(`    - ${e.tag}.${e.class} ${e.w}x${e.h}`));
      }
    } catch (e) {
      issues.push(`Page ${p} failed to load: ${e.message}`);
      console.log(`  ! FAIL: ${e.message}`);
    }
  }

  // ── Test the Config page interactions in detail ──
  console.log('\n=== Config page deep interaction ===\n');
  await page.goto(`${FRONTEND_URL}config`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'config-default.png'), fullPage: true });

  // List all section headers
  const sectionButtons = await page.$$eval('button', (btns) =>
    btns.map((b) => ({
      text: b.textContent?.trim().slice(0, 60),
      aria: b.getAttribute('aria-expanded'),
      visible: b.offsetParent !== null,
      type: b.getAttribute('type'),
    })),
  );
  console.log('Buttons in main area (with text):');
  sectionButtons.slice(0, 30).forEach((b) => console.log(`  - "${b.text}" exp=${b.aria}`));

  // Test the chat section: change temperature
  console.log('\n--- Chat section interactions ---');
  // The chat section is open by default; look for sliders
  const sliders = await page.$$('input[type="range"]');
  console.log(`Range inputs found: ${sliders.length}`);
  for (let i = 0; i < sliders.length; i++) {
    const id = await sliders[i].getAttribute('id');
    const min = await sliders[i].getAttribute('min');
    const max = await sliders[i].getAttribute('max');
    const val = await sliders[i].getAttribute('value');
    console.log(`  Slider ${i}: id=${id} min=${min} max=${max} value=${val}`);
  }

  // Test the system prompt textarea
  const textareas = await page.$$('textarea');
  console.log(`Textareas found: ${textareas.length}`);

  // Test the model select
  const selects = await page.$$('select, [role="combobox"], [role="listbox"]');
  console.log(`Selects found: ${selects.length}`);

  // Test opening a provider section / edit modal
  console.log('\n--- Provider section ---');
  // The provider cards may have edit/test buttons
  const providerButtons = await page.$$eval('button', (btns) =>
    btns
      .filter((b) => /test|edit|configure|setting/i.test(b.textContent ?? ''))
      .map((b) => b.textContent?.trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 20),
  );
  console.log(`Provider-related buttons: ${JSON.stringify(providerButtons)}`);

  // Try clicking a Test button
  const testBtn = page.locator('button:has-text("Test")').first();
  if (await testBtn.count() > 0) {
    try {
      console.log('Clicking first Test button...');
      await testBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'config-test-toast.png'), fullPage: true });
    } catch (e) {
      console.log(`  ! Test click failed: ${e.message}`);
    }
  }

  // Try opening a Config button on a provider
  const configBtn = page.locator('button:has-text("Config")').first();
  if (await configBtn.count() > 0) {
    try {
      console.log('Clicking first Config button...');
      await configBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'config-provider-modal.png'), fullPage: true });

      // Close modal
      const closeBtn = page.locator('button:has-text("Cancel"), button:has-text("Close"), [aria-label="Close"]').first();
      if (await closeBtn.count() > 0) {
        await closeBtn.click();
        await page.waitForTimeout(500);
      }
    } catch (e) {
      console.log(`  ! Config click failed: ${e.message}`);
    }
  }

  // Test export button
  console.log('\n--- Data section (export) ---');
  // Scroll to data section and open
  const dataSectionBtn = page.locator('button:has-text("Data")').first();
  if (await dataSectionBtn.count() > 0) {
    try {
      await dataSectionBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'config-data-open.png'), fullPage: true });
    } catch (e) {
      console.log(`  ! Data section click failed: ${e.message}`);
    }
  }

  // Final check on chat page
  console.log('\n--- Chat page ---');
  await page.goto(`${FRONTEND_URL}chat`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  const chatInputs = await page.$$('textarea, input[type="text"]');
  console.log(`Chat inputs: ${chatInputs.length}`);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'chat-detail.png'), fullPage: true });

  // Check what happens if I type and submit
  if (chatInputs.length > 0) {
    const ta = chatInputs[0];
    await ta.fill('Hello, world');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'chat-with-input.png'), fullPage: true });
  }

  await browser.close();

  console.log('\n\n========== ISSUES SUMMARY ==========');
  if (issues.length === 0) {
    console.log('No major issues detected.');
  } else {
    issues.forEach((i) => console.log(`  - ${i}`));
  }
  console.log(`\nConsole errors total: ${consoleErrors.length}`);
  console.log(`Network errors total: ${networkErrors.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
