# ChatVRM Agent (中文)

> 一个基于浏览器的 3D 数字人对话框架 — 加载 VRM 形象，与 LLM 驱动的角色进行语音聊天。

🌐 **语言**: [English](./README.md) · [中文](./README.zh.md) · [日本語](./README.ja.md)

---

## 简介

ChatVRM Agent 是一个浏览器端 3D 角色对话应用。导入一个 VRM 模型，选好声音，角色就会：聆听你的麦克风 → 调用大模型生成回复 → 用富有情感的声音念出来 → 同步做出表情和肢体动作。

采用现代玻璃拟态 UI、渐进式设置面板、完整的移动端适配（刘海屏安全区）、以及无障碍功能（ARIA 角色、焦点管理、减弱动画支持）。

## 功能特性

- 🎭 **VRM 形象支持** — 拖入任意 `.vrm` 文件即可在浏览器中显示，相机锁定全身画面
- 🎤 **语音输入** — 基于浏览器 [Web Speech API (SpeechRecognition)](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
- 🤖 **多 LLM** — 13 个内置聊天供应商（OpenAI、Anthropic、OpenRouter、DeepSeek、月之暗面、智谱、阿里百炼、火山引擎、混元、千帆、硅基流动、Ollama、Azure）+ 自定义 HTTP 端点
- 🗣️ **多 TTS** — 5 个内置语音供应商（Koeiromap、OpenAI TTS、ElevenLabs、微软 Edge TTS、自定义 HTTP）
- 👀 **表情与动作** — 自动眨眼、视线跟踪、唇形同步由 [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) 驱动
- 🛑 **流式控制** — 停止按钮通过 `AbortController` 同时中断 LLM 流和 TTS 播放队列
- 🌐 **国际化** — 英文 / 中文 UI，日文 README 翻译
- 📱 **响应式 & 移动端安全** — 桌面/平板/手机断点，`env(safe-area-inset-*)` 刘海屏处理，`viewport-fit=cover`
- ♿ **无障碍** — 对话框 ARIA 角色、焦点管理、`prefers-reduced-motion` 支持、`backdrop-filter` 的 `@supports` 回退
- ⚙️ **运行时调参** — 设置面板中可调节声音、说话风格与系统提示词

## 技术栈

| 层 | 技术 |
| --- | --- |
| 框架 | Next.js 13 (Pages Router) |
| 语言 | TypeScript 5 |
| UI | React 18, Tailwind CSS, 玻璃拟态设计系统 |
| 3D | three.js, @pixiv/three-vrm |
| 大模型 | 13 个供应商，统一流式客户端 (`features/llm/`) |
| 语音合成 | 5 个供应商，统一合成客户端 (`features/tts/`) |
| 语音识别 | Web Speech API |

## 快速开始

### 环境要求

- Node.js **16.14.2**（见 `package.json` 中 `engines`）或兼容的 16.x / 18.x
- npm
- 至少一个 **LLM** 供应商的 API Key（如 OpenAI、DeepSeek、Anthropic）
- 至少一个 **TTS** 供应商的 API Key（如果不想用免费的 Edge TTS）

### 1. 克隆并安装

```bash
git clone https://github.com/badhope/ChatVRM-Agent.git
cd ChatVRM-Agent
npm install
```

### 2. 配置环境变量（可选）

复制示例文件并填入你的密钥。应用也支持在设置面板中填入 Key — 环境变量仅作为默认值。

```bash
cp .env.example .env
```

编辑 `.env`：

```env
# 可选的默认 LLM Key（应用内 Key 为空时使用）
OPEN_AI_KEY=sk-...
```

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

> ⚠️ 静态导出无法在服务端调用 `/api/tts-edge` 和 `/api/chat`。如需这些路由，请部署到支持 Node 的平台（Vercel、Railway、Fly.io、自有 VPS 等）。

## 支持的 LLM 供应商

LLM 客户端 (`src/features/llm/`) 支持 **OpenAI 兼容** 和 **Anthropic 原生** 协议。可在 **设置 → LLM 供应商** 下拉菜单中切换。

| 供应商 | 区域 | 协议 | 默认模型 | 备注 |
| --- | --- | --- | --- | --- |
| OpenAI | 全球 | OpenAI | `gpt-4o-mini` | 下拉中标记视觉模型 |
| Azure OpenAI | 全球 | OpenAI | *(部署名)* | 需自定义 baseURL |
| Anthropic (Claude) | 全球 | Anthropic | `claude-sonnet-4-5` | 使用 `x-api-key` + `anthropic-version` |
| OpenRouter | 全球 | OpenAI | `openai/gpt-4o-mini` | 一个 Key，500+ 模型 |
| DeepSeek | 中国 | OpenAI | `deepseek-chat` | 另有 `deepseek-reasoner` |
| 月之暗面 (Kimi) | 中国 | OpenAI | `moonshot-v1-8k` | 8k/32k/128k 上下文 |
| 智谱 AI (GLM) | 中国 | OpenAI | `glm-4.6` | `glm-4-flash` 有免费额度 |
| 阿里百炼 (Qwen) | 中国 | OpenAI | `qwen-plus` | 可改 baseURL 切换区域 |
| 火山引擎方舟 (豆包) | 中国 | OpenAI | `doubao-seed-1-6-250715` | 豆包、DeepSeek、代码模型 |
| 腾讯混元 | 中国 | OpenAI | `hunyuan-turbos-latest` | |
| 百度千帆 | 中国 | OpenAI | `deepseek-v3.2` | ERNIE + Qwen + DeepSeek |
| 硅基流动 | 中国 | OpenAI | `Qwen/Qwen3-8B` | Qwen3-8B 有免费额度 |
| Ollama (本地) | 本地 | OpenAI | `qwen3:8b` | 本地运行 `ollama serve` |

**自定义供应商** — 选择 "Custom" 或设置 `customBaseURL: true` 指向任何 OpenAI 兼容端点（vLLM、LiteLLM 代理、LM Studio、你自己的服务器等）。

设置面板中有 **测试连接** 按钮，会发送一个最小的 "ping" 请求并报告响应。

## 支持的 TTS 供应商

TTS 客户端 (`src/features/tts/`) 支持 5 种协议。可在 **设置 → TTS 供应商** 下拉菜单中切换。

| 供应商 | 协议 | API Key | 声音 | 费用 |
| --- | --- | --- | --- | --- |
| Koeiromap (Koemotion) | REST JSON → base64 mp3 | 可选 | 4 个日语预设 | 免费（限流）/ 付费 |
| OpenAI TTS | REST → 二进制流 | 必填 | 6 个内置声音 | 按字符计费 |
| ElevenLabs | REST → 二进制流 | 必填 | 8 个内置声音 | 免费额度 + 付费 |
| 微软 Edge TTS | 服务端代理 (`/api/tts-edge`) | **不需要** | 8 个神经语音（日/英/中/韩） | 免费 |
| 自定义 HTTP | REST → 二进制流 | 可选 | 自定义 | 你的成本 |

**自定义供应商** — 向你的端点 POST `{ text, voice, format, speed }` 并返回原始音频字节。可接入 CosyVoice、GPT-SoVITS、LiteLLM TTS 代理等。

## 脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 启动开发服务器（端口 3000，支持 HMR） |
| `npm run build` | 产出生产构建 |
| `npm run start` | 运行生产构建 |
| `npm run export` | 导出静态站点到 `out/` |
| `npm run lint` | 运行 ESLint（使用 Next.js 配置） |
| `npm run typecheck` | 运行 `tsc --noEmit` |
| `npm test` | 运行 Vitest 单元测试 |

## API 路由

- `POST /api/chat` — 旧版服务端代理到 OpenAI。新客户端直接从浏览器调用 LLM。
- `POST /api/tts` — 旧版服务端代理到 Koeiromap 免费端点。新客户端直接从浏览器调用 TTS。
- `POST /api/tts-edge` — 微软 Edge TTS 的服务端代理，返回 mp3 字节流。

## 隐私与数据

- 对话历史仅保存在**浏览器内存**中，刷新即清除。
- API Key 和设置存储在 `localStorage` 的 `chatvrm:llm:v1` 和 `chatvrm:tts:v1` 键下。
- LLM 和 TTS 调用**直接从浏览器**发送到你选择的供应商（Edge TTS 除外，它使用 `/api/tts-edge` 代理）。
- 音频由 Web Speech API 在本地识别，识别文本转发到你选择的 LLM 和 TTS 供应商。
- 本代码库不收集任何遥测或分析数据。

## 贡献

欢迎贡献！请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)，并遵守 [Code of Conduct](./CODE_OF_CONDUCT.md)。

## 安全

请**不要**在公开 issue 中提交安全问题。详见 [SECURITY.md](./SECURITY.md)。

## 许可证

本项目基于 **MIT 协议** 发布，见 [LICENSE](./LICENSE)。

## 致谢

- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) — VRM 渲染库
- [rinna / Koemotion](https://koemotion.rinna.co.jp/) — Koeiromap 情感 TTS
- [OpenAI](https://openai.com/) — Chat Completions API + TTS
- [Anthropic](https://www.anthropic.com/) — Claude Messages API
- [ElevenLabs](https://elevenlabs.io/) — 神经 TTS
- [Microsoft](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/) — Edge TTS 神经语音
- 所有贡献者与开源 VRM 社区
