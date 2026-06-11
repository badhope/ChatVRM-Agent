# Personal-Assistant（个人助手）

> **状态：已被 [`pa-agent`](../pa-agent/README_zh.md) 取代。**
> 本仓库的 v2（TypeScript）实现仍可运行、保留作为参考，但当前活跃的开发线
> 是 Python 重写版 `pa-agent/`。两者沿用同一套三层架构（本地 IO ·
> 模型网关 · 工具运行时），但新项目有更干净的 Pipeline、真正的 SSE 流式
> 输出和 Streamlit Web 前端。当前构建请看 [pa-agent 中文说明](../pa-agent/README_zh.md)。

一个通过 6 阶段 Pipeline 进行规划、推理和执行的个人 AI 智能体。CLI 和 React Web UI 共享同一套核心——10 个 LLM Provider、7 个真实工具、真实 SSE 流式传输、无 mock 层。

[English](README.md) | **中文**

---

## 这是什么？

Personal-Assistant 是一个可以本地运行或部署在反向代理后面的自托管 AI 智能体。用自然语言给它一个任务，它会经过六个阶段——理解、规划、执行、验证、反思——使用真实工具（文件读写、Shell、记忆、搜索）来完成任务。

和纯聊天封装不同，每个工具调用都走真实适配器：文件写到磁盘、Shell 命令在真实进程中运行、记忆持久化到磁盘。没有 mock 层、没有 stub、没有合成的"成功"路径。如果出了问题，你看到的是真实错误。

### 核心特性

- **6 阶段 Pipeline** — understand → plan → execute → validate → reflect，带实时进度事件
- **10 个 LLM Provider** — OpenAI、Anthropic、Google、DeepSeek、SiliconFlow、阿里云、智谱、百度、Ollama、LM Studio
- **7 个真实工具** — writeFile、readFile、shell、search、remember、analyze、respond
- **React Web UI** — 13 个页面，SSE 流式传输、知识图谱、人格切换、情绪状态
- **CLI** — 交互式聊天和一次性 Agent 任务
- **SDK** — `@personal-assistant/sdk`，可嵌入你自己的应用
- **国际化** — 英文和简体中文（348 个 key）
- **Clean Architecture** — ports、adapters、纯领域逻辑；核心零框架依赖

---

## 快速开始

### Web 模式

```bash
git clone https://github.com/badhope/Personal-Assistant.git
cd Personal-Assistant
npm run install:all
npm run build
npm run web:build
npm run server          # Express 默认 3000 端口（可用 PORT 环境变量覆盖）
```

浏览器打开 http://localhost:3000。

### CLI 模式

```bash
export SILICONFLOW_API_KEY=sk-your-real-key
npx tsx src/cli/index.ts agent "用一句话介绍你自己"
```

### 持久化 API Key

```bash
node dist/cli/index.js config set-key siliconflow sk-your-real-key
node dist/cli/index.js config set-default siliconflow
node dist/cli/index.js chat
```

> **为什么是 `npm run install:all`，不能直接 `npm install`？**
> 根目录和 `frontend/` 各自有 `package.json`（这不是 workspaces monorepo）。只在根目录 `npm install` 装好了 CLI 和 server，但 `frontend/node_modules` 是空的，`npm run web:dev` / `npm run web:build` 会因 `Cannot find module 'react'` 失败。`install:all` 把两步都跑了。

---

## Web 页面（13 个）

| 路由 | 说明 | 后端 API |
| --- | --- | --- |
| `/dashboard` | 统计：对话数、记忆、Agent 任务、Provider 状态 | `/api/dashboard`、`/api/config/snapshot` |
| `/chat`、`/chat/:id` | 真实 SSE 流式对话，10 个模型切换 | `/api/chat/stream`（SSE） |
| `/agent` | 6 阶段 Pipeline + 实时进度 | `/api/agent/run`（SSE） |
| `/agents` | Agent 管理和配置 | `/api/agents` |
| `/tools` | 7 个工具，带执行按钮 | `/api/tools`、`/api/tools/execute` |
| `/tool-templates` | 预构建工具模板 | `/api/tool-templates` |
| `/memory` | 浏览、搜索、按 tag 过滤、删除、清空长期记忆 | `/api/memory/*` |
| `/config` | 10 个 Provider 配置 + key 管理 + 连通性测试 | `/api/config/*` |
| `/graph` | Canvas 2D 力导向知识图谱 | `/api/graph` |
| `/settings` | 4 种人格切换 + 情绪状态 + 主题 | `/api/personality`、`/api/emotion` |
| `/personality` | 人格配置和系统提示词 | `/api/personality` |
| `/emotion` | 情绪状态可视化和历史 | `/api/emotion` |
| `/skills` | 技能管理和配置 | `/api/skills` |

---

## LLM Provider

项目不带 mock 层。LLM 调用失败（401 / 403 / 网络错误 / 限流）时，错误会原样抛给调用方——不会用合成的"成功"路径遮盖。

| Provider | 类型 | 默认 Base URL | 默认模型 | 协议 | API Key |
| --- | --- | --- | --- | --- | --- |
| `openai` | 云 | `https://api.openai.com/v1` | `gpt-4o` | OpenAI | 需要 |
| `anthropic` | 云 | `https://api.anthropic.com` | `claude-3-5-sonnet-...` | Anthropic | 需要 |
| `google` | 云 | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.0-flash` | Google | 需要 |
| `deepseek` | 云 | `https://api.deepseek.com/v1` | `deepseek-chat` | OpenAI 兼容 | 需要 |
| `siliconflow` | 云 | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-7B-Instruct` | OpenAI 兼容 | 需要 |
| `aliyun` | 云 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | OpenAI 兼容 | 需要 |
| `zhipu` | 云 | `https://open.bigmodel.cn/api/paas/v4` | `glm-4` | OpenAI 兼容 | 需要 |
| `baidu` | 云 | `https://aip.baidubce.com/rpc/2.0/ai_custom/v1` | `ernie-4.0-8k` | Baidu | 需要 |
| `ollama` | 本地 | `http://localhost:11434/v1` | `llama3.2` | OpenAI 兼容 | 不需要 |
| `lmstudio` | 本地 | `http://localhost:1234/v1` | `local-model` | OpenAI 兼容 | 不需要 |

默认 Provider：`siliconflow`（国内厂商、有免费额度、支持 Qwen2.5 / DeepSeek / GLM）。

### 存 Key

```bash
node dist/cli/index.js config set-key <provider> <YOUR_API_KEY>
node dist/cli/index.js config set-default <provider>
node dist/cli/index.js config show
node dist/cli/index.js config providers
```

API key 存放在 conf（默认 `~/.config/personal-assistant-nodejs/config.json`，文件权限 `0600`）。

### 环境变量优先级高于 conf

查找顺序：conf → `PERSONAL_ASSISTANT_<PROVIDER>` → `<PROVIDER>_API_KEY`。

```bash
export OPENAI_API_KEY=sk-xxxxxxxx
node dist/cli/index.js chat -p openai

export ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
node dist/cli/index.js agent "Write a quicksort" -p anthropic

export SILICONFLOW_API_KEY=sk-xxxxxxxx
node dist/cli/index.js chat

export DEEPSEEK_API_KEY=sk-xxxxxxxx
node dist/cli/index.js chat -p deepseek

export ALIYUN_API_KEY=sk-xxxxxxxx
node dist/cli/index.js chat -p aliyun

export ZHIPU_API_KEY=xxxxxxxx.xxxxxxxx
node dist/cli/index.js chat -p zhipu

export BAIDU_API_KEY=xxxxxxxx
node dist/cli/index.js chat -p baidu
```

### 自定义 Base URL（代理 / Azure / 自托管）

每个 Provider 都支持 `<PROVIDER>_BASE_URL`：

```bash
# Azure OpenAI
export OPENAI_BASE_URL=https://your-resource.openai.azure.com/openai/deployments/your-deploy
export OPENAI_API_KEY=your-azure-key
node dist/cli/index.js chat -p openai -m your-deploy-name

# OpenAI 兼容代理
export OPENAI_BASE_URL=https://api.your-proxy.com/v1
export OPENAI_API_KEY=sk-proxy
```

10 个 Provider 的覆盖变量：`OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL` / `GOOGLE_BASE_URL` / `DEEPSEEK_BASE_URL` / `SILICONFLOW_BASE_URL` / `ALIYUN_BASE_URL` / `ZHIPU_BASE_URL` / `BAIDU_BASE_URL` / `OLLAMA_BASE_URL` / `LMSTUDIO_BASE_URL`。

### 本地 LLM

```bash
# Ollama
ollama serve &
ollama pull llama3.2
node dist/cli/index.js chat -p ollama -m llama3.2

# LM Studio —— 先在 1234 端口启动本地 server
node dist/cli/index.js chat -p lmstudio
```

---

## CLI 命令

```bash
# 交互式多轮对话（readline）
node dist/cli/index.js chat [-p provider] [-m model]

# 单次 6 阶段 Pipeline
node dist/cli/index.js agent "<任务>" [-p provider] [-m model]

# 配置
node dist/cli/index.js config show
node dist/cli/index.js config set-key <provider> [key]      # 不传 key 时从 stdin 读取
node dist/cli/index.js config remove-key <provider>
node dist/cli/index.js config set-default <provider>
node dist/cli/index.js config providers
```

---

## 6 阶段 Pipeline

每个 `agent` 任务按顺序执行：

1. **initialize** —— 初始化上下文（taskId、metadata、错误列表）
2. **understand** —— LLM 识别意图（`chat` / `code` / `analyze` / `refactor` / `shell` / `search`）+ workspace 扫描
3. **plan** —— LLM 生成执行计划（步骤列表 + 工具选择）；LLM 失败时回退到模板计划
4. **execute** —— 按步骤调用工具
5. **validate** —— 验证结果（语法、退出码、文件存在性）
6. **reflect** —— 自我反思，更新情绪状态，写入长期记忆

---

## 7 个工具

| 工具 | 作用 | 后端 |
| --- | --- | --- |
| `writeFile` | 写文件 | `StorageAdapter`（真实文件系统） |
| `readFile` | 读文件 | `StorageAdapter`（真实文件系统） |
| `shell` | 执行 shell 命令 | `child_process`（真实进程） |
| `search` | 搜索长期记忆 | `MemoryAdapter.recall`（MiniSearch） |
| `remember` | 写入长期记忆 | `MemoryAdapter.remember` |
| `analyze` | 调用 LLM 分析文本 | `LLMAdapter.chat`（真实 LLM） |
| `respond` | 调用 LLM 对话回复 | `LLMAdapter.chat`（真实 LLM） |

---

## 无 mock 层

自己跑这两个用例就能验证没有任何 stub：

```bash
# 1. 没有 key —— 不会静默 fallback，会报错
$ node dist/cli/index.js chat
✗ No API key configured for provider "siliconflow".
Run: personal-assistant config set-key siliconflow <YOUR_KEY>
Or set the env var: PERSONAL_ASSISTANT_SILICONFLOW / SILICONFLOW_API_KEY

# 2. 假 key —— 真实 HTTP 调用，厂商直接返回 401
$ SILICONFLOW_API_KEY=sk-fake-key node dist/cli/index.js agent "hi"
📍 execute
  Running step: Generate conversational response
  ✗ LLM request failed (siliconflow): 401 "Api key is invalid"
```

每次 LLM 调用都是真实的 `fetch` 到厂商端点。

---

## 项目结构

```
Personal-Assistant/
├── src/                          # 核心（Clean Architecture）
│   ├── adapters/                 # LLM / Config / Memory / Storage / Shell / Tools / Git / Context
│   ├── core/                     # Pipeline + EventBus
│   ├── stages/                   # 6 个阶段：init / understand / plan / execute / validate / reflect
│   ├── ports/                    # 接口契约
│   ├── domain/                   # personality / memory / trust / emotion
│   ├── infrastructure/           # Circuit Breaker（opossum）、logger、密钥存储
│   ├── machines/                 # XState Agent FSM
│   ├── cli/                      # CLI 入口（chat / agent / config）
│   └── __tests__/                # 单元 + 集成 + e2e 测试
├── server/                       # Express 后端
│   ├── index.ts                  # 入口
│   ├── app.ts                    # 路由 + 静态托管 frontend/dist
│   ├── providers.ts              # 10 个 provider 元数据
│   ├── session-store.ts          # 对话 session 持久化
│   ├── tools-setup.ts            # 7 个工具注册
│   └── routes/                   # REST + SSE 路由
├── frontend/                     # React 18 + TypeScript + Vite + Tailwind
│   ├── src/
│   │   ├── api/                  # fetch 客户端 + sseStream()
│   │   ├── stores/               # zustand：theme / config / locale
│   │   ├── i18n/                 # EN / 中 翻译
│   │   ├── pages/                # 13 个页面
│   │   ├── components/           # Layout + UI 组件
│   │   ├── types/                # TypeScript 类型
│   │   └── styles/               # Tailwind + CSS 变量
│   └── dist/                     # 构建产物（由 /server 托管）
├── .github/
│   ├── workflows/ci-cd.yml       # CI/CD（Node 20/22、前端构建）
│   ├── ISSUE_TEMPLATE/           # bug / feature / docs / new_provider
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── CODEOWNERS                # 代码评审负责人
├── sdk/                          # 独立 npm 包 (@personal-assistant/sdk)
├── examples/                     # 7 个可运行示例脚本
├── docs/                         # ARCHITECTURE / SETUP / TROUBLESHOOTING / DEPLOYMENT / API / SDK
├── README.md                     # 英文版
├── README_zh.md                  # 中文版（本文件）
├── CHANGELOG.md                  # Keep-a-Changelog
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md            # 贡献者公约 2.1
├── LICENSE                       # MIT
├── .editorconfig
├── .prettierrc
├── .npmignore
├── codecov.yml
├── typedoc.json
└── package.json
```

---

## 国际化（EN / 中）

Web UI 内置中英双语。点击页眉的地球图标在英文和简体中文之间切换；选择会持久化到 `localStorage`，刷新页面后保留。两种语言覆盖相同的 348 个 key，涵盖全部 13 个页面。

翻译文件位于 [`frontend/src/i18n/`](frontend/src/i18n/)，采用标准 i18next JSON 格式。新增语言：

1. 复制 `frontend/src/i18n/en.json` 为 `frontend/src/i18n/<code>.json` 并翻译
2. 在 [`frontend/src/i18n/index.ts`](frontend/src/i18n/index.ts) 的 `SUPPORTED_LANGUAGES` 和 `resources` 中注册
3. 在 [`Layout.tsx`](frontend/src/components/Layout.tsx) 的语言下拉菜单中添加一项

---

## 示例

[`examples/`](examples/) 文件夹有 7 个独立的、可运行的 TypeScript 文件。每个都有前置条件和 `npx tsx` 命令注释。详见 [`examples/README.md`](examples/README.md)。

---

## 部署

参见 [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)：

- 推荐拓扑（nginx / Caddy 反向代理 + TLS）
- nginx + Caddy 配置片段
- Dockerfile + docker-compose
- systemd 服务单元 + 安全加固
- 生产安全检查清单
- 备份与恢复

---

## 开发命令

```bash
npm install              # 安装后端依赖
npm run build            # 编译后端（tsc）
npm run server           # Express（tsx watch）
npm run web:dev          # Vite 前端开发模式（HMR，/api 代理 → :3000）
npm run web:build        # 前端生产构建
npm test                 # vitest run
npm run test:coverage    # vitest + v8 覆盖率
npm run lint             # ESLint 9.x flat config
npm run format           # Prettier
npm run verify           # lint + test + tsc + 前端构建（一键 CI）
```

---

## 排错

| 现象 | 原因 / 修复 |
| --- | --- |
| `No API key configured for provider "..."` | 1) 未设置 key；2) key 名称拼写错误（注意 `PERSONAL_ASSISTANT_<PROVIDER>` 大写） |
| `LLM request failed (openai): 401` | key 无效或过期，去厂商控制台重新生成 |
| `LLM request failed (openai): 429` | 触发限流，稍等几秒或换模型 |
| `fetch failed` | 网络受限 / 代理不通，可 `curl https://api.openai.com/v1/models` 验证 |
| `Anthropic request failed: 403` | 1) key 错误；2) IP 在 Anthropic 拒绝区域（国内常见） |
| `ollama` / `lmstudio` 不可达 | 本地服务未启动：`ollama serve` 或打开 LM Studio 的本地 server |
| 想改 base URL | 设置 `<PROVIDER>_BASE_URL` 环境变量 |

---

## 协议细节

- **OpenAI 兼容**（7 个 Provider）：`POST {base_url}/chat/completions`，`Authorization: Bearer <key>`
- **Anthropic**：`POST {base_url}/v1/messages`，`x-api-key: <key>` + `anthropic-version: 2023-06-01`
- **Google**：`POST {base_url}/models/{model}:generateContent?key=<key>`
- **百度**：`POST {base_url}/wenxinworkshop/chat/{model}?access_token=<key>`

所有请求都通过 `fetch` 直接打到厂商。

---

## 贡献

参见 [`CONTRIBUTING.md`](CONTRIBUTING.md) 了解开发流程。
使用 [issue](.github/ISSUE_TEMPLATE/) 和 [PR](.github/PULL_REQUEST_TEMPLATE.md) 模板。

参与即表示同意 [Code of Conduct](CODE_OF_CONDUCT.md)。
安全问题请按 [`SECURITY.md`](SECURITY.md) 走[私有披露](https://github.com/badhope/Personal-Assistant/security/advisories/new)，不要发公开 issue。

## 协议

MIT —— 见 [LICENSE](LICENSE)。
