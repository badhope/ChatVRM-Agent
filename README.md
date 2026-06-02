# Personal-Assistant

Pipeline 驱动的个人 AI Agent。**CLI + Web 两种界面**，所有 LLM 调用直连真实厂商端点，**没有 mock / 假数据 / 兜底回退** — 你拿到 API key 就能直接用。

## 一句话接入

### CLI 模式

```bash
export SILICONFLOW_API_KEY=sk-你的真实key
npx tsx src/cli/index.ts agent "用一句话介绍你自己"
```

### Web 模式

```bash
# 一次性安装 + 构建
npm install && npm run build && npm run web:build

# 启动 Express 服务器 (默认 :3000, 同时托管后端 API + 前端静态文件)
npm run server
# → 浏览器打开 http://localhost:3000
```

如果你想要持久化 key：

```bash
node dist/cli/index.js config set-key siliconflow sk-你的真实key
node dist/cli/index.js config set-default siliconflow
node dist/cli/index.js chat
```

## 系统要求

- Node.js **>= 20.0.0 < 25.0.0**（22 LTS 推荐）
- TypeScript 5.8（仅源码运行需要）
- 网络可访问 LLM 厂商端点

## 安装

```bash
git clone https://github.com/badhope/Personal-Assistant.git
cd Personal-Assistant
npm install
npm run build
```

构建产物在 `dist/cli/index.js`，可以直接用 `node dist/cli/index.js ...` 调用。

## LLM 接入（10 个 Provider，全部真实 HTTP）

> **零 mock 兜底**：本项目不会在真实 API 失败时返回假数据。401 / 403 / 网络错误会原样抛出来 — 没有任何"模拟成功"的回退路径。

| Provider     | Type    | 默认 Base URL                          | 默认 Model              | 协议           | 是否需要 Key |
| ------------ | ------- | -------------------------------------- | ----------------------- | -------------- | ------------ |
| `openai`     | Cloud   | `https://api.openai.com/v1`            | `gpt-4o`                | OpenAI         | ✅            |
| `anthropic`  | Cloud   | `https://api.anthropic.com`            | `claude-3-5-sonnet-...` | Anthropic 私有 | ✅            |
| `google`     | Cloud   | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.0-flash` | Google 私有 | ✅            |
| `deepseek`   | Cloud   | `https://api.deepseek.com/v1`          | `deepseek-chat`         | OpenAI 兼容    | ✅            |
| `siliconflow` | Cloud  | `https://api.siliconflow.cn/v1`        | `Qwen/Qwen2.5-7B-Instruct` | OpenAI 兼容 | ✅            |
| `aliyun`     | Cloud   | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | OpenAI 兼容 | ✅            |
| `zhipu`      | Cloud   | `https://open.bigmodel.cn/api/paas/v4` | `glm-4`                 | OpenAI 兼容    | ✅            |
| `baidu`      | Cloud   | `https://aip.baidubce.com/rpc/2.0/ai_custom/v1` | `ernie-4.0-8k`     | 百度私有       | ✅            |
| `ollama`     | Local   | `http://localhost:11434/v1`            | `llama3.2`              | OpenAI 兼容    | ❌            |
| `lmstudio`   | Local   | `http://localhost:1234/v1`             | `local-model`           | OpenAI 兼容    | ❌            |

**默认 Provider：`siliconflow`**（国产、有免费额度、Qwen2.5 / DeepSeek / GLM 等开源模型直接可用）。

### 配置方式 1：CLI 持久化（conf 加密存储）

```bash
# 写入 key
node dist/cli/index.js config set-key <provider> <YOUR_API_KEY>

# 例如
node dist/cli/index.js config set-key openai sk-xxxxxxxx
node dist/cli/index.js config set-key anthropic sk-ant-xxxxxxxx
node dist/cli/index.js config set-key siliconflow sk-xxxxxxxx

# 切换默认 provider
node dist/cli/index.js config set-default openai

# 查看当前配置
node dist/cli/index.js config show

# 列出所有支持 provider
node dist/cli/index.js config providers
```

API key 存储在 conf 配置文件（默认 `~/.config/personal-assistant-nodejs/config.json`，文件权限 `0600`）。

### 配置方式 2：环境变量（优先级更高）

CLI 启动时按下列顺序回退查找 key：

1. conf 配置（`config set-key` 写入的）
2. `PERSONAL_ASSISTANT_<PROVIDER>`（如 `PERSONAL_ASSISTANT_OPENAI`）
3. `<PROVIDER>_API_KEY`（如 `OPENAI_API_KEY`）

```bash
# OpenAI
export OPENAI_API_KEY=sk-xxxxxxxx
node dist/cli/index.js chat -p openai

# Anthropic Claude
export ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
node dist/cli/index.js agent "写一个快排" -p anthropic

# Google Gemini
export GOOGLE_API_KEY=AIza-xxxxxxxx
node dist/cli/index.js chat -p google

# SiliconFlow（默认）
export SILICONFLOW_API_KEY=sk-xxxxxxxx
node dist/cli/index.js chat

# DeepSeek
export DEEPSEEK_API_KEY=sk-xxxxxxxx
node dist/cli/index.js chat -p deepseek

# Aliyun DashScope（Qwen）
export ALIYUN_API_KEY=sk-xxxxxxxx
node dist/cli/index.js chat -p aliyun

# Zhipu GLM
export ZHIPU_API_KEY=xxxxxxxx.xxxxxxxx
node dist/cli/index.js chat -p zhipu

# Baidu Ernie（access_token）
export BAIDU_API_KEY=xxxxxxxx
node dist/cli/index.js chat -p baidu
```

### 切换 Base URL（自建代理 / Azure OpenAI / 私有部署）

每个 provider 都支持 `<PROVIDER>_BASE_URL` 环境变量覆盖：

```bash
# Azure OpenAI 代理
export OPENAI_BASE_URL=https://your-resource.openai.azure.com/openai/deployments/your-deploy
export OPENAI_API_KEY=your-azure-key
node dist/cli/index.js chat -p openai -m your-deploy-name

# 第三方 OpenAI 兼容代理
export OPENAI_BASE_URL=https://api.your-proxy.com/v1
export OPENAI_API_KEY=sk-proxy
```

支持的覆盖变量：`OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL` / `GOOGLE_BASE_URL` / `DEEPSEEK_BASE_URL` / `SILICONFLOW_BASE_URL` / `ALIYUN_BASE_URL` / `ZHIPU_BASE_URL` / `BAIDU_BASE_URL` / `OLLAMA_BASE_URL` / `LMSTUDIO_BASE_URL`

### 本地 LLM（Ollama / LM Studio）

无需 key，直接调用：

```bash
# Ollama 先起服务
ollama serve &
ollama pull llama3.2

# 调用
node dist/cli/index.js chat -p ollama -m llama3.2

# LM Studio 同样
# 启动 LM Studio local server (port 1234) 后：
node dist/cli/index.js chat -p lmstudio
```

## 命令一览

```bash
# 交互式多轮对话（readline 真实终端交互）
node dist/cli/index.js chat [-p provider] [-m model]

# 单任务跑 6-stage Pipeline（Init → Understand → Plan → Execute → Validate → Reflect）
node dist/cli/index.js agent "<task>" [-p provider] [-m model]

# 配置管理
node dist/cli/index.js config show
node dist/cli/index.js config set-key <provider> [key]   # key 缺省时从 stdin 读
node dist/cli/index.js config remove-key <provider>
node dist/cli/index.js config set-default <provider>
node dist/cli/index.js config providers
```

## Pipeline 架构（6 个 Stage）

每次 `agent` 任务都会按顺序执行：

1. **initialize** — 初始化上下文（taskId、metadata、错误列表）
2. **understand** — LLM 识别意图（`chat` / `code` / `analyze` / `refactor` / `shell` / `search`）+ 扫描 workspace 文件
3. **plan** — LLM 生成执行计划（步骤列表 + 工具选择），LLM 失败时回退到模板计划
4. **execute** — 逐步调用工具（`writeFile` / `readFile` / `shell` / `search` / `remember` / `analyze` / `respond`）
5. **validate** — 校验执行结果（语法、退出码、文件存在性）
6. **reflect** — 反思阶段，更新情绪 + 写入长期记忆

## 内置工具（7 个真实工具）

注册在 `src/cli/index.ts:31-198`，全部对接真实能力：

| 工具          | 功能                            | 后端实现                          |
| ------------- | ------------------------------- | --------------------------------- |
| `writeFile`   | 写入文件                        | `StorageAdapter` 真实文件系统      |
| `readFile`    | 读取文件                        | `StorageAdapter` 真实文件系统      |
| `shell`       | 执行 shell 命令                  | `child_process` 真实进程            |
| `search`      | 搜索长期记忆                     | `MemoryAdapter.recall`（MiniSearch） |
| `remember`    | 写入长期记忆                     | `MemoryAdapter.remember`           |
| `analyze`     | 调用 LLM 分析文本                | `LLMAdapter.chat` 真实 LLM 端点     |
| `respond`     | 调用 LLM 生成对话回复            | `LLMAdapter.chat` 真实 LLM 端点     |

## 真实接口验证（已通过）

```bash
# 1. 无 key 启动 — 不应静默回退，应该直接报错
$ node dist/cli/index.js chat
✗ No API key configured for provider "siliconflow".
Run: personal-assistant config set-key siliconflow <YOUR_KEY>
Or set the env var: PERSONAL_ASSISTANT_SILICONFLOW / SILICONFLOW_API_KEY

# 2. 假 key — 真实 HTTP 调用拿到厂商的 401
$ SILICONFLOW_API_KEY=sk-fake-key node dist/cli/index.js agent "hi"
📍 execute
  Running step: Generate conversational response
  ✗ LLM request failed (siliconflow): 401 "Api key is invalid"
```

**没有 mock / 没有假装成功** — 每次 LLM 调用都是真实的 `fetch` 到厂商端点。

## 故障排查

| 现象                                            | 原因 / 解决                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------- |
| `No API key configured for provider "..."`      | 1) 没设 key；2) key 名称拼写错（注意 `PERSONAL_ASSISTANT_<PROVIDER>` 大写）  |
| `LLM request failed (openai): 401`              | key 无效或过期，去厂商控制台重新生成                                         |
| `LLM request failed (openai): 429`              | 触发速率限制，等几秒或换 model                                                |
| `fetch failed`                                   | 沙箱网络阻断 / 代理不通，`curl https://api.openai.com/v1/models` 自测        |
| `Anthropic request failed: 403`                 | 1) key 错；2) 你的 IP 在 Anthropic 拒绝区域（CN 常见）                       |
| `ollama/lmstudio` 连不上                        | 本地服务没起：`ollama serve` 或启动 LM Studio local server                    |
| 想换 base URL                                   | 配 `<PROVIDER>_BASE_URL` 环境变量                                            |

## 项目结构

```
Personal-Assistant/
├── src/
│   ├── cli/                  # CLI 入口（chat/agent/config 子命令 + 7 工具注册）
│   ├── adapters/             # 真实实现层
│   │   ├── llm.adapter.ts    # 10 provider 真实 HTTP 调用
│   │   ├── config.adapter.ts # conf 持久化 + 默认 siliconflow
│   │   ├── storage.adapter.ts
│   │   ├── memory.adapter.ts # MiniSearch 全文检索
│   │   ├── shell.adapter.ts  # child_process 真实 shell
│   │   └── tools.registry.ts # 7 个真实工具
│   ├── ports/                # 接口契约（Clean Architecture）
│   │   ├── llm.port.ts
│   │   ├── config.port.ts
│   │   ├── memory.port.ts
│   │   ├── storage.port.ts
│   │   └── shell.port.ts
│   ├── core/                 # Pipeline + EventBus
│   │   ├── pipeline.ts
│   │   ├── event-bus.ts
│   │   └── types.ts
│   ├── stages/               # 6 个 Pipeline Stage
│   ├── domain/               # 领域模型（personality/memory/trust/tool）
│   ├── infrastructure/       # Circuit Breaker (opossum)
│   └── __tests__/            # 707 个测试用例（40 文件）
├── server/                   # Express 服务器（14 个文件）
│   ├── index.ts              # 启动入口
│   ├── app.ts                # 8 个 API 路由 + 静态托管 frontend/dist
│   ├── providers.ts          # 10 个 provider 元信息
│   ├── session-store.ts      # chat session 持久化
│   ├── tools-setup.ts        # 7 个工具注册
│   └── routes/               # 8 个 REST/SSE 路由
└── frontend/                 # React 18 + TypeScript + Vite + Tailwind
    ├── src/
    │   ├── api/              # fetch client + sseStream()
    │   ├── stores/           # zustand: theme / config
    │   ├── pages/            # 9 个页面 (Dashboard/Chat/Agent/Tools/...)
    │   ├── components/       # 8 个 UI 组件 + Layout
    │   ├── types/            # TypeScript 类型
    │   └── styles/           # Tailwind + CSS variables
    ├── dist/                 # 构建产物（被 server/ 静态托管）
    └── vite.config.ts        # /api → :3000 代理
```

## Web 前端

启动 `npm run server` 后访问 `http://localhost:3000`，包含 9 个真实工作的页面：

| 路由 | 功能 | 后端 API |
| --- | --- | --- |
| `/dashboard` | 统计面板（chat 数量 / 记忆 / Agent 任务 / Provider） | `/api/dashboard` + `/api/config/snapshot` |
| `/chat` 与 `/chat/:id` | 真实 SSE 流式对话（7 种 model 切换） | `/api/chat/stream` (SSE) |
| `/agent` | 6 阶段 Pipeline 实时推送 | `/api/agent/run` (SSE) |
| `/tools` | 7 个工具 UI（writeFile / readFile / shell / search / remember / analyze / respond） | `/api/tools` + `/api/tools/execute` |
| `/memory` | 长期记忆浏览 / 搜索 / tag 过滤 / 删除 / 清空 | `/api/memory*` |
| `/config` | 10 个 LLM Provider 配置 + key 管理 + 测试 | `/api/config/*` |
| `/graph` | Canvas 2D 力导向知识图谱 | `/api/graph` |
| `/settings` | 4 种人格切换 + 情绪状态 + 主题切换 | `/api/personality` + `/api/emotion` |

**特性**：
- 响应式布局（手机 `grid-cols-1` / 平板 `md:grid` / 桌面 `lg:grid-cols-4`）
- 暗 / 亮主题（`zustand persist` 到 localStorage `pa-theme`）
- 真实 LLM 错误透传（无 mock 兜底）：假 key → 真实 401
- 真实工具执行：`writeFile` 真实落盘 / `shell` 真实 `child_process` / `remember` 真实 `MiniSearch`

## 开发命令

```bash
npm install              # 安装后端依赖
npm run build            # tsc 编译后端
npm run server           # 启动 Express (tsx watch 模式)
npm run web:dev          # Vite 前端开发 (HMR, /api 代理 :3000)
npm run web:build        # 前端生产构建 → frontend/dist
npm run test             # vitest run (40 文件 / 707 测试)
npm run lint             # ESLint 9.x flat config
npm run format           # Prettier
```

## 协议

- **OpenAI 兼容**（7 个 provider 走这条）：`POST {base_url}/chat/completions`，`Authorization: Bearer <key>`
- **Anthropic 私有**：`POST {base_url}/v1/messages`，`x-api-key: <key>` + `anthropic-version: 2023-06-01`
- **Google 私有**：`POST {base_url}/models/{model}:generateContent?key=<key>`
- **百度私有**：`POST {base_url}/wenxinworkshop/chat/{model}?access_token=<key>`

所有调用都通过 `fetch` 直接打到厂商，没有中间代理、没有 mock、没有假数据。

## License

MIT
