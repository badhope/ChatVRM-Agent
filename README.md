# ChatVRM Agent

> A 3D digital-human conversation framework — load a VRM avatar in the browser and chat with an LLM-driven character via voice.

🌐 **Languages**: [English](./README.md) · [中文](./README.zh.md) · [日本語](./README.ja.md)

---

## Overview

ChatVRM Agent is a browser-based application that lets you have real-time conversations with a 3D character. Import a VRM model, pick a voice, and the avatar will listen to your microphone, generate a response through an LLM, speak it back with emotional expression, and animate its body and face to match.

Built with a modern glassmorphism UI, progressive-disclosure settings, full mobile support with safe-area insets, and accessibility features (ARIA roles, focus management, reduced-motion support).

## Features

- 🎭 **VRM avatar support** — drop in any `.vrm` file and the character appears in the browser, with stable full-body framing.
- 🎤 **Voice input** — uses the browser's [Web Speech API (SpeechRecognition)](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).
- 🤖 **Multi-LLM** — 13 built-in chat providers (OpenAI, Anthropic, OpenRouter, DeepSeek, Moonshot, Zhipu, Aliyun Bailian, Volcengine, Hunyuan, Qianfan, SiliconFlow, Ollama, Azure) plus a fully custom HTTP endpoint. Switch in the settings panel.
- 🗣️ **Multi-TTS** — 5 built-in speech providers (Koeiromap, OpenAI TTS, ElevenLabs, Microsoft Edge TTS, custom HTTP) with a per-provider voice picker.
- 👀 **Facial expressions & idle motion** — blinking, gaze tracking, and lip sync driven by [@pixiv/three-vrm](https://github.com/pixiv/three-vrm).
- 🛑 **Stream control** — stop button aborts both the LLM stream and the TTS playback queue via `AbortController`.
- 🌐 **i18n** — English / Chinese UI; Japanese README translation.
- 📱 **Responsive & mobile-safe** — desktop, tablet, and mobile breakpoints with `env(safe-area-inset-*)` notch handling and `viewport-fit=cover`.
- ♿ **Accessible** — ARIA roles on dialogs, focus management, `prefers-reduced-motion` support, `@supports` fallback for `backdrop-filter`.
- ⚙️ **Tunable character** — adjust voice parameters, speaking style, system prompt, and test connections at runtime from the settings panel.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 13 (Pages Router) |
| Language | TypeScript 5 |
| UI | React 18, Tailwind CSS, glassmorphism design system |
| 3D | three.js, @pixiv/three-vrm |
| LLM | 13 providers via a single streaming client (`features/llm/`) |
| TTS | 5 providers via a single synthesis client (`features/tts/`) |
| STT | Web Speech API |

## Getting Started

### Prerequisites

- Node.js **16.14.2** (see `engines` in `package.json`) or a compatible 16.x / 18.x
- npm (bundled with Node.js)
- An API key for at least one of the supported **LLM** providers (e.g. OpenAI, DeepSeek, Anthropic) — see [Supported LLM Providers](#supported-llm-providers)
- An API key for at least one of the supported **TTS** providers if you don't want to use the free Edge TTS — see [Supported TTS Providers](#supported-tts-providers)

### 1. Clone and install

```bash
git clone https://github.com/badhope/ChatVRM-Agent.git
cd ChatVRM-Agent
npm install
```

### 2. (Optional) Configure environment

Copy the example file and fill in your secrets. The app also accepts keys in the in-app settings panel — environment variables are only used as defaults.

```bash
cp .env.example .env
```

```env
# Optional default LLM key (used when the in-app key is empty)
OPEN_AI_KEY=sk-...
```

### 3. Run the dev server

```bash
npm run dev
```

Open <http://localhost:3000> in a modern Chromium-based browser (Chrome / Edge recommended for full Web Speech API and Edge TTS support).

### 4. Build for production

```bash
npm run build
npm run start
```

To export a fully static site (no API routes, no server):

```bash
npm run export
```

> ⚠️ The static export cannot call `/api/tts-edge` (Edge TTS proxy) or `/api/chat` server-side. Deploy to a Node-capable host (Vercel, Railway, Fly.io, your own VPS) for full functionality.

## Supported LLM Providers

The LLM client (`src/features/llm/`) speaks **OpenAI-compatible** and **Anthropic-native** protocols. Switch providers at runtime from the **Settings → LLM Provider** dropdown.

| Provider | Region | Protocol | Default Model | Notes |
| --- | --- | --- | --- | --- |
| OpenAI | Global | OpenAI | `gpt-4o-mini` | Vision-capable models flagged in dropdown |
| Azure OpenAI | Global | OpenAI | *(deployment name)* | Custom baseURL required |
| Anthropic (Claude) | Global | Anthropic | `claude-sonnet-4-5` | Uses `x-api-key` + `anthropic-version` |
| OpenRouter | Global | OpenAI | `openai/gpt-4o-mini` | One key, 500+ models. Adds `HTTP-Referer` header |
| DeepSeek | China | OpenAI | `deepseek-chat` | Also offers `deepseek-reasoner` |
| Moonshot (Kimi) | China | OpenAI | `moonshot-v1-8k` | 8k/32k/128k context |
| Zhipu AI (GLM) | China | OpenAI | `glm-4.6` | Free tier on `glm-4-flash` |
| Aliyun Bailian (Qwen) | China | OpenAI | `qwen-plus` | Override baseURL to switch regions |
| Volcengine Ark (Doubao) | China | OpenAI | `doubao-seed-1-6-250715` | Doubao, DeepSeek, code models |
| Tencent Hunyuan | China | OpenAI | `hunyuan-turbos-latest` | |
| Baidu Qianfan | China | OpenAI | `deepseek-v3.2` | ERNIE + Qwen + DeepSeek |
| SiliconFlow | China | OpenAI | `Qwen/Qwen3-8B` | Free tier on Qwen3-8B |
| Ollama (local) | Local | OpenAI | `qwen3:8b` | Run `ollama serve` locally |

**Custom provider** — pick "Custom" or set `customBaseURL: true` to point at any OpenAI-compatible endpoint (vLLM, LiteLLM proxy, LM Studio, your own server, …).

The Settings panel includes a **Test connection** button that issues a minimal "ping" request and reports the response. Use it to verify keys and baseURLs before chatting.

## Supported TTS Providers

The TTS client (`src/features/tts/`) covers 5 protocols. Switch at runtime from the **Settings → TTS Provider** dropdown.

| Provider | Protocol | API Key | Voices | Cost |
| --- | --- | --- | --- | --- |
| Koeiromap (Koemotion) | REST JSON → base64 mp3 | Optional | 4 Japanese presets | Free (rate-limited) / paid tier |
| OpenAI TTS | REST → binary stream | Required | 6 stock voices | Pay per character |
| ElevenLabs | REST → binary stream | Required | 8 stock voices | Free tier + paid |
| Microsoft Edge TTS | Server-proxied (`/api/tts-edge`) | **Not required** | 8 neural voices (ja / en / zh / ko) | Free |
| Custom HTTP | REST → binary stream | Optional | Whatever you serve | Your cost |

**Custom provider** — POST `{ text, voice, format, speed }` to your endpoint and return raw audio bytes. Drop in CosyVoice, GPT-SoVITS, a LiteLLM TTS proxy, or anything else.

For OpenAI TTS, you can set a custom **Model** (e.g. `tts-1`, `tts-1-hd`, `gpt-4o-mini-tts`) in addition to the voice.

## Project Structure

```
ChatVRM-Agent/
├── .github/
│   ├── workflows/          # CI (lint, typecheck, test, build)
│   ├── ISSUE_TEMPLATE/     # Bug report & feature request forms
│   └── PULL_REQUEST_TEMPLATE.md
├── public/                 # Static assets (default VRM, idle animation, OGP image)
├── src/
│   ├── components/         # React UI (chat log, settings, menu, VRM viewer, …)
│   ├── features/
│   │   ├── llm/            # LLM abstraction: types, providers, clients, storage
│   │   ├── tts/            # TTS abstraction: types, providers, adapters, storage
│   │   ├── i18n/           # English / Chinese translations + React context
│   │   ├── koeiromap/      # Koeiromap REST client (low-level)
│   │   ├── emoteController/  # Blink, gaze, expression
│   │   ├── lipSync/        # Mouth animation from audio analysis
│   │   ├── messages/       # Message store, TTS orchestration
│   │   └── vrmViewer/      # three.js + three-vrm wrapper
│   ├── pages/
│   │   ├── api/            # /api/chat (legacy), /api/tts (legacy), /api/tts-edge (new)
│   │   ├── _app.tsx
│   │   ├── _document.tsx
│   │   └── index.tsx
│   ├── styles/             # globals.css, aurora.css
│   └── utils/              # Small helpers + tests
├── .editorconfig
├── .env.example
├── .eslintrc.json
├── .gitignore
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── LICENSE                 # MIT
├── README.md               # You are here
├── README.zh.md
├── README.ja.md
├── SECURITY.md
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── vitest.config.ts
└── watch.json
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server on port 3000 with HMR. |
| `npm run build` | Produce an optimized production build. |
| `npm run start` | Run the production build. |
| `npm run export` | Export a static site to `out/`. |
| `npm run lint` | Run ESLint with the Next.js config. |
| `npm run typecheck` | Run `tsc --noEmit`. |
| `npm test` | Run the Vitest unit tests. |

## API Routes

- `POST /api/chat` — legacy server-side proxy to OpenAI. New clients call the LLM directly from the browser.
- `POST /api/tts` — legacy server-side proxy to the free Koeiromap endpoint. New clients call TTS directly from the browser.
- `POST /api/tts-edge` — server-side proxy for Microsoft Edge TTS. Returns an mp3 byte stream.

## Adding a New Provider

To add a new built-in LLM provider:
1. Add an entry to the `LLM_PROVIDERS` array in [`src/features/llm/providers.ts`](./src/features/llm/providers.ts).
2. Pick `protocol: "openai"` (works for 99% of providers) or `"anthropic"` (Claude family).
3. List the models you want surfaced in the dropdown.
4. The settings UI picks it up automatically.

To add a new built-in TTS provider:
1. Add an entry to the `TTS_PROVIDERS` array in [`src/features/tts/providers.ts`](./src/features/tts/providers.ts).
2. If the protocol is one of `koeiromap` / `openai-tts` / `elevenlabs` / `edge` / `custom`, add a switch case in `src/features/tts/tts.ts` and an adapter file under `src/features/tts/`.
3. If the protocol needs the server, set `serverSide: true` and add a route under `src/pages/api/`.

## Privacy & Data

- Conversation history is kept **in-memory** in the browser only. Reloading the page clears it.
- API keys and settings are stored in `localStorage` under `chatvrm:llm:v1` and `chatvrm:tts:v1`. Clear them from your browser's DevTools → Application → Local Storage.
- LLM and TTS calls go **directly from the browser** to the provider you select. No proxy server is involved (except for Edge TTS, which uses `/api/tts-edge` to hide the WebSocket protocol).
- Audio is captured locally by the Web Speech API. The recognised text is forwarded to the LLM and TTS providers you select.
- No telemetry or analytics are collected by this codebase.
- See each provider's data policy for how they handle your data.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) first, and follow the [Code of Conduct](./CODE_OF_CONDUCT.md). Bug reports and feature requests should use the issue templates in [`.github/ISSUE_TEMPLATE/`](./.github).

## Security

Please **do not** file public issues for security problems. See [SECURITY.md](./SECURITY.md) for the reporting procedure.

## License

This project is released under the **MIT License** — see [LICENSE](./LICENSE).

## Acknowledgments

- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) — VRM rendering library
- [rinna / Koemotion](https://koemotion.rinna.co.jp/) — Koeiromap expressive TTS
- [OpenAI](https://openai.com/) — Chat Completions API + TTS
- [Anthropic](https://www.anthropic.com/) — Claude Messages API
- [ElevenLabs](https://elevenlabs.io/) — neural TTS
- [Microsoft](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/) — Edge TTS neural voices
- All contributors and the open-source VRM community
