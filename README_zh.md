# 个人助手 (Personal Assistant) — 中文版

> Pipeline 驱动的个人 AI 智能体 · 10 个 LLM Provider · 7 个真实工具 · 6 阶段 Pipeline · 真实 SSE 流式 · 0 mock

[English](README.md) | **中文**

一个**真实可用**的个人 AI 智能体。不是 demo，不是包装，是真实调用 LLM、真实执行工具、真实落盘的工程化项目。

---

## ✨ 核心特性

- 🤖 **10 个 LLM Provider** — OpenAI、Anthropic、Google、DeepSeek、SiliconFlow、阿里云百炼、智谱 AI、百度千帆、Ollama、LMStudio，全部真实 HTTP 调用，0 mock 兜底
- 🛠 **7 个真实工具** — `writeFile` / `readFile` / `shell` / `search` / `remember` / `analyze` / `respond`，所有工具直连 `ToolsRegistry`
- 🧠 **6 阶段 Pipeline** — `Initialize → Understand → Plan → Execute → Validate → Reflect`，事件驱动的状态机
- 🧩 **Clean Architecture** — Ports & Adapters，core/stages/adapters/ports 分层
- 🔍 **MiniSearch 全文检索** + **graphology 知识图谱**
- ⚡ **完整 SSE 流式** — `chat`、`agent` 路由的实时事件流
- 💾 **真实持久化** — API key 存 `~/.config/...` (0600 权限)，记忆落盘 `MiniSearch`
- 🛡 **Sandbox + Circuit Breaker (opossum)** — 工具调用的安全网
- 🎨 **现代 Web UI** — React 18 + TypeScript + Vite + Tailwind · 9 个页面 · 中英双语
- ✅ **707 个 vitest 测试** 跨 40 个文件，全绿

---

## 🚀 快速开始

### 前置要求
- Node.js ≥ 20
- npm ≥ 9

### Web UI 模式

```bash
# 1. 克隆并安装
git clone https://github.com/badhope/Personal-Assistant.git
cd Personal-Assistant
npm install

# 2. 一键启动 (后端 + 前端 dev server)
npm run dev

# 后端  http://localhost:4317
# 前端  http://localhost:5173
```

打开 [http://localhost:5173](http://localhost:5173) → 进入 **Config** 页面配置至少一个 LLM 的 API Key → 开始聊天或跑 Agent。

### CLI 模式

```bash
# 启动交互式 REPL
npx pa

# 或一次性提问
npx pa -m "用 Python 写一个快排"
npx pa chat -m "解释 Transformer self-attention"
npx pa agent -m "写一个 TypeScript 函数统计文件行数"
npx pa tools list
npx pa memory search "Python"
npx pa --help
```

---

## 🖥 Web 界面 (9 个页面)

| 页面 | 描述 |
|---|---|
| **Dashboard** | 实时概览 — Provider 状态 / 记忆数 / Agent 任务数 / 近期活动 |
| **Chat** | 多轮 LLM 对话 · 真实流式 · 10 个 provider 切换 |
| **Agent** | 6 阶段 Pipeline 可视化 · 实时事件流 · 工具调用记录 |
| **Tools** | 7 个真实工具的浏览器 · 填参数即执行 |
| **Memory** | 长期记忆搜索 · 按 tag 过滤 · 详情查看 |
| **Config** | 10 个 LLM Provider · API key 管理 · Chat 默认参数 |
| **Graph** | 记忆 + tag 的力导向图 (Canvas 2D) |
| **Settings** | 主题 / 人格 / 情绪状态 / 数据导出 |

界面右上角切换 **EN / 中** 即可在英文和中文之间实时切换。

---

## 🔌 10 个 LLM Provider

| Provider | 协议 | 默认模型 | 需要 key |
|---|---|---|---|
| `openai` | OpenAI | gpt-4o-mini | ✅ |
| `anthropic` | Anthropic | claude-3-5-sonnet-latest | ✅ |
| `google` | Google | gemini-2.0-flash-exp | ✅ |
| `deepseek` | OpenAI | deepseek-chat | ✅ |
| `siliconflow` | OpenAI | Qwen/Qwen2.5-7B-Instruct | ✅ |
| `aliyun` | OpenAI | qwen-turbo | ✅ |
| `zhipu` | OpenAI | glm-4-flash | ✅ |
| `baidu` | Baidu | ernie-4.0-8k | ✅ |
| `ollama` | OpenAI | llama3.1:8b | ❌ (本地) |
| `lmstudio` | OpenAI | qwen2.5-7b-instruct | ❌ (本地) |

### 配置 API Key

优先级 (高 → 低):
1. Web UI 的 **Config** 页面 (存储在 `~/.config/personal-assistant-nodejs/config.json`，0600 权限)
2. 环境变量 `PERSONAL_ASSISTANT_<PROVIDER>` (例如 `PERSONAL_ASSISTANT_OPENAI`)
3. 环境变量 `<PROVIDER>_API_KEY` (例如 `OPENAI_API_KEY`)

---

## ⌨️ CLI 命令

```bash
pa                          # 启动交互式 REPL
pa chat -m "..."            # 一次性对话
pa agent -m "..."           # 跑 6 阶段 Agent 任务
pa tools list               # 列出所有工具
pa tools exec <name> -a '{}'  # 直接执行工具
pa memory list              # 列出记忆
pa memory search "q"        # 搜索记忆
pa memory clear             # 清空记忆
pa config get               # 查看配置
pa config set-default <p>   # 设置默认 provider
pa emotion                  # 查看情绪状态
pa personality list         # 列出可用人格
pa help                     # 查看帮助
```

---

## 🏗 架构

### 6 阶段 Pipeline

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ initialize   │───▶│  understand  │───▶│    plan      │
│  build ctx   │    │  LLM intent  │    │  LLM plan    │
└──────────────┘    └──────────────┘    └──────┬───────┘
                                                │
┌──────────────┐    ┌──────────────┐    ┌──────▼───────┐
│   reflect    │◀───│   validate   │◀───│   execute    │
│ write memory │    │ check output │    │ call tools   │
└──────────────┘    └──────────────┘    └──────────────┘
```

每个阶段都有事件 (SSE)，可以被 Web UI 实时消费。

### 7 个工具

| 工具 | 作用 |
|---|---|
| `writeFile` | 写入文件 (支持 `content` + `path`) |
| `readFile` | 读取文件 |
| `shell` | 执行 shell 命令 (带 sandbox 校验) |
| `search` | 搜索 workspace (glob + content) |
| `remember` | 写入长期记忆 (MiniSearch index) |
| `analyze` | 分析输入 / 输出 (LLM 调用) |
| `respond` | 直接生成回复 (LLM 调用) |

---

## 📂 项目结构

```
Personal-Assistant/
├── src/                       # 核心库 (npm package)
│   ├── adapters/             # 10 个 LLM + memory + config 适配器
│   ├── core/                 # 核心 (Pipeline, EventEmitter)
│   ├── stages/               # 6 阶段实现
│   ├── ports/                # 端口接口 (LLM, Memory, Config, Tools)
│   ├── domain/               # 领域模型 (personality, memory, trust, emotion)
│   ├── infrastructure/       # 基础设施 (circuit-breaker, sandbox)
│   ├── cli/                  # CLI 入口
│   └── index.ts              # 主入口
├── server/                    # Express 后端 (REST + SSE)
│   ├── routes/               # 11 个路由模块
│   ├── middleware/
│   ├── services/
│   └── index.ts
├── frontend/                  # React + Vite + Tailwind Web UI
│   ├── src/
│   │   ├── pages/            # 8 个页面 + Layout
│   │   ├── components/       # 30+ 通用组件
│   │   ├── stores/           # Zustand stores
│   │   ├── i18n/             # 中英双语 (en.json, zh.json)
│   │   ├── api/              # API 客户端
│   │   └── main.tsx
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── package.json
├── __tests__/                 # 707 个 vitest 测试
├── .github/
│   ├── workflows/            # CI/CD
│   └── ISSUE_TEMPLATE/
├── typedoc.json              # API 文档生成
└── package.json
```

---

## 🛠 开发

```bash
# 安装依赖
npm install
npm --prefix frontend install

# 类型检查
npm run typecheck

# 测试
npm test                    # 707 测试
npm test:coverage           # 覆盖率

# Lint
npm run lint

# 构建
npm run build               # 库
npm run web:build           # 前端

# 同时启动 (concurrently)
npm run dev                 # 后端 4317 + 前端 5173
npm run dev:server          # 仅后端
npm run dev:web             # 仅前端
```

---

## 📦 API 协议

### REST

```
GET  /api/health                      # 健康检查
GET  /api/dashboard                   # 仪表盘统计
GET  /api/config/snapshot             # 当前配置
GET  /api/config/providers            # 所有 provider 元数据
POST /api/config/set-key              # 设置 API key
POST /api/config/remove-key           # 移除 API key
POST /api/config/set-default          # 设置默认 provider
POST /api/config/test-message         # 测试 provider
GET  /api/tools                       # 工具列表
POST /api/tools/execute               # 执行工具
GET  /api/memory                      # 搜索记忆
DELETE /api/memory/:id                # 删除单条
POST /api/memory/clear                # 清空所有
GET  /api/graph                       # 知识图谱
GET  /api/emotion                     # 情绪状态
POST /api/personality                 # 切换人格
```

### SSE (Server-Sent Events)

```
POST /api/chat/stream                 # 流式对话
POST /api/agent/run                   # 流式 Agent 任务
```

每个事件都是 `event: <name>` + `data: <json>` 格式。

---

## 🐛 排错

### API key 不生效
- 检查存储位置: `~/.config/personal-assistant-nodejs/config.json`
- 确认文件权限是 `0600`
- 试 `npx pa config get` 验证加载顺序

### 工具执行失败
- 检查 sandbox 设置 (`config.sandbox.allowedCommands`)
- 工具调用都会经过 sandbox 校验，不在白名单的命令会被拒绝

### 端口冲突
- 后端默认 `4317` 端口，前端 `5173`
- 通过环境变量 `PORT` 修改后端

---

## 📜 协议

[MIT](LICENSE) © 2026 Personal-Assistant Contributors
