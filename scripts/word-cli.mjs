#!/usr/bin/env node
/* eslint-disable */
// Node CLI wrapper for word_process.py
//
// Usage:
//   node scripts/word-cli.mjs <op> [args...]
//   npm run word -- <op> [args...]
//
// Examples:
//   npm run word -- create --output out.docx --title "Hi" --content "Hello"
//   npm run word -- read ./out.docx
//   npm run word -- info ./out.docx
//   npm run word -- search ./out.docx --query "Hello"
//   npm run word -- replace ./out.docx --find "old" --replace-with "new"
//   npm run word -- append ./out.docx --heading "New" --text "more text"
//   npm run word -- to-text ./out.docx --output out.txt
//
// Exits with the python script's exit code. stdout is the JSON payload.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PY_SCRIPT = resolve(__dirname, 'word_process.py');

function runPython(args) {
  return spawnSync('python3', [PY_SCRIPT, ...args], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function printResult(r) {
  if (r.error) {
    console.error('FATAL:', r.error.message);
    process.exit(1);
  }
  if (r.stdout) process.stdout.write(r.stdout);
  if (!r.stdout.endsWith('\n')) process.stdout.write('\n');
  if (r.stderr && r.stderr.length > 0) {
    process.stderr.write(r.stderr);
  }
  process.exit(r.status ?? 1);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    console.log('Word document CLI — calls scripts/word_process.py');
    console.log('');
    console.log('Usage: node scripts/word-cli.mjs <op> [args...]');
    console.log('');
    console.log('Operations: read | create | append | replace | info | search | to-text');
    console.log('See `python3 scripts/word_process.py <op> --help` for op-specific args.');
    process.exit(argv.length === 0 ? 1 : 0);
  }
  printResult(runPython(argv));
}

main();
