#!/usr/bin/env node
// fin-cli.mjs — Node wrapper around scripts/fin_data_tools.py
// Usage:
//   node scripts/fin-cli.mjs excel-list --path FILE.xlsx
//   node scripts/fin-cli.mjs report-build --uploads DIR --out DIR ...
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PY_SCRIPT = resolvePath(__dirname, 'fin_data_tools.py');

const [, , sub, ...rest] = process.argv;
if (!sub) {
  console.error('Usage: fin-cli <subcommand> [--k v ...]');
  console.error('Subcommands: excel-list | excel-read | pdf-read | chart-bar | chart-line | report-build');
  process.exit(2);
}
const args = [PY_SCRIPT, sub, ...rest];
const py = process.env.PYTHON || 'python3';
const r = spawnSync(py, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
process.stdout.write(r.stdout || '');
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status ?? 0);
