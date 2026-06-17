# Changelog

All notable changes to **ChatVRM Agent** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Camera lock for stable full-body VRM framing (disabled zoom/pan, limited rotation)
- AbortController for stop button (aborts LLM stream + TTS queue)
- Mobile white-screen prevention (viewer null-guard, WebGL try/catch, viewport meta fix)
- `prefers-reduced-motion` support and `@supports` backdrop-filter fallback
- Safe-area insets (`env(safe-area-inset-*)`) on topbar and chat input
- ARIA roles, focus management, Escape key on dialogs and popovers
- Provider value memoization (toast, i18n)
- `dispose()` method on Viewer (RAF/resize/renderer/model cleanup)

### Changed
- Repository description and topics updated to reflect the independent project
- README rewritten as a standalone project (removed fork language)
- `viewerContext` SSR safety (lazy init via `typeof window` guard)
- `tailwind.config.js`: dark theme, correct font name, removed line-clamp plugin
- `api/tts.ts` speakerX/Y schema `min(0)` → `min(-10)` for negative presets
- viewport meta moved from `_document.tsx` to `_app.tsx` (Next 13 best practice)
- `lang="ja"` → `lang="en"` in `_document.tsx`

## [0.2.0] — 2024

### Added
- Multi-LLM support: 13 providers (OpenAI, Anthropic, OpenRouter, DeepSeek, Moonshot, Zhipu, Aliyun Bailian, Volcengine, Hunyuan, Qianfan, SiliconFlow, Ollama, Azure) + custom HTTP endpoint
- Multi-TTS support: 5 providers (Koeiromap, OpenAI TTS, ElevenLabs, Microsoft Edge TTS, custom HTTP)
- English / Chinese i18n with runtime switching
- Glassmorphism UI with aurora background
- Progressive-disclosure settings (drawer + accordion)
- Vitest test runner, `npm run test`, `npm run typecheck`, `npm run format`
- `zod` request validation in API routes
- Next.js error pages: `404.tsx`, `500.tsx`
- `Dockerfile` (multi-stage, Node 18) and `.dockerignore`
- `vercel.json` with security headers and asset caching
- Community health files: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`
- GitHub templates: `.github/ISSUE_TEMPLATE/` and `.github/PULL_REQUEST_TEMPLATE.md`

[Unreleased]: https://github.com/badhope/ChatVRM-Agent/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/badhope/ChatVRM-Agent/releases/tag/v0.2.0
