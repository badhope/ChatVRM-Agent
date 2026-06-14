# ChatVRM Agent (中文)

> 一个基于浏览器的 3D 数字人对话演示 — 加载 VRM 形象，与 LLM 驱动的角色进行语音聊天。
> Fork 自 [pixiv/ChatVRM](https://github.com/pixiv/ChatVRM)。

🌐 **语言**: [English](./README.md) · [中文](./README.zh.md) · [日本語](./README.ja.md)

---

## 简介

ChatVRM Agent 是一个浏览器端 3D 角色对话 Demo。导入一个 VRM 模型，选好声音，角色就会：聆听你的麦克风 → 调用大模型生成回复 → 用富有情感的声音念出来 → 同步做出表情和肢体动作。

本仓库是 Pixiv 原版的英文优先 fork，文档以英文为主，中文与日文版本可一键切换。

## 功能特性

- 🎭 **VRM 形象支持** — 拖入任意 `.vrm` 文件即可在浏览器中显示
- 🎤 **语音输入** — 基于浏览器 [Web Speech API (SpeechRecognition)](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- 🤖 **大模型回复** — 通过 [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat) 生成回答
- 🗣️ **情感 TTS** — 通过 [Koeiromap (Koemotion / rinna)](https://koemotion.rinna.co.jp/) 进行日语情感语音合成
- 👀 **表情与动作** — 自动眨眼、视线跟踪、唇形同步由 [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) 驱动
- ⚙️ **运行时调参** — 设置面板中可调节声音、说话风格与系统提示词

## 技术栈

| 层 | 技术 |
| --- | --- |
| 框架 | Next.js 13 (Pages Router) |
| 语言 | TypeScript 5 |
| UI | React 18, Tailwind CSS |
| 3D | three.js, @pixiv/three-vrm |
| 大模型 | OpenAI Chat Completions API |
| 语音合成 | Koeiromap (rinna) |
| 语音识别 | Web Speech API |

## 快速开始

### 环境要求

- Node.js **16.14.2**（见 `package.json` 中 `engines`）或兼容的 16.x / 18.x
- npm
- 一个 **OpenAI API Key**（已开通 chat 模型，例如 `gpt-4o-mini`、`gpt-4o`、`gpt-3.5-turbo`）

### 1. 克隆并安装

```bash
git clone https://github.com/badhope/ChatVRM-Agent.git
cd ChatVRM-Agent
npm install
```

### 2. 配置环境变量

复制示例文件并填入你的密钥：

```bash
cp .env.example .env
```

编辑 `.env`：

```env
# /api/chat 使用的 OpenAI Key
OPEN_AI_KEY=sk-...
```

> 💡 也可以在应用内设置面板中临时粘贴 Key，仅本次会话使用，不会写入磁盘。

### 3. 启动开发服务器

```bash
npm run dev
```

打开 <http://localhost:3000>。建议使用基于 Chromium 的现代浏览器（Chrome / Edge）以获得完整的 Web Speech API 支持。

### 4. 生产构建

```bash
npm run build
npm run start
```

如需导出纯静态站点（无 API 路由、无服务端）：

```bash
npm run export
```

> ⚠️ 静态导出无法在服务端调用 `/api/chat` 和 `/api/tts`。如需这些路由，请部署到支持 Node 的平台（Vercel、Railway、Fly.io、自有 VPS 等）。

## 配置项

所有配置在启动时从环境变量读取，运行期可通过应用内设置面板调整。完整列表见 [`.env.example`](./.env.example)。

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `OPEN_AI_KEY` | 服务端必填 | — | OpenAI API Key。缺省时回退到 UI 中填入的值。 |

## 目录结构

```
ChatVRM-Agent/
├── .github/
│   ├── workflows/          # CI (next build)
│   ├── ISSUE_TEMPLATE/     # Bug 报告与功能请求模板
│   └── PULL_REQUEST_TEMPLATE.md
├── public/                 # 静态资源（默认 VRM、待机动画、OGP 图片）
├── src/
│   ├── components/         # React UI（聊天列表、设置、菜单、VRM 视图…）
│   ├── features/
│   │   ├── chat/           # OpenAI 客户端
│   │   ├── emoteController/  # 眨眼、视线、表情
│   │   ├── koeiromap/      # TTS 客户端
│   │   ├── lipSync/        # 音频驱动的嘴型
│   │   ├── messages/       # 消息存储、TTS 编排
│   │   └── vrmViewer/      # three.js + three-vrm 封装
│   ├── lib/                # VRM / VRMA 加载器与辅助
│   ├── pages/
│   │   ├── api/            # /api/chat, /api/tts
│   │   ├── _app.tsx
│   │   ├── _document.tsx
│   │   └── index.tsx
│   ├── styles/             # globals.css
│   └── utils/              # 小工具
├── .editorconfig
├── .env.example
├── .eslintrc.json
├── .gitignore
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── LICENSE                 # MIT（继承自 pixiv/ChatVRM）
├── README.md               # 英文主文档
├── README.zh.md            # 你正在阅读
├── README.ja.md
├── SECURITY.md
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
└── watch.json
```

## 脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发服务器（端口 3000，支持 HMR） |
| `npm run build` | 产出生产构建 |
| `npm run start` | 运行生产构建 |
| `npm run export` | 导出静态站点到 `out/` |
| `npm run lint` | 运行 ESLint（使用 Next.js 配置） |

## API 路由

- `POST /api/chat` — 代理 OpenAI Chat Completion 请求。Body: `{ apiKey?: string, messages: ChatMessage[] }`，缺省时回退到 `process.env.OPEN_AI_KEY`。
- `POST /api/tts` — 调用 Koeiromap 合成日语语音。Body: `{ text: string, speakerX: number, speakerY: number }`。

## 隐私与数据

- 对话历史仅保存在**浏览器内存**中，刷新即清除。
- 音频在本地由 Web Speech API 识别；识别出的文本会发送至 OpenAI（或其他 LLM）和 Koeiromap。
- 本项目代码不收集任何遥测或分析数据。
- 第三方数据处理条款请参阅 [OpenAI 数据使用政策](https://openai.com/policies/api-data-usage-policies) 与 [Koeiromap 服务条款](https://koemotion.rinna.co.jp/)。

## 贡献

欢迎贡献！请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)，并遵守 [Code of Conduct](./CODE_OF_CONDUCT.md)。Bug 与功能请求请使用 [`.github/ISSUE_TEMPLATE/`](./.github) 中的模板。

## 安全

请**不要**在公开 issue 中提交安全问题。详见 [SECURITY.md](./SECURITY.md)。

## 许可证

本项目基于 **MIT 协议** 发布，见 [LICENSE](./LICENSE)。原作者为 [pixiv](https://github.com/pixiv/ChatVRM)，本 fork 由 [@badhope](https://github.com/badhope) 维护。

## 致谢

- [pixiv](https://github.com/pixiv) — 原 ChatVRM 项目与 [@pixiv/three-vrm](https://github.com/pixiv/three-vrm)
- [rinna / Koemotion](https://koemotion.rinna.co.jp/) — Koeiromap 情感 TTS
- [OpenAI](https://openai.com/) — Chat Completions API
- 全部贡献者与开源 VRM 社区
