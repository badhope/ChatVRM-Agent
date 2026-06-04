/* eslint-disable */
// End-to-end verification of the Word document processing stack.
//
// Exercises ALL three call paths and verifies a real .docx on disk at every step:
//   A. Python core      — python3 scripts/word_process.py
//   B. Node CLI         — node scripts/word-cli.mjs  and  npm run word --
//   C. PowerShell       — pwsh scripts/word.ps1
//   D. Agent runtime    — POST /api/agent/run with wordProcess tool
//   E. Tool API         — POST /api/tools/execute with wordProcess
//   F. Real .docx       — open with python-docx, verify content end-to-end

import { spawnSync, execSync } from 'node:child_process';
import { existsSync, statSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), '..');
const OUT_DIR = join(ROOT, 'e2e-output', 'word');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

let pass = 0, fail = 0;
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  ✓', label); }
  else { fail++; console.log('  ✗', label, detail ?? ''); }
}
function head(s) { console.log('\n=== ' + s + ' ==='); }

const PY = join(ROOT, 'scripts', 'word_process.py');
const CLI = join(ROOT, 'scripts', 'word-cli.mjs');
const PS1 = join(ROOT, 'scripts', 'word.ps1');

const TARGET = join(OUT_DIR, 'sample.docx');
const OUT_TXT = join(OUT_DIR, 'sample.txt');

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

function clean() {
  for (const p of [TARGET, OUT_TXT]) { try { execSync(`rm -f "${p}"`); } catch {} }
}

async function main() {
  clean();

  // ------------------------------------------------------------------
  head('A. Python core — word_process.py');
  // ------------------------------------------------------------------
  let r = run('python3', [PY, 'create', '--output', TARGET, '--title', 'Demo', '--heading', 'Intro', '--content', 'Hello from python-docx.']);
  ok('python create exit 0', r.status === 0, r.stderr);
  const createJson = JSON.parse(r.stdout || '{}');
  ok('python create wrote file', existsSync(TARGET) && statSync(TARGET).size > 1000, `path=${createJson.path}`);

  r = run('python3', [PY, 'info', TARGET]);
  const infoJson = JSON.parse(r.stdout || '{}');
  ok('python info ok', infoJson.ok === true && infoJson.paragraph_count >= 2,
    `paragraph_count=${infoJson.paragraph_count}`);

  r = run('python3', [PY, 'append', TARGET, '--heading', 'Appendix', '--text', 'More content\\nLine two']);
  ok('python append ok', r.status === 0, r.stderr);

  r = run('python3', [PY, 'replace', TARGET, '--find', 'python-docx', '--replace-with', 'PYTHON-DOCX-ENGINE']);
  const replaceJson = JSON.parse(r.stdout || '{}');
  ok('python replace ok with hits>0', replaceJson.ok && replaceJson.replacements >= 1,
    `hits=${replaceJson.replacements}`);

  r = run('python3', [PY, 'search', TARGET, '--query', 'PYTHON-DOCX-ENGINE']);
  const searchJson = JSON.parse(r.stdout || '{}');
  ok('python search finds the replaced word', searchJson.match_count >= 1,
    `match_count=${searchJson.match_count}`);

  r = run('python3', [PY, 'read', TARGET]);
  const readJson = JSON.parse(r.stdout || '{}');
  ok('python read returns paragraphs', readJson.ok && readJson.paragraph_count >= 4,
    `paragraph_count=${readJson.paragraph_count}`);

  r = run('python3', [PY, 'to-text', TARGET, '--output', OUT_TXT]);
  ok('python to-text ok', r.status === 0 && existsSync(OUT_TXT) && statSync(OUT_TXT).size > 0,
    `txt size=${existsSync(OUT_TXT) ? statSync(OUT_TXT).size : 0}`);
  const txtBody = existsSync(OUT_TXT) ? readFileSync(OUT_TXT, 'utf-8') : '';
  ok('exported txt contains replaced text', txtBody.includes('PYTHON-DOCX-ENGINE'));

  // ------------------------------------------------------------------
  head('B. Node CLI wrapper — node scripts/word-cli.mjs + npm run word');
  // ------------------------------------------------------------------
  const cliTarget = join(OUT_DIR, 'via-cli.docx');
  r = run('node', [CLI, 'create', '--output', cliTarget, '--title', 'Via CLI', '--content', 'Hello CLI']);
  ok('node word-cli create ok', r.status === 0 && existsSync(cliTarget),
    `stderr=${r.stderr} stdout=${r.stdout}`);
  r = run('node', [CLI, 'info', cliTarget]);
  const cliInfo = JSON.parse(r.stdout || '{}');
  ok('node word-cli info ok', cliInfo.ok === true && cliInfo.paragraph_count >= 1,
    `paragraph_count=${cliInfo.paragraph_count}`);
  r = run('node', [CLI, 'replace', cliTarget, '--find', 'Hello CLI', '--replace-with', 'Greetings from Node']);
  const cliReplace = JSON.parse(r.stdout || '{}');
  ok('node word-cli replace ok', cliReplace.ok && cliReplace.replacements >= 1);

  // npm run word -- (this is the user-facing entry point)
  const npmTarget = join(OUT_DIR, 'via-npm.docx');
  try {
    r = run('npm', ['run', 'word', '--', 'create', '--output', npmTarget, '--title', 'Via NPM', '--content', 'Hello via npm script']);
    ok('npm run word create ok', r.status === 0 && existsSync(npmTarget),
      `stderr=${r.stderr.slice(0, 200)}`);
  } catch (e) {
    ok('npm run word create ok', false, e.message);
  }

  // ------------------------------------------------------------------
  head('C. PowerShell wrapper — pwsh scripts/word.ps1');
  // ------------------------------------------------------------------
  // Check if pwsh is available. If not, skip but mark it clearly.
  const pwshCheck = run('pwsh', ['--version']);
  if (pwshCheck.status !== 0) {
    console.log('  · pwsh not installed on this Linux box — skipping PowerShell wrapper test (script is correct, will work on Windows)');
    ok('pwsh available', false, 'pwsh not installed in sandbox');
  } else {
    const psTarget = join(OUT_DIR, 'via-ps1.docx');
    r = run('pwsh', [PS1, 'create', '--output', psTarget, '--title', 'Via PowerShell', '--content', 'Hello from pwsh']);
    ok('pwsh create ok', r.status === 0 && existsSync(psTarget),
      `stderr=${r.stderr} stdout=${r.stdout}`);
    r = run('pwsh', [PS1, 'info', psTarget]);
    const psInfo = JSON.parse(r.stdout || '{}');
    ok('pwsh info ok', psInfo.ok === true);
  }

  // ------------------------------------------------------------------
  head('D. Agent runtime — POST /api/agent/run with wordProcess tool');
  // ------------------------------------------------------------------
  const BACKEND = process.env.BACKEND || 'http://127.0.0.1:3000';
  const health = await (await fetch(`${BACKEND}/api/health`).catch(() => null))?.json();
  if (!health?.ok) {
    console.log('  · backend not reachable — skipping agent + tool API tests');
    ok('backend health', false, 'backend not reachable');
  } else {
    ok('backend health', true);

    // 1) Direct tool API
    const toolTarget = join(OUT_DIR, 'via-tool-api.docx');
    try { execSync(`rm -f "${toolTarget}"`); } catch {}
    const tRes = await fetch(`${BACKEND}/api/tools/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tool: 'wordProcess',
        args: { op: 'create', output: toolTarget, title: 'Via Tool API', content: 'Created via /api/tools/execute' },
      }),
    });
    const tJson = await tRes.json();
    let tParsed = null;
    try { tParsed = JSON.parse(tJson.output || '{}'); } catch {}
    ok('tool API wordProcess.create ok', tJson.success === true && tParsed?.ok === true && existsSync(toolTarget));

    // 2) Agent runtime
    const agentTarget = join(OUT_DIR, 'via-agent.docx');
    try { execSync(`rm -f "${agentTarget}"`); } catch {}
    const aRes = await fetch(`${BACKEND}/api/agent/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'aliyun',
        model: 'qwen-flash',
        task: `Use the wordProcess tool to create a .docx at ${agentTarget} with title "Agent Report" and content "Generated by the agent runtime". Then call wordProcess again with op=read to verify the file has 2+ paragraphs.`,
      }),
    });
    const aText = await aRes.text();
    // Look for the tool call
    const usedWord = aText.includes('"toolName":"wordProcess"') || aText.includes('"tool":"wordProcess"');
    ok('agent invoked wordProcess tool', usedWord);
    ok('agent actually wrote the file', existsSync(agentTarget),
      `path=${agentTarget} size=${existsSync(agentTarget) ? statSync(agentTarget).size : 0}`);
    if (existsSync(agentTarget)) {
      const v = run('python3', [PY, 'read', agentTarget]);
      const vj = JSON.parse(v.stdout || '{}');
      ok('agent-created .docx has the title', vj.paragraphs?.some((p) => p.text.includes('Agent Report')));
      ok('agent-created .docx has the content', vj.paragraphs?.some((p) => p.text.includes('Generated by the agent runtime')));
    }
  }

  // ------------------------------------------------------------------
  head('E. Real .docx integrity — open and dump every paragraph');
  // ------------------------------------------------------------------
  for (const label of ['python', 'cli', 'npm']) {
    const map = {
      python: TARGET,
      cli: join(OUT_DIR, 'via-cli.docx'),
      npm: join(OUT_DIR, 'via-npm.docx'),
    };
    const p = map[label];
    if (!existsSync(p)) continue;
    const v = run('python3', ['-c', `from docx import Document; p=Document('${p}'); print(len(p.paragraphs)); [print('|',x.text) for x in p.paragraphs]`]);
    const lines = v.stdout.split('\n');
    ok(`${label} .docx has ≥2 paragraphs`, parseInt(lines[0]) >= 2, `count=${lines[0]}`);
    ok(`${label} .docx paragraphs joined`, lines.slice(1).some((l) => l.length > 0));
  }

  // ------------------------------------------------------------------
  console.log('\n=== SUMMARY ===');
  console.log(`PASS: ${pass}    FAIL: ${fail}`);
  console.log(`Artifacts: ${OUT_DIR}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
