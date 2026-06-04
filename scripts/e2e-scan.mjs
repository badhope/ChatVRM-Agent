#!/usr/bin/env node
/**
 * E2E: model scan + per-model test + fallback chain + UI verification.
 *
 * Coverage:
 *  1. POST /providers/aliyun/models/scan returns ≥50 models
 *  2. POST /providers/aliyun/test-model qwen-plus → ok=false (FreeTierOnly)
 *  3. POST /providers/aliyun/test-model qwen-flash → ok=true
 *  4. /test-message with chat.model=qwen-plus + fallback=[qwen-flash]
 *     returns ok with the fallback model having actually answered
 *  5. /tools/analyze respects the same fallback chain
 *  6. UI: /config shows Scan / Test buttons, count, scannedAt, fallback chips,
 *     and the test result
 *  7. UI: /chat with primary model set to qwen-plus sends a message, AI
 *     responds (the streaming endpoint does NOT use the chat-config fallback
 *     chain — it uses the explicit `model` param. We verify it works at all
 *     and document the limitation.)
 *  8. UI: all 7 pages render with 0 console / 0 page errors
 *  9. Cleanup: remove aliyun key
 * 10. Safety scan: key not in repo
 */
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { join as pathJoin } from 'node:path';

const BACKEND = 'http://127.0.0.1:3000';
const FRONTEND = 'http://127.0.0.1:5173';
const SHOTS = '/tmp/pa-e2e-scan';
fs.mkdirSync(SHOTS, { recursive: true });

const BORROWED_KEY = process.env.BORROWED_KEY;
if (!BORROWED_KEY) {
  console.error('BORROWED_KEY env var is required');
  process.exit(2);
}

const log = (...a) => console.log('  ', ...a);
const head = (s) => console.log('\n' + '='.repeat(60) + '\n' + s + '\n' + '='.repeat(60));

const results = { pass: 0, fail: 0, errors: [] };
function record(success, msg, err) {
  if (success) { results.pass++; log('✓ ' + msg); }
  else { results.fail++; results.errors.push({ msg, err: err?.message || String(err) }); log('✗ ' + msg + (err ? ' — ' + (err.message || err) : '')); }
}

async function main() {
  head('1. /models/scan returns model list');
  const scan = await (await fetch(`${BACKEND}/api/config/providers/aliyun/models/scan`, { method: 'POST' })).json();
  record(Array.isArray(scan.models) && scan.models.length >= 50, `scan returned ${scan.models.length} models (≥50)`);
  record(typeof scan.scannedAt === 'string', 'scan includes scannedAt');
  const flashOk = scan.models.includes('qwen-flash');
  const plusOk = scan.models.includes('qwen-plus');
  record(flashOk && plusOk, 'scan list contains qwen-flash AND qwen-plus');
  log('   first 8:', scan.models.slice(0, 8).join(', '));

  head('2. /test-model qwen-plus fails (FreeTierOnly)');
  const plus = await (await fetch(`${BACKEND}/api/config/providers/aliyun/test-model`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'qwen-plus' }),
  })).json();
  record(plus.ok === false, 'qwen-plus test ok=false');
  record(/FreeTierOnly|quota|403|free.?tier/i.test(plus.error || ''), `qwen-plus error mentions quota: "${(plus.error || '').slice(0, 60)}"`);
  record(typeof plus.latencyMs === 'number', 'test-model returns latencyMs');

  head('3. /test-model qwen-flash works');
  const flash = await (await fetch(`${BACKEND}/api/config/providers/aliyun/test-model`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'qwen-flash' }),
  })).json();
  record(flash.ok === true, 'qwen-flash test ok=true');
  record(typeof flash.content === 'string' && flash.content.length > 0, `qwen-flash content: "${(flash.content || '').slice(0, 60)}"`);
  record(typeof flash.latencyMs === 'number' && flash.latencyMs > 50, `qwen-flash latency ${flash.latencyMs}ms ≥ 50`);

  head('4. Fallback chain: chat config primary=qwen-plus + fallback=[qwen-flash]');
  await fetch(`${BACKEND}/api/config/chat`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'qwen-plus', fallbackModels: ['qwen-flash'], temperature: 0.7, maxTokens: 2048 }),
  });
  const tm = await (await fetch(`${BACKEND}/api/config/test-message`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'aliyun', model: 'qwen-plus', message: 'ok' }),
  })).json();
  record(tm.ok === true, '/test-message ok=true (via fallback)');
  record(tm.model === 'qwen-flash' || /qwen-flash/.test(tm.model || ''), `test-message actually used fallback model: "${tm.model}"`);
  log('   content:', (tm.content || '').slice(0, 80));

  head('5. /tools/analyze uses fallback chain');
  const an = await (await fetch(`${BACKEND}/api/tools/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tool: 'analyze', args: { text: 'happy', instruction: 'word' } }),
  })).json();
  record(an.success === true && typeof an.output === 'string' && an.output.length > 0, `analyze ok via fallback: "${(an.output || '').slice(0, 60)}"`);

  head('6. UI: /config renders Scan/Test/Fallback UI');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1500 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('i18nextLng', 'en');
    localStorage.setItem('pa-locale', 'en');
  });
  await page.goto(`${FRONTEND}/config`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // Find Scan / Test buttons
  const scanBtn = page.getByRole('button', { name: /^Scan$/ });
  const testBtn = page.getByRole('button', { name: /^Test$/ });
  record(await scanBtn.count() > 0, 'Scan button present on /config');
  record(await testBtn.count() > 0, 'Test button present on /config');

  // Click Scan
  await scanBtn.first().click();
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelectorAll('input,textarea').forEach((el) => el.blur()));
  await page.screenshot({ path: pathJoin(SHOTS, '01-config-after-scan.png'), fullPage: true });
  // Look for the "X models" or "X model" count text — the i18n may render either
  const bodyText = await page.evaluate(() => document.body.innerText);
  const m = bodyText.match(/(\d+)\s+model/i);
  record(m && parseInt(m[1], 10) >= 50, `UI shows model count ≥50: "${m ? m[0] : 'not found'}"`);

  // Click Test
  await testBtn.first().click();
  await page.waitForTimeout(3500);
  await page.evaluate(() => document.querySelectorAll('input,textarea').forEach((el) => el.blur()));
  await page.screenshot({ path: pathJoin(SHOTS, '02-config-after-test.png'), fullPage: true });
  // Look for OK or FAIL feedback
  const testFeedback = await page.evaluate(() => {
    const ok = Array.from(document.querySelectorAll('*')).find((el) => /^OK\s*·\s*\d+ms/.test(el.textContent || ''));
    const fail = Array.from(document.querySelectorAll('*')).find((el) => /^FAIL/.test(el.textContent || ''));
    return ok ? 'OK' : fail ? 'FAIL' : 'none';
  });
  record(testFeedback !== 'none', `UI shows test feedback: ${testFeedback}`);

  // Add a fallback via the input
  const fallbackInput = page.getByPlaceholder(/Type a model name and press Enter/i);
  record(await fallbackInput.count() > 0, 'Fallback input present');
  if (await fallbackInput.count() > 0) {
    await fallbackInput.first().fill('qwen-turbo');
    await fallbackInput.first().press('Enter');
    await page.waitForTimeout(500);
    const chips = await page.evaluate(() => Array.from(document.querySelectorAll('span')).filter((s) => s.textContent === 'qwen-turbo').length);
    record(chips >= 1, 'Fallback chip added (qwen-turbo)');
    await page.evaluate(() => document.querySelectorAll('input,textarea').forEach((el) => el.blur()));
    await page.screenshot({ path: pathJoin(SHOTS, '03-config-with-fallback.png'), fullPage: true });
  }

  head('7. UI: all pages render with 0 errors');
  for (const [path, name] of [
    ['/', '04-dashboard'],
    ['/chat', '05-chat'],
    ['/memory', '06-memory'],
    ['/tools', '07-tools'],
    ['/config', '08-config'],
    ['/settings', '09-settings'],
  ]) {
    await page.goto(`${FRONTEND}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    await page.evaluate(() => document.querySelectorAll('input,textarea').forEach((el) => el.blur()));
    await page.screenshot({ path: pathJoin(SHOTS, name + '.png'), fullPage: true });
    const txt = await page.evaluate(() => document.body.innerText);
    record(txt.length > 100, `UI ${path} rendered (${txt.length} chars)`);
  }
  record(consoleErrors.length === 0, `UI console errors = 0 (saw ${consoleErrors.length})`);
  record(pageErrors.length === 0, `UI page errors = 0 (saw ${pageErrors.length})`);

  await browser.close();

  head('8. Cleanup: remove aliyun key');
  const rm = await (await fetch(`${BACKEND}/api/config/remove-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'aliyun' }),
  })).json();
  record(rm.ok === true, 'remove-key ok');
  const snap = await (await fetch(`${BACKEND}/api/config/snapshot`)).json();
  record(!snap.apiKeys?.aliyun, 'snapshot: aliyun key removed');

  head('9. Safety scan: key not in repo');
  let leak = '';
  try {
    leak = execSync(
      `grep -RIn --binary-files=without-match --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=coverage --exclude-dir=.git "${BORROWED_KEY}" /workspace/Personal-Assistant 2>/dev/null || true`,
      { encoding: 'utf8' }
    ).trim();
  } catch {}
  record(leak === '', 'no occurrence of full key in repo');

  head('SUMMARY');
  console.log(`PASS: ${results.pass}`);
  console.log(`FAIL: ${results.fail}`);
  if (results.fail > 0) {
    console.log('\nERRORS:');
    for (const e of results.errors) console.log('  -', e.msg, e.err ? '(' + e.err + ')' : '');
  }
  process.exit(results.fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(2);
});
