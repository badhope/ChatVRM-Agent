# ChatVRM Agent

> A 3D digital-human conversation demo — load a VRM avatar in the browser and chat with an LLM-driven character via voice.
> Forked from [pixiv/ChatVRM](https://github.com/pixiv/ChatVRM).

🌐 **Languages**: [English](./README.md) · [中文](./README.zh.md) · [日本語](./README.ja.md)

---

## Overview

ChatVRM Agent is a browser-based demo that lets you have a real-time conversation with a 3D character. Import a VRM model, pick a voice, and the avatar will listen to your microphone, generate a response through an LLM, speak it back with emotional expression, and animate its body and face to match.

This repository is a fork of the Pixiv original, repackaged and re-documented for English-first users while keeping Chinese and Japanese translations one click away.

## Features

- 🎭 **VRM avatar support** — drop in any `.vrm` file and the character appears in the browser.
- 🎤 **Voice input** — uses the browser's [Web Speech API (SpeechRecognition)](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).
- 🤖 **LLM responses** — replies generated through the [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat).
- 🗣️ **Emotional TTS** — Japanese expressive voice synthesis via [Koeiromap (Koemotion / rinna)](https://koemotion.rinna.co.jp/).
- 👀 **Facial expressions & idle motion** — blinking, gaze tracking, and lip sync driven by [@pixiv/three-vrm](https://github.com/pixiv/three-vrm).
- ⚙️ **Tunable character** — adjust voice parameters, speaking style, and system prompt at runtime from the settings panel.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 13 (Pages Router) |
| Language | TypeScript 5 |
| UI | React 18, Tailwind CSS |
| 3D | three.js, @pixiv/three-vrm |
| LLM | OpenAI Chat Completions API |
| TTS | Koeiromap (rinna) |
| STT | Web Speech API |

## Getting Started

### Prerequisites

- Node.js **16.14.2** (see `engines` in `package.json`) or a compatible 16.x / 18.x
- npm (bundled with Node.js)
- An **OpenAI API key** with access to a chat model (e.g. `gpt-4o-mini`, `gpt-4o`, `gpt-3.5-turbo`)

### 1. Clone and install

```bash
git clone https://github.com/badhope/ChatVRM-Agent.git
cd ChatVRM-Agent
npm install
```

### 2. Configure environment

Copy the example file and fill in your secrets:

```bash
cp .env.example .env
```

Then edit `.env`:

```env
# OpenAI API key used by /api/chat
OPEN_AI_KEY=sk-...
```

> 💡 You can also paste the key directly into the in-app settings panel at runtime; it will be used for that session only and never written to disk.

### 3. Run the dev server

```bash
npm run dev
```

Open <http://localhost:3000> in a modern Chromium-based browser (Chrome / Edge recommended for full Web Speech API support).

### 4. Build for production

```bash
npm run build
npm run start
```

To export a fully static site (no API routes, no server):

```bash
npm run export
```

> ⚠️ The static export cannot call `/api/chat` or `/api/tts` server-side. To use those routes in production, deploy to a Node-capable host (Vercel, Railway, Fly.io, your own VPS).

## Configuration

All configuration is read from environment variables at server start and from the in-app settings panel at runtime. See [`.env.example`](./.env.example) for the full list.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `OPEN_AI_KEY` | Yes (server) | — | OpenAI API key. Falls back to the value entered in the UI. |

## Project Structure

```
ChatVRM-Agent/
├── .github/
│   ├── workflows/          # CI (next build)
│   ├── ISSUE_TEMPLATE/     # Bug report & feature request forms
│   └── PULL_REQUEST_TEMPLATE.md
├── public/                 # Static assets (default VRM, idle animation, OGP image)
├── src/
│   ├── components/         # React UI (chat log, settings, menu, VRM viewer, …)
│   ├── features/
│   │   ├── chat/           # OpenAI client
│   │   ├── emoteController/  # Blink, gaze, expression
│   │   ├── koeiromap/      # TTS client
│   │   ├── lipSync/        # Mouth animation from audio analysis
│   │   ├── messages/       # Message store, TTS orchestration
│   │   └── vrmViewer/      # three.js + three-vrm wrapper
│   ├── lib/                # VRM / VRMA loaders and helpers
│   ├── pages/
│   │   ├── api/            # /api/chat, /api/tts
│   │   ├── _app.tsx
│   │   ├── _document.tsx
│   │   └── index.tsx
│   ├── styles/             # globals.css
│   └── utils/              # Small helpers
├── .editorconfig
├── .env.example
├── .eslintrc.json
├── .gitignore
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── LICENSE                 # MIT (inherited from pixiv/ChatVRM)
├── README.md               # You are here
├── README.zh.md
├── README.ja.md
├── SECURITY.md
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
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

## API Routes

- `POST /api/chat` — proxies a chat completion request to OpenAI. Body: `{ apiKey?: string, messages: ChatMessage[] }`. Falls back to `process.env.OPEN_AI_KEY`.
- `POST /api/tts` — calls Koeiromap to synthesize Japanese speech. Body: `{ text: string, speakerX: number, speakerY: number }`.

## Privacy & Data

- Conversation history is kept **in-memory** in the browser only. Reloading the page clears it.
- Audio is captured locally by the Web Speech API. The recognised text is sent to OpenAI (or your configured LLM) and to Koeiromap for synthesis.
- No telemetry or analytics are collected by this codebase.
- See [OpenAI's data usage policy](https://openai.com/policies/api-data-usage-policies) and [Koeiromap's terms](https://koemotion.rinna.co.jp/) for how those providers handle your data.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) first, and follow the [Code of Conduct](./CODE_OF_CONDUCT.md). Bug reports and feature requests should use the issue templates in [`.github/ISSUE_TEMPLATE/`](./.github).

## Security

Please **do not** file public issues for security problems. See [SECURITY.md](./SECURITY.md) for the reporting procedure.

## License

This project is released under the **MIT License** — see [LICENSE](./LICENSE). Originally created by [pixiv](https://github.com/pixiv/ChatVRM); this fork is maintained by [@badhope](https://github.com/badhope).

## Acknowledgments

- [pixiv](https://github.com/pixiv) — original ChatVRM project and [@pixiv/three-vrm](https://github.com/pixiv/three-vrm)
- [rinna / Koemotion](https://koemotion.rinna.co.jp/) — Koeiromap expressive TTS
- [OpenAI](https://openai.com/) — Chat Completions API
- All contributors and the open-source VRM community
