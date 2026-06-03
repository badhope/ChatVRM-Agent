# Personal-Assistant（个人助手）

> Pipeline 驱动的个人 AI 智能体，配 Web UI 和 CLI。
> 10 个 LLM Provider · 7 个真实工具 · 6 阶段 Pipeline · 完整 SSE 流式。
> **无 mock、无兜底、无假数据** —— 每次 API 调用都打到厂商真实端点。

[English](README.md) | **中文**

---

## 核心特性

- **10 个 LLM Provider** —— OpenAI、Anthropic、Google、DeepSeek、SiliconFlow、阿里云百炼、智谱 AI、百度千帆、Ollama、LMStudio
- **7 个真实工具** —— `writeFile`、`readFile`、`shell`、`search`、`remember`、`analyze`、`respond`
- **6 阶段 Pipeline** —— `initialize` → `understand` → `plan` → `execute` → `validate` → `reflect`
- **Web UI** —— React 18 + TypeScript + Vite + Tailwind，8 个页面，真实 SSE 流式
- **多轮对话** —— 持久化 session（JSON 落盘）
- **长期记忆** —— MiniSearch 全文检索 + graphology 知识图谱
- **4 种人格** + 动态情绪状态
- **Server-Sent Events** —— 实时推送 chat 与 pipeline 进度
- **Circuit Breaker**（opossum）提升韧性
- **响应式布局** —— 适配手机 / 平板 / 桌面
- **国际化** —— UI 内置 EN / 中 切换

---

## 快速开始

### Web 模式

```bash
git clone https://github.com/badhope/Personal-Assistant.git
cd Personal-Assistant
npm install
(cd frontend && npm install)
npm run build
npm run web:build
npm run server          # Express 默认 3000 端口（可用 PORT 环境变量覆盖）
```

浏览器打开 <http://localhost:3000>。

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

---

## Web 页面（8 个）

| 路由 | 说明 | 后端 API |
| --- | --- | --- |
| `/dashboard` | 统计：对话数、记忆、Agent 任务、Provider 状态 | `/api/dashboard`、`/api/config/snapshot` |
| `/chat`、`/chat/:id` | 真实 SSE 流式对话，10 个模型切换 | `/api/chat/stream`（SSE） |
| `/agent` | 6 阶段 Pipeline + 实时进度 | `/api/agent/run`（SSE） |
| `/tools` | 7 个真实工具：`writeFile`、`readFile`、`shell`、`search`、`remember`、`analyze`、`respond` | `/api/tools`、`/api/tools/execute` |
| `/memory` | 浏览、搜索、按 tag 过滤、删除、清空长期记忆 | `/api/memory/*` |
| `/config` | 10 个 Provider 配置 + key 管理 + 真实连通性测试 | `/api/config/*` |
| `/graph` | Canvas 2D 力导向知识图谱 | `/api/graph` |
| `/settings` | 4 种人格切换 + 情绪状态 + 主题 | `/api/personality`、`/api/emotion` |

---

## LLM Provider

项目不带 mock 层。LLM 调用失败（401 / 403 / 网络错误 / 限流）时，错误会原样抛给调用方 —— 不会有假的"成功"路径。

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

**默认 Provider**：`siliconflow`（国内厂商、有免费额度、支持 Qwen2.5 / DeepSeek / GLM）。

### CLI：持久化 Key

```bash
node dist/cli/index.js config set-key <provider> <YOUR_API_KEY>
node dist/cli/index.js config set-default <provider>
node dist/cli/index.js config show
node dist/cli/index.js config providers
```

API key 存放在 conf（默认 `~/.config/personal-assistant-nodejs/config.json`，文件权限 `0600`）。

### 环境变量（优先级更高）

CLI 查找顺序：conf → `PERSONAL_ASSISTANT_<PROVIDER>` → `<PROVIDER>_API_KEY`。

```bash
export SILICONFLOW_API_KEY=sk-xxxxxxxx
node dist/cli/index.js chat

export DEEPSEEK_API_KEY=sk-xxxxxxxx
node dist/cli/index.js chat -p deepseek
```

每个 Provider 还支持 `<PROVIDER>_BASE_URL` 自定义代理 / Azure / 自托管端点。

### 本地 LLM（Ollama / LM Studio）

```bash
ollama serve &
ollama pull llama3.2
node dist/cli/index.js chat -p ollama -m llama3.2

# LM Studio —— 先在 1234 端口启动本地 server
node dist/cli/index.js chat -p lmstudio
```

---

## CLI 命令

```bash
# 交互式多轮对话（readline 真终端）
node dist/cli/index.js chat [-p provider] [-m model]

# 单任务 6 阶段 Pipeline
node dist/cli/index.js agent "<任务>" [-p provider] [-m model]

# 配置管理
node dist/cli/index.js config show
node dist/cli/index.js config set-key <provider> [key]   # 不传 key 时从 stdin 读取
node dist/cli/index.js config remove-key <provider>
node dist/cli/index.js config set-default <provider>
node dist/cli/index.js config providers
```

---

## 6 阶段 Pipeline

每个 `agent` 任务顺序执行：

1. **initialize** —— 初始化上下文（taskId、metadata、错误列表）
2. **understand** —— LLM 识别意图（`chat` / `code` / `analyze` / `refactor` / `shell` / `search`）+ workspace 扫描
3. **plan** —— LLM 生成执行计划（步骤列表 + 工具选择）；LLM 失败时回退到模板计划
4. **execute** —— 按步骤调用工具（`writeFile` / `readFile` / `shell` / `search` / `remember` / `analyze` / `respond`）
5. **validate** —— 验证结果（语法、退出码、文件存在性）
6. **reflect** —— 自我反思，更新情绪状态，写入长期记忆

---

## 7 个真实工具

| 工具 | 作用 | 后端 |
| --- | --- | --- |
| `writeFile` | 写文件 | `StorageAdapter` 真实文件系统 |
| `readFile` | 读文件 | `StorageAdapter` 真实文件系统 |
| `shell` | 执行 shell 命令 | `child_process` 真实进程 |
| `search` | 搜索长期记忆 | `MemoryAdapter.recall`（MiniSearch） |
| `remember` | 写入长期记忆 | `MemoryAdapter.remember` |
| `analyze` | 调用 LLM 分析文本 | `LLMAdapter.chat` 真实 LLM |
| `respond` | 调用 LLM 对话回复 | `LLMAdapter.chat` 真实 LLM |

---

## 真实接口验证

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

**没有 mock、没有假的成功** —— 每次 LLM 调用都是真实的 `fetch` 到厂商端点。

---

## 国际化（EN / 中）

Web UI 内置中英双语。点击页眉的地球图标在英文和简体中文之间切换。

语言偏好会持久化到 `localStorage`，刷新页面后保留。两种语言覆盖相同的 348 个 key，涵盖全部 8 个页面（navigation、dashboard、chat、agent、tools、memory、config、graph、settings）。

翻译文件位于 [`frontend/src/i18n/`](frontend/src/i18n/)，采用标准 i18next JSON 格式。新增语言的步骤：

1. 新建 `frontend/src/i18n/<code>.json`（以 `en.json` 作为起点）
2. 在 [`frontend/src/i18n/index.ts`](frontend/src/i18n/index.ts) 的 `SUPPORTED_LANGUAGES` 和 `resources` 中注册
3. 在 [`Layout.tsx`](frontend/src/components/Layout.tsx) 的语言下拉菜单中添加一项

---

## 项目结构

```
Personal-Assistant/
├── src/                          # 核心（Clean Architecture）
│   ├── adapters/                 # 7 个适配器：LLM/Config/Memory/Storage/Shell/Tools/ToolsRegistry
│   ├── core/                     # Pipeline + EventBus
│   ├── stages/                   # 6 个阶段：init/understand/plan/execute/validate/reflect
│   ├── ports/                    # 5 个接口契约（Clean Architecture）
│   ├── domain/                   # personality / memory / trust / tool / emotion
│   ├── infrastructure/           # Circuit Breaker（opossum）
│   ├── cli/                      # CLI 入口（chat/agent/config）
│   └── __tests__/                # 707 个测试（40 个文件）
├── server/                       # Express 后端
│   ├── index.ts                  # 入口
│   ├── app.ts                    # 8 个 API 路由 + 静态托管 frontend/dist
│   ├── providers.ts              # 10 个 provider 元数据
│   ├── session-store.ts          # 对话 session 持久化
│   ├── tools-setup.ts            # 7 个工具注册
│   └── routes/                   # 8 个 REST/SSE 路由
├── frontend/                     # React 18 + TypeScript + Vite + Tailwind
│   ├── src/
│   │   ├── api/                  # fetch 客户端 + sseStream()
│   │   ├── stores/               # zustand：theme / config / locale
│   │   ├── i18n/                 # EN/中 翻译
│   │   ├── pages/                # 8 个页面
│   │   ├── components/           # Layout + 8 个 UI 组件
│   │   ├── types/                # TypeScript 类型
│   │   └── styles/               # Tailwind + CSS 变量
│   └── dist/                     # 构建产物（由 /server 托管）
├── .github/
│   ├── workflows/ci-cd.yml       # CI/CD（Node 20/22、前端构建）
│   ├── ISSUE_TEMPLATE/           # bug / feature / docs / new_provider
│   ├── PULL_REQUEST_TEMPLATE.md  # PR 模板
│   ├── CODEOWNERS                # 代码评审负责人
│   ├── dependabot.yml            # 每周依赖更新 PR
│   └── FUNDING.yml               # 赞助链接
├── sdk/                          # 独立 npm 包 (@personal-assistant/sdk)
├── examples/                     # 7 个可运行示例脚本
├── docs/                         # ARCHITECTURE / SETUP / TROUBLESHOOTING / DEPLOYMENT / API
├── README.md                     # 英文版
├── README_zh.md                  # 中文版（本文件）
├── CHANGELOG.md                  # Keep-a-Changelog 格式
├── CONTRIBUTING.md               # 贡献指南
├── SECURITY.md                   # 安全策略
├── CODE_OF_CONDUCT.md            # 贡献者公约 2.1
├── LICENSE                       # MIT 许可证
├── .editorconfig                 # 跨编辑器配置
├── .prettierrc                   # Prettier 配置
├── .npmignore                    # npm 发布过滤
├── codecov.yml                   # Codecov 配置
├── typedoc.json                  # API 文档生成
└── package.json                  # 根 package
```

---

## 开发命令

```bash
npm install              # 安装后端依赖
npm run build            # 编译后端（tsc）
npm run server           # 启动 Express（tsx watch）
npm run web:dev          # Vite 前端开发模式（HMR，/api 代理 → :3000）
npm run web:build        # 前端生产构建 → frontend/dist
npm run test             # vitest run（40 个文件 / 707 个测试）
npm run test:coverage    # 覆盖率
npm run lint             # ESLint 9.x flat config
npm run format           # Prettier
```

---

## 排错

| 现象 | 原因 / 修复 |
| --- | --- |
| `No API key configured for provider "..."` | 1) 未设置 key；2) key 名称拼写错误（注意 `PERSONAL_ASSISTANT_<PROVIDER>` 大写） |
| `LLM request failed (openai): 401` | key 无效或过期，去厂商控制台重新生成 |
| `LLM request failed (openai): 429` | 触发限流，稍等几秒或换模型 |
| `fetch failed` | 沙箱网络受限 / 代理不通，可 `curl https://api.openai.com/v1/models` 验证 |
| `Anthropic request failed: 403` | 1) key 错误；2) IP 在 Anthropic 拒绝区域（国内常见） |
| `ollama/lmstudio` 不可达 | 本地服务未启动：`ollama serve` 或打开 LM Studio 的本地 server |
| 想改 base URL | 设置 `<PROVIDER>_BASE_URL` 环境变量 |

---

## 协议细节

- **OpenAI 兼容**（7 个 Provider）：`POST {base_url}/chat/completions`，`Authorization: Bearer <key>`
- **Anthropic**：`POST {base_url}/v1/messages`，`x-api-key: <key>` + `anthropic-version: 2023-06-01`
- **Google**：`POST {base_url}/models/{model}:generateContent?key=<key>`
- **百度**：`POST {base_url}/wenxinworkshop/chat/{model}?access_token=<key>`

所有请求都通过 `fetch` 直接打到厂商，无代理、无 mock、无假数据。

---

## 贡献

参见 [`CONTRIBUTING.md`](CONTRIBUTING.md) 了解开发流程。
使用 [issue](.github/ISSUE_TEMPLATE/) 和 [PR](.github/PULL_REQUEST_TEMPLATE.md) 模板。

参与即表示同意 [Code of Conduct](CODE_OF_CONDUCT.md)。
安全问题请按 [`SECURITY.md`](SECURITY.md) 走
[私有披露](https://github.com/badhope/Personal-Assistant/security/advisories/new)，不要发公开 issue。

## 协议

MIT —— 见 [LICENSE](LICENSE)。
