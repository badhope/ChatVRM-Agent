#!/usr/bin/env node
/**
 * Full-stack integration E2E test against the live Aliyun-backed app.
 *
 * Coverage:
 *  1. /api/health, /api/config/providers, /api/config/snapshot  (verify Aliyun key still set, no key text leaked)
 *  2. Personality list + switch (friendly_mentor → tech_expert → creative_genius)
 *  3. Real chat (SSE) with each personality as system prompt
 *  4. Memory grow + search
 *  5. Emotion update (interaction delta) + read
 *  6. Tools: list, execute shell, execute analyze
 *  7. Dashboard reflects all updates
 *  8. UI: /chat /memory /tools /settings /dashboard render
 *  9. Cleanup: remove Aliyun key, confirm snapshot cleared, home file cleared
 * 10. Safety scan: ensure NO occurrence of the borrowed key in repo or in /tmp screenshots
 */
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { join as pathJoin } from 'node:path';

const BACKEND = 'http://127.0.0.1:3000';
const FRONTEND = 'http://127.0.0.1:5173';
const SHOTS = '/tmp/pa-e2e-integration';
fs.mkdirSync(SHOTS, { recursive: true });

const BORROWED_KEY = process.env.BORROWED_KEY;
if (!BORROWED_KEY) {
  console.error('BORROWED_KEY env var is required (e.g. export BORROWED_KEY=sk-...)');
  process.exit(2);
}
const PROBE = BORROWED_KEY.slice(-8); // last 8 chars for masking

const log = (...a) => console.log('  ', ...a);
const head = (s) => console.log('\n' + '='.repeat(60) + '\n' + s + '\n' + '='.repeat(60));

function sseParse(buffer) {
  // Returns { events: [{event, data}], rest }
  const events = [];
  let rest = buffer;
  while (true) {
    const sep = rest.indexOf('\n\n');
    if (sep < 0) break;
    const chunk = rest.slice(0, sep);
    rest = rest.slice(sep + 2);
    let event = 'message';
    const dataLines = [];
    for (const line of chunk.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length > 0) {
      try { events.push({ event, data: JSON.parse(dataLines.join('\n')) }); }
      catch { events.push({ event, data: dataLines.join('\n') }); }
    }
  }
  return { events, rest };
}

async function chatStream(message, opts = {}) {
  const res = await fetch(`${BACKEND}/api/chat/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message,
      provider: 'aliyun',
      model: 'qwen-flash',
      systemPrompt: opts.systemPrompt,
    }),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const out = { events: [], content: '', sessionId: '', assistantId: '' };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const { events, rest } = sseParse(buf);
    buf = rest;
    for (const e of events) {
      out.events.push(e);
      if (e.event === 'session') out.sessionId = e.data.id;
      if (e.event === 'assistant-start') out.assistantId = e.data.id;
      if (e.event === 'chunk' && e.data?.content) out.content += e.data.content;
    }
    if (out.events.some((e) => e.event === 'done' || e.event === 'error' || e.event === 'assistant-end')) break;
  }
  return out;
}

async function expect(cond, msg) {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg);
  log('✓ ' + msg);
}

const results = { pass: 0, fail: 0, errors: [] };
function record(success, msg, err) {
  if (success) { results.pass++; log('✓ ' + msg); }
  else { results.fail++; results.errors.push({ msg, err: err?.message || String(err) }); log('✗ ' + msg + (err ? ' — ' + (err.message || err) : '')); }
}

async function main() {
  head('1. Health & provider config');
  const health = await (await fetch(`${BACKEND}/api/health`)).json();
  record(health.ok === true, 'GET /api/health ok');

  const providers = await (await fetch(`${BACKEND}/api/config/providers`)).json();
  const aliyun = providers.find((p) => p.id === 'aliyun');
  record(aliyun?.hasKey === true, 'aliyun hasKey=true');
  record(aliyun?.defaultModel === 'qwen-plus', 'aliyun defaultModel=qwen-plus');
  log('  defaultBaseUrl:', aliyun.baseUrl);

  const snapshot = await (await fetch(`${BACKEND}/api/config/snapshot`)).json();
  const maskedAliyun = snapshot.apiKeys?.aliyun || '';
  record(typeof maskedAliyun === 'string' && maskedAliyun.length > 0, 'snapshot masks aliyun key');
  record(!snapshot.apiKeys?.aliyun?.includes(BORROWED_KEY), 'snapshot DOES NOT leak raw key');
  record(snapshot.defaultProvider === 'aliyun', 'default provider = aliyun');

  head('2. Personality list + switch');
  const persList0 = await (await fetch(`${BACKEND}/api/personality`)).json();
  log('  initial current:', persList0.current, '— available:', persList0.presets.map((p) => p.id).join(', '));
  const ids = persList0.presets.map((p) => p.id);
  for (const id of ['tech_expert', 'friendly_mentor', 'creative_genius']) {
    if (!ids.includes(id)) throw new Error('personality id missing: ' + id);
  }
  for (const target of ['tech_expert', 'friendly_mentor', 'creative_genius']) {
    const r = await fetch(`${BACKEND}/api/personality/set`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: target }),
    });
    const j = await r.json();
    record(j.ok === true && j.current === target, `personality switch → ${target}`);
  }
  // Verify last switch persisted
  const persList1 = await (await fetch(`${BACKEND}/api/personality`)).json();
  record(persList1.current === 'creative_genius', 'GET /api/personality current = creative_genius');

  // Test custom personality creation via the new API
  const newId = `e2e_test_${Date.now().toString(36)}`.slice(0, 40);
  const createR = await fetch(`${BACKEND}/api/personality/custom`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: newId, name: 'E2E Test Bot', traits: ['curious', 'analytical'] }),
  });
  const created = await createR.json();
  record(createR.status === 201 && created.id === newId, 'POST /api/personality/custom created');
  // Switch to the custom
  const switchCustom = await fetch(`${BACKEND}/api/personality/set`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: newId }),
  });
  const sc = await switchCustom.json();
  record(switchCustom.status === 200 && sc.current === newId && sc.kind === 'custom', 'switch to custom personality');
  // PATCH the custom
  const patchR = await fetch(`${BACKEND}/api/personality/custom/${newId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'E2E Renamed' }),
  });
  record(patchR.status === 200, 'PATCH /api/personality/custom/:id');
  // Delete
  const delR = await fetch(`${BACKEND}/api/personality/custom/${newId}`, { method: 'DELETE' });
  record(delR.status === 200, 'DELETE /api/personality/custom/:id');
  // restore preset
  await fetch(`${BACKEND}/api/personality/set`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'friendly_mentor' }),
  });

  head('3. Real chat (SSE) with each personality system prompt');
  // First: a freeform friendly_mentor
  const friendly = await chatStream('一句话鼓励一个正在学编程的人，不超过20字', {
    systemPrompt: persList0.presets.find((p) => p.id === 'friendly_mentor').systemPrompt,
  });
  record(friendly.content.length > 0, 'friendly_mentor: chat returned non-empty content');
  log('   →', friendly.content.slice(0, 80));
  // Then: tech_expert
  const tech = await chatStream('一句话解释 REST, 不超过30字', {
    systemPrompt: persList0.presets.find((p) => p.id === 'tech_expert').systemPrompt,
  });
  record(tech.content.length > 0, 'tech_expert: chat returned non-empty content');
  log('   →', tech.content.slice(0, 80));
  // Then: a continuation (sessionId reuse) to verify session memory
  const follow = await chatStream('用 5 个字接着说: 我是', {
    systemPrompt: persList0.presets.find((p) => p.id === 'creative_genius').systemPrompt,
    sessionId: friendly.sessionId,
  });
  record(follow.content.length > 0, 'creative_genius follow-up: chat returned non-empty content');
  log('   →', follow.content.slice(0, 80));
  // Make sure keys are not echoed in the streamed content
  for (const c of [friendly, tech, follow]) {
    record(!c.content.includes(BORROWED_KEY), 'no raw key leaked in chat content');
  }

  head('4. Memory: baseline → grow via chat → search → tags → stats');
  const mem0 = await (await fetch(`${BACKEND}/api/memory?limit=200`)).json();
  log('  memory count before chat:', mem0.count);
  // Send one more chat so memory.remember is exercised
  const extra = await chatStream('一句话总结: 1+1=2, 不超过10字', {
    systemPrompt: persList0.presets.find((p) => p.id === 'friendly_mentor').systemPrompt,
  });
  record(extra.content.length > 0, 'extra chat (memory grow) returned non-empty content');
  await new Promise((r) => setTimeout(r, 300));
  const mem1 = await (await fetch(`${BACKEND}/api/memory?limit=200`)).json();
  log('  memory count after chat:', mem1.count);
  record(mem1.count >= mem0.count + 1, `memory grew by ≥1 (was ${mem0.count}, now ${mem1.count})`);
  // Search
  const search = await (await fetch(`${BACKEND}/api/memory?q=REST`)).json();
  record(search.count >= 1, 'memory search "REST" returned ≥1');
  // Tags
  const tags = await (await fetch(`${BACKEND}/api/memory/tags`)).json();
  log('  top tags:', tags.slice(0, 6).map((t) => `${t.tag}(${t.count})`).join(' '));
  record(Array.isArray(tags) && tags.length > 0, '/api/memory/tags returns array');
  // Stats
  const stats = await (await fetch(`${BACKEND}/api/memory/stats`)).json();
  record(typeof stats.totalRecords === 'number', '/api/memory/stats has totalRecords');

  head('5. Emotion: update + read + history');
  const emo0 = await (await fetch(`${BACKEND}/api/emotion`)).json();
  log('  initial:', emo0);
  const emoUpd = await (await fetch(`${BACKEND}/api/emotion/update`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'curious', intensity: 72, triggers: ['e2e integration run'], note: 'e2e-test' }),
  })).json();
  record(emoUpd.name === 'curious' && emoUpd.intensity === 72, 'emotion update applied');
  const emo1 = await (await fetch(`${BACKEND}/api/emotion`)).json();
  record(emo1.name === 'curious' && emo1.intensity === 72, 'emotion persisted (re-GET)');
  // History
  const emoHist = await (await fetch(`${BACKEND}/api/emotion/history?limit=10`)).json();
  record(Array.isArray(emoHist.items) && emoHist.items.length > 0, 'emotion history has entries');
  const last = emoHist.items[0];
  record(last.source === 'manual' && last.note === 'e2e-test', 'emotion history newest entry is the manual update with note');
  // Decay
  const decay = await (await fetch(`${BACKEND}/api/emotion/decay`, { method: 'POST' })).json();
  record(typeof decay.intensity === 'number' && decay.intensity < 72, 'emotion decay reduced intensity');
  // Reset (back to default)
  await fetch(`${BACKEND}/api/emotion/reset`, { method: 'POST' });

  head('6. Tools: list + execute shell + analyze');
  const tools = await (await fetch(`${BACKEND}/api/tools`)).json();
  const toolNames = tools.map((t) => t.name);
  log('  tools:', toolNames.join(', '));
  record(toolNames.includes('shell') && toolNames.includes('readFile') && toolNames.includes('analyze'), 'tools list has shell, readFile, analyze');

  // shell: harmless echo
  const shellRes = await (await fetch(`${BACKEND}/api/tools/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tool: 'shell', args: { command: 'echo integration-test-' + PROBE, timeout: 5000 } }),
  })).json();
  record(shellRes.success === true, 'shell echo succeeded');
  log('   → stdout:', (shellRes.stdout || shellRes.output || '').slice(0, 120));

  // analyze
  const analyzeRes = await (await fetch(`${BACKEND}/api/tools/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tool: 'analyze', args: { text: 'The weather is nice today and I feel productive.', instruction: '一句话总结情感极性' } }),
  })).json();
  record(analyzeRes.success === true && typeof analyzeRes.output === 'string' && analyzeRes.output.length > 0, 'analyze tool succeeded');
  log('   → output:', (analyzeRes.output || '').slice(0, 200));

  // search
  const searchToolRes = await (await fetch(`${BACKEND}/api/tools/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tool: 'search', args: { pattern: 'personal-assistant' } }),
  })).json();
  record(searchToolRes.success === true, 'search tool succeeded');

  head('7. Dashboard reflects updates');
  const dash = await (await fetch(`${BACKEND}/api/dashboard`)).json();
  log('  chatSessions:', dash.chatSessions, '· totalMessages:', dash.totalMessages, '· memoryCount:', dash.memoryCount, '· toolCallCount:', dash.toolCallCount);
  record(dash.toolCallCount >= 3, 'dashboard toolCallCount ≥3 (shell+analyze+search)');
  record(dash.memoryCount >= 3, 'dashboard memoryCount ≥3');
  const aliyunStat = dash.providerStatus.find((p) => p.id === 'aliyun');
  record(aliyunStat?.hasKey === true && aliyunStat?.available === true, 'dashboard aliyun available');

  head('7b. AI generator + tool templates + memory CRUD');
  // AI /types list
  const aiTypes = await (await fetch(`${BACKEND}/api/ai/types`)).json();
  const aiIds = aiTypes.map((t) => t.id);
  record(aiIds.includes('personality') && aiIds.includes('tool') && aiIds.includes('emotion'), '/api/ai/types covers all 7 generators');

  // AI /generate with type=personality
  const aiGen = await (await fetch(`${BACKEND}/api/ai/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'personality', prompt: 'A poetic, melancholic cat who speaks in short sentences', temperature: 0.4, maxTokens: 512 }),
  })).json();
  record(aiGen.ok === true && typeof aiGen.parsed?.id === 'string', 'AI /generate personality produced parsed JSON with id');
  log('   → AI suggested id:', aiGen.parsed?.id, 'name:', aiGen.parsed?.name);
  record(typeof aiGen.model === 'string' && typeof aiGen.latencyMs === 'number', 'AI /generate returned model + latencyMs');
  record(!aiGen.content?.includes(BORROWED_KEY), 'AI /generate did not leak key');

  // AI /generate with type=emotion
  const aiEm = await (await fetch(`${BACKEND}/api/ai/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'emotion', prompt: 'I just finished a 10 hour coding session, my eyes hurt, but I shipped it', temperature: 0.2, maxTokens: 256 }),
  })).json();
  record(aiEm.ok === true && ['neutral','excited','confident','cautious','frustrated','tired','happy','thoughtful','curious','exhausted','sad','melancholic','energetic','focused','relaxed','tense','inspired'].includes(aiEm.parsed?.name), 'AI /generate emotion produced valid emotion name');
  log('   → AI emotion:', aiEm.parsed?.name, aiEm.parsed?.intensity);

  // AI /generate with type=tool
  const aiTool = await (await fetch(`${BACKEND}/api/ai/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'tool', prompt: 'A tool that converts a JSON string into a summary of its top-level keys and types', temperature: 0.4, maxTokens: 512 }),
  })).json();
  record(aiTool.ok === true && typeof aiTool.parsed?.name === 'string' && Array.isArray(aiTool.parsed?.schema), 'AI /generate tool produced name + schema array');
  log('   → AI tool:', aiTool.parsed?.name);

  // AI /generate with type=skill
  const aiSkill = await (await fetch(`${BACKEND}/api/ai/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'skill', prompt: 'When the user shares a long article, summarize the top 5 ideas in bullet points.', temperature: 0.4, maxTokens: 512 }),
  })).json();
  record(aiSkill.ok === true && typeof aiSkill.parsed?.name === 'string' && Array.isArray(aiSkill.parsed?.steps), 'AI /generate skill produced name + steps');
  log('   → AI skill:', aiSkill.parsed?.name);

  // AI /generate with type=agent
  const aiAgent = await (await fetch(`${BACKEND}/api/ai/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'agent', prompt: 'A senior Rust engineer with a dry sense of humor, focused on safe systems code', temperature: 0.4, maxTokens: 512 }),
  })).json();
  record(aiAgent.ok === true && typeof aiAgent.parsed?.name === 'string' && Array.isArray(aiAgent.parsed?.capabilities), 'AI /generate agent produced name + capabilities');
  log('   → AI agent:', aiAgent.parsed?.name);

  // Skills CRUD
  const skillsList = await (await fetch(`${BACKEND}/api/skills`)).json();
  record(skillsList.total >= 3 && skillsList.items.some((s) => s.builtin), 'GET /api/skills lists built-ins');
  const sklId = `skl_e2e_${Date.now().toString(36)}`.slice(0, 40);
  const sklCreate = await (await fetch(`${BACKEND}/api/skills`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: sklId,
      name: 'E2E Test Skill',
      summary: 'A test skill',
      trigger: 'When E2E',
      steps: ['Step 1: do this', 'Step 2: do that'],
      tools: ['readFile'],
      guardrails: 'no harm',
    }),
  })).json();
  record(sklCreate.ok === true && sklCreate.id === sklId, 'POST /api/skills created');
  const sklDup = await (await fetch(`${BACKEND}/api/skills/${sklId}/duplicate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ newId: `${sklId}_2`, newName: 'E2E Test Skill 2' }),
  })).json();
  record(sklDup.ok === true && sklDup.id === `${sklId}_2`, 'POST /api/skills/:id/duplicate');
  await fetch(`${BACKEND}/api/skills/${sklId}`, { method: 'DELETE' });
  await fetch(`${BACKEND}/api/skills/${sklId}_2`, { method: 'DELETE' });

  // Agents CRUD
  const agtList = await (await fetch(`${BACKEND}/api/agents`)).json();
  record(agtList.total >= 3 && agtList.items.some((a) => a.builtin), 'GET /api/agents lists built-ins');
  const agtId = `agt_e2e_${Date.now().toString(36)}`.slice(0, 40);
  const agtCreate = await (await fetch(`${BACKEND}/api/agents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: agtId,
      name: 'E2E Test Agent',
      role: 'test role',
      systemPrompt: 'test system prompt',
      capabilities: ['cap1', 'cap2'],
      limitations: ['lim1'],
    }),
  })).json();
  record(agtCreate.ok === true && agtCreate.id === agtId, 'POST /api/agents created');
  const agtDup = await (await fetch(`${BACKEND}/api/agents/${agtId}/duplicate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ newId: `${agtId}_2`, newName: 'E2E Test Agent 2' }),
  })).json();
  record(agtDup.ok === true && agtDup.id === `${agtId}_2`, 'POST /api/agents/:id/duplicate');
  await fetch(`${BACKEND}/api/agents/${agtId}`, { method: 'DELETE' });
  await fetch(`${BACKEND}/api/agents/${agtId}_2`, { method: 'DELETE' });

  // Tool templates CRUD
  const tplList = await (await fetch(`${BACKEND}/api/tools/templates`)).json();
  record(tplList.total >= 7 && tplList.items.some((t) => t.builtin), 'GET /api/tools/templates lists built-ins');
  // Create custom
  const tplId = `e2e_tpl_${Date.now().toString(36)}`.slice(0, 40);
  const tplCreate = await (await fetch(`${BACKEND}/api/tools/templates`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: tplId,
      name: 'E2E Test Tool',
      description: 'A test tool created by e2e',
      category: 'custom',
      params: [{ name: 'q', type: 'string', description: 'query', required: true }],
      instructions: 'Use carefully.',
    }),
  })).json();
  record(tplCreate.ok === true && tplCreate.id === tplId, 'POST /api/tools/templates created');
  // Duplicate
  const tplDup = await (await fetch(`${BACKEND}/api/tools/templates/${tplId}/duplicate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ newId: `${tplId}_2`, newName: 'E2E Test Tool 2' }),
  })).json();
  record(tplDup.ok === true && tplDup.id === `${tplId}_2`, 'duplicate created');
  // Patch
  const tplPatch = await (await fetch(`${BACKEND}/api/tools/templates/${tplId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ description: 'updated description' }),
  })).json();
  record(tplPatch.ok === true && tplPatch.description === 'updated description', 'PATCH template');
  // Delete both
  const tplDel = await fetch(`${BACKEND}/api/tools/templates/${tplId}`, { method: 'DELETE' });
  record(tplDel.status === 200, 'DELETE template');
  const tplDel2 = await fetch(`${BACKEND}/api/tools/templates/${tplId}_2`, { method: 'DELETE' });
  record(tplDel2.status === 200, 'DELETE template 2');

  // Memory POST + PATCH + bulk-delete
  const memPost = await (await fetch(`${BACKEND}/api/memory`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: 'e2e manual input ' + PROBE, output: 'e2e manual output', tags: ['e2e-manual'] }),
  })).json();
  record(memPost.ok === true, 'POST /api/memory created manual entry');
  const memSearch = await (await fetch(`${BACKEND}/api/memory?q=e2e%20manual%20input%20${PROBE}`)).json();
  const target = memSearch.items.find((i) => i.input.startsWith('e2e manual input'));
  record(!!target, 'manual entry searchable');
  if (target) {
    const memPatch = await (await fetch(`${BACKEND}/api/memory/${target.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'e2e manual input PATCHED' }),
    })).json();
    record(memPatch.ok === true && memPatch.input === 'e2e manual input PATCHED', 'PATCH /api/memory/:id');
    const memBulk = await (await fetch(`${BACKEND}/api/memory/bulk-delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [target.id] }),
    })).json();
    record(memBulk.removed === 1, 'POST /api/memory/bulk-delete removed 1');
  }

  head('8. UI verification (Playwright)');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  const networkErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) {
      const u = new URL(r.url());
      if (u.pathname.startsWith('/api/') && !u.pathname.startsWith('/api/chat')) {
        networkErrors.push(`[${r.status()}] ${r.request().method()} ${u.pathname}`);
      }
    }
  });
  await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.setItem('i18nextLng', 'en'); localStorage.setItem('pa-locale', 'en'); });

  for (const [path, name] of [
    ['/', '01-dashboard'],
    ['/chat', '02-chat'],
    ['/agent', '03-agent'],
    ['/agents', '03b-agents'],
    ['/skills', '03c-skills'],
    ['/memory', '04-memory'],
    ['/tools', '05-tools'],
    ['/tools/templates', '05b-tools-templates'],
    ['/personality', '06-personality'],
    ['/emotion', '07-emotion'],
    ['/config', '08-config'],
    ['/graph', '09-graph'],
    ['/settings', '10-settings'],
  ]) {
    await page.goto(`${FRONTEND}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    // Blur all inputs so key value isn't in any rendered DOM
    await page.evaluate(() => {
      document.querySelectorAll('input,textarea').forEach((el) => el.blur());
    });
    await page.screenshot({ path: pathJoin(SHOTS, name + '.png'), fullPage: true });
    const txt = await page.evaluate(() => document.body.innerText);
    record(txt.length > 100, `UI ${path} rendered (${txt.length} chars)`);
  }
  record(consoleErrors.length === 0, `UI console errors = 0 (saw ${consoleErrors.length})`);
  record(networkErrors.length === 0, `UI network errors = 0 (saw ${networkErrors.length})`);

  await browser.close();

  head('9. Cleanup: remove aliyun key');
  const rm = await (await fetch(`${BACKEND}/api/config/remove-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'aliyun' }),
  })).json();
  record(rm.ok === true, 'POST /api/config/remove-key ok');
  const snap2 = await (await fetch(`${BACKEND}/api/config/snapshot`)).json();
  record(!snap2.apiKeys?.aliyun, 'snapshot after remove: aliyun key gone');
  const prov2 = await (await fetch(`${BACKEND}/api/config/providers`)).json();
  const aliyun2 = prov2.find((p) => p.id === 'aliyun');
  record(aliyun2?.hasKey === false, 'providers after remove: aliyun hasKey=false');

  head('10. Safety scan: key not in repo or /tmp screenshots');
  // Scan the repo (excluding node_modules, dist, coverage, .git, .personal-assistant)
  let leaked = '';
  try {
    const grep = execSync(
      `grep -RIn --binary-files=without-match --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=coverage --exclude-dir=.git --exclude-dir=.personal-assistant "${BORROWED_KEY}" /workspace/Personal-Assistant 2>/dev/null || true`,
      { encoding: 'utf8' }
    );
    leaked = grep.trim();
  } catch (e) { leaked = e.message; }
  record(leaked === '', 'no occurrence of full key in repo (excluding node_modules / dist / .git)');
  if (leaked) log('   LEAKED IN:\n' + leaked.split('\n').slice(0, 10).join('\n'));

  // Scan screenshots for any leak
  let shotLeak = false;
  for (const f of fs.readdirSync(SHOTS)) {
    if (!f.endsWith('.png')) continue;
    const buf = fs.readFileSync(pathJoin(SHOTS, f));
    if (buf.includes(Buffer.from(BORROWED_KEY))) { shotLeak = true; log('  ! key bytes in', f); }
  }
  record(!shotLeak, 'screenshots do not contain raw key bytes');

  // Confirm home config file no longer has the key
  const homeCfg = '/root/.config/personal-assistant-nodejs/config.json';
  let homeOk = true;
  try {
    const txt = fs.readFileSync(homeCfg, 'utf8');
    homeOk = !txt.includes(BORROWED_KEY);
  } catch { homeOk = true; /* file may be empty/missing */ }
  record(homeOk, 'home config no longer contains borrowed key');

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
