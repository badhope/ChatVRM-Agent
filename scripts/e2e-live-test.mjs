import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = '/tmp/pa-e2e-live';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:3000';

async function main() {
  console.log('========== STARTING END-TO-END LIVE TEST ==========');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const networkErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('response', (resp) => {
    if (resp.status() >= 400) {
      const u = new URL(resp.url());
      // Skip /api/chat 4xx/5xx (those are expected when free tier is exhausted)
      if (!u.pathname.startsWith('/api/chat')) {
        networkErrors.push(`[${resp.status()}] ${resp.request().method()} ${u.pathname}`);
      }
    }
  });

  // Set EN locale
  await page.goto(`${FRONTEND_URL}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('i18nextLng', 'en');
    localStorage.setItem('pa-locale', 'en');
  });

  // ---- /config: verify Aliyun is configured ----
  console.log('\n========== /config: verify Aliyun configured ==========');
  await page.goto(`${FRONTEND_URL}/config`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  // Take screenshot with the key input blurred (hide key value)
  await page.evaluate(() => {
    document.querySelectorAll('input[type="password"], input[type="text"]').forEach((el) => {
      (el).blur();
    });
  });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-config-overview.png'), fullPage: true });
  // Navigate to providers section
  const providersLink = page.locator('button:has-text("Providers"), button:has-text("API Keys")').first();
  if (await providersLink.count() > 0) {
    await providersLink.click();
    await page.waitForTimeout(500);
  }
  // Find aliyun row
  const aliyunText = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hasAliyun: text.includes('Aliyun'),
      hasConfigured: text.includes('Configured') || text.includes('sk-9') || text.match(/sk-\d+\*\*\*\*/),
    };
  });
  console.log('  Aliyun visible in Config:', aliyunText.hasAliyun, '· key appears masked:', aliyunText.hasConfigured);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-config-providers.png'), fullPage: true });

  // ---- Test connection via API (avoid clicking buttons in Playwright) ----
  console.log('\n========== Live API call test ==========');
  // Use direct API call (more reliable than clicking through the UI)
  const testResp = await fetch(`${BACKEND_URL}/api/config/test-message`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'aliyun', model: 'qwen-flash', message: 'Reply with one word: ready' }),
  });
  const testData = await testResp.json();
  console.log('  Test message response:', JSON.stringify(testData));

  // ---- /chat: real conversation ----
  console.log('\n========== /chat: live conversation ==========');
  await page.goto(`${FRONTEND_URL}/chat`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-chat-empty.png'), fullPage: true });
  // Type a message
  const inputBox = page.locator('textarea, input[type="text"]').last();
  await inputBox.click();
  await inputBox.fill('用一句话介绍你自己, 30字以内');
  // Find send button (it's usually a button with Send icon or text)
  const sendBtn = page.locator('button[type="submit"], button:has(svg)').filter({ has: page.locator('svg') }).last();
  await sendBtn.click();
  // Wait for streaming response
  console.log('  Waiting for response (up to 30s)...');
  let responded = false;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    const text = await page.evaluate(() => document.body.innerText);
    if (
      text.includes('通义') ||
      text.includes('qwen') ||
      text.includes('阿里') ||
      text.includes('DashScope') ||
      text.includes('我是') ||
      text.includes('Hello') ||
      (text.match(/assistant|AI/gi) && text.length > 300)
    ) {
      responded = true;
      console.log(`  Got response after ${i + 1}s`);
      break;
    }
  }
  await page.waitForTimeout(2000); // allow stream to finish
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-chat-response.png'), fullPage: true });
  const chatText = await page.evaluate(() => document.body.innerText);
  console.log('  Chat body preview (last 600):');
  console.log('    ' + chatText.slice(-600).split('\n').join('\n    '));

  // ---- /memory: check that the conversation was stored ----
  console.log('\n========== /memory ==========');
  await page.goto(`${FRONTEND_URL}/memory`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-memory.png'), fullPage: true });
  const memText = await page.evaluate(() => document.body.innerText);
  const memHasItems = memText.length > 200;
  console.log('  Memory page rendered:', memHasItems);

  // ---- /tools: verify tools page ----
  console.log('\n========== /tools ==========');
  await page.goto(`${FRONTEND_URL}/tools`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06-tools.png'), fullPage: true });

  // ---- /settings: check personality, emotion, theme ----
  console.log('\n========== /settings ==========');
  await page.goto(`${FRONTEND_URL}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07-settings.png'), fullPage: true });

  // ---- /dashboard ----
  console.log('\n========== /dashboard ==========');
  await page.goto(`${FRONTEND_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08-dashboard.png'), fullPage: true });

  // ---- Multi-turn chat: send a follow-up ----
  console.log('\n========== Multi-turn chat ==========');
  await page.goto(`${FRONTEND_URL}/chat`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const input2 = page.locator('textarea, input[type="text"]').last();
  await input2.click();
  await input2.fill('继续用一句话回答: 1+1=?');
  const send2 = page.locator('button[type="submit"], button:has(svg)').filter({ has: page.locator('svg') }).last();
  await send2.click();
  await page.waitForTimeout(8000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09-chat-multi.png'), fullPage: true });

  await browser.close();

  // ---- Summary ----
  console.log('\n========== CONSOLE ERRORS (excluding expected) ==========');
  if (consoleErrors.length === 0) console.log('  NONE');
  else {
    for (const e of consoleErrors.slice(0, 8)) console.log('  ' + e);
  }

  console.log('\n========== PAGE ERRORS ==========');
  if (pageErrors.length === 0) console.log('  NONE');
  else for (const e of pageErrors) console.log('  ' + e);

  console.log('\n========== NETWORK ERRORS ==========');
  if (networkErrors.length === 0) console.log('  NONE');
  else {
    for (const e of networkErrors.slice(0, 8)) console.log('  ' + e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
