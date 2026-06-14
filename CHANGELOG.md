# Changelog

All notable changes to **ChatVRM Agent** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- English-first documentation set: `README.md` (English), `README.zh.md`
  (Chinese), `README.ja.md` (Japanese) with cross-links and aligned section
  structure.
- `.env.example` documenting `OPEN_AI_KEY` and optional `OPEN_AI_MODEL`,
  `KOEIROMAP_BASE_URL`, `PORT`.
- `.editorconfig`, `.prettierrc`, `.prettierignore`.
- Community health files: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`.
- GitHub templates: `.github/ISSUE_TEMPLATE/` (bug, feature, question) and
  `.github/PULL_REQUEST_TEMPLATE.md`.
- `Dockerfile` (multi-stage, Node 18) and `.dockerignore`.
- `vercel.json` with security headers and asset caching.
- `.nvmrc` pinning Node `16.14.2`.
- Vitest test runner, `npm run test`, `npm run typecheck`, `npm run format`.
- `zod` request validation in `/api/chat` and `/api/tts`.
- Next.js error pages: `404.tsx`, `500.tsx`.

### Changed
- Repository renamed from `Personal-Assistant` to `ChatVRM-Agent`; About and
  Topics updated to English.
- Repository description and topics in English (chatvrm, vrm, digital-human,
  llm, typescript, nextjs, …).
- `package.json`: full metadata (repository, bugs, homepage, license,
  keywords), `engines` widened to `>=16.14.2 <19`.
- Moved `@pixiv/three-vrm` from devDependencies to dependencies.
- README no longer inherits the Pixiv "archive" notice (this is an active
  fork).
- Branch protection enabled on `main` (require PR review, linear history,
  no force push, no deletion).

## [0.1.0] — 2024-07-18

### Added
- Initial import of the upstream [pixiv/ChatVRM](https://github.com/pixiv/ChatVRM)
  codebase (last commit `b542aa0`).

[Unreleased]: https://github.com/badhope/ChatVRM-Agent/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/badhope/ChatVRM-Agent/releases/tag/v0.1.0
