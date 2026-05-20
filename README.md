# DevFlow Agent

**DevFlow Agent** — 可靠、诚实、可控的 AI 开发助手 CLI 工具。

> 核心目标：完全模拟人类开发者的思维方式和工作流程

## 三条铁律

1. **可靠性** — 每个 AI 建议必须可验证、可复现
2. **诚实性** — 明确区分 AI 推测和确认事实
3. **可控性** — 用户对所有操作保持完全控制

## 核心特性

### AI 能力
- **10 个 AI 平台** — OpenAI、Anthropic、Google、DeepSeek、硅基流动、阿里云百炼、智谱AI、百度千帆、Ollama、LM Studio
- **智能模型查找** — 自动从平台 API 搜索匹配模型（支持 239+ 个阿里云模型）
- **自动切换** — 模型失败时自动尝试下一个（`--fallback`）
- **流式响应** — 实时显示 AI 输出
- **熔断保护** — 内置 Circuit Breaker，自动隔离故障平台

### 开发工具
- **13 个内置工具** — Shell、文件操作、HTTP、JSON、文本处理、哈希等
- **管道链式调用** — `tools pipe "shell() | text() | json()"` 组合工具
- **代码审查** — 规则引擎 + AI 深度审查（安全/Bug/性能/质量）

### 记忆系统
- **上下文记忆** — 自动关联相关历史对话
- **知识图谱** — 实体关系网络，支持路径查找
- **RAG 检索** — 向量检索相似内容
- **记忆整合** — 自动压缩和整理过期记忆
- **时间衰减** — 旧记忆自动降低权重

### 信任系统
- **2 级信任评估** — 自动执行 / 需要确认
- **危险模式检测** — 自动识别破坏性操作、敏感信息、不确定性表述
- **用户确认机制** — 高风险操作必须经用户确认后执行

### 人格模拟
- **Big Five 人格模型** — 开放性、尽责性、外向性、宜人性、神经质
- **情绪状态** — 8 种情绪状态，影响响应风格
- **学习循环** — 从经验中学习，改进行为
- **自主目标** — 主动检测项目健康状态并生成建议

### 云同步
- **多提供商支持** — Local、GitHub Gist、自定义 API
- **自动备份** — 定时备份配置和记忆
- **数据导出/导入** — `devflow data export/import`

## 安装

### 从 npm 安装（推荐）
```bash
npm install -g @devflow/agent
```

### 从 GitHub 源码安装
```bash
# 克隆仓库
git clone https://github.com/badhope/DevFlow-Agent.git
cd DevFlow-Agent

# 安装依赖（会自动编译）
npm install

# 全局链接（可选）
npm link
```

要求 Node.js >= 18.0.0

## 快速开始

```bash
# 1. 配置 API Key
devflow config provider set-key aliyun sk-xxxxx
devflow config set-default aliyun

# 2. 开始聊天
devflow chat ask "你好，介绍一下你自己"

# 3. 指定模型（支持模糊匹配）
devflow chat ask "写一个冒泡排序" -m qwen-max

# 4. 启用自动切换
devflow chat ask "你好" -m qwen-plus --fallback

# 5. 交互式多轮对话
devflow chat start
```

## 命令参考

### `devflow chat` — AI 对话
```bash
devflow chat start              # 交互式多轮对话
devflow chat ask <问题>         # 单轮快速提问
devflow chat ask <问题> -m <模型> --fallback  # 自动切换模型
devflow chat models -p aliyun   # 列出平台模型
```

### `devflow config` — 配置管理
```bash
devflow config init             # 交互式配置向导
devflow config list             # 查看所有配置
devflow config provider set-key <平台> <API Key>
devflow config provider detect-key <API Key>   # 根据 Key 自动检测平台
devflow config set-default <平台>
devflow config test <平台>      # 测试平台连接
```

### `devflow tools` — 工具调用
```bash
devflow tools list              # 列出所有工具
devflow tools shell "git status"  # 执行 Shell
devflow tools run read_file p=src/index.ts
devflow tools pipe "shell(cmd=dir) | text(action=sort)"
```

### `devflow data` — 数据管理
```bash
devflow data export -o backup.json    # 导出所有数据
devflow data import -i backup.json    # 导入数据
devflow data reset --confirm "DELETE ALL DATA"  # 重置数据
```

### `devflow review` — 代码审查
```bash
devflow review file <文件路径>           # 审查单个文件
devflow review dir <目录路径>            # 审查整个目录
devflow review file <文件> -c security   # 仅安全审查
```

## 项目结构

```
src/
├── cli.ts                    # CLI 入口
├── core.ts                   # Agent 核心执行器
├── commands/                 # CLI 命令
│   ├── ai.ts                # AI 平台管理
│   ├── chat.ts              # 聊天功能
│   ├── config.ts            # 配置管理
│   ├── data.ts              # 数据管理
│   ├── review.ts            # 代码审查
│   └── tools.ts             # 工具调用
├── providers/                # AI 平台适配器
│   ├── openai.ts
│   ├── anthropic.ts
│   ├── aliyun.ts
│   └── ...
├── agent/                    # Agent 系统
│   ├── core.ts              # 主执行器
│   ├── context-builder.ts   # 上下文构建
│   ├── experience-store.ts  # 经验学习
│   ├── personality.ts       # 人格系统
│   ├── emotional-state.ts   # 情绪状态
│   ├── autonomous-goals.ts  # 自主目标
│   ├── trust.ts             # 信任评估
│   ├── circuit-breaker.ts   # 熔断器
│   └── llm-caller.ts        # LLM 调用封装
├── memory/                   # 记忆系统
│   ├── manager.ts           # 记忆管理器
│   ├── knowledgeGraph.ts    # 知识图谱
│   ├── memoryGraph.ts       # 记忆图谱
│   ├── rag.ts               # RAG 检索
│   └── consolidation.ts     # 记忆整合
├── tools/                    # 工具系统
│   ├── registry.ts          # 工具注册表
│   ├── security.ts          # 安全检查
│   └── definitions/         # 工具定义
├── config/                   # 配置管理
│   ├── manager.ts
│   ├── schemas.ts           # Zod 验证
│   ├── defaults.ts          # 默认配置
│   └── validation.ts
├── services/                 # 服务层
│   ├── logger.ts            # 结构化日志
│   ├── compression-service.ts
│   └── chat-service.ts
├── di/                       # 依赖注入
│   ├── container.ts
│   └── tokens.ts
└── utils/                    # 工具函数
    ├── async-lock.ts        # 异步锁
    ├── errors.ts            # 错误类
    └── ...
```

## 安全特性

- **路径验证** — 所有文件操作都经过 `validatePath` 检查
- **命令白名单** — Shell 命令限制在白名单内
- **危险模式检测** — 自动识别并阻止危险命令
- **敏感信息过滤** — 日志自动脱敏 API Key 等敏感信息
- **SSRF 防护** — HTTP 工具阻止访问私有 IP 和元数据端点
- **并发锁保护** — 关键资源使用 AsyncLock 防止竞态条件
- **熔断器** — 自动隔离故障平台，防止级联失败

## 支持的 AI 平台

| 平台 | 类型 | API 格式 | Key 格式 | 模型搜索 |
|------|------|---------|---------|---------|
| OpenAI | 云端 | OpenAI | `sk-...` | 支持 |
| Anthropic | 云端 | Anthropic | `sk-ant-...` | 支持 |
| Google Gemini | 云端 | Google | `AI...` | 支持 |
| DeepSeek | 云端 | OpenAI 兼容 | `sk-...` | 支持 |
| 硅基流动 | 云端 | OpenAI 兼容 | `sk-...` | 支持 |
| 阿里云百炼 | 云端 | OpenAI 兼容 | `sk-...` | 支持 (239个模型) |
| 智谱AI | 云端 | OpenAI 兼容 | 32位十六进制 | 支持 |
| 百度千帆 | 云端 | 自定义 | `<appId>.<secretKey>` | 内置列表 |
| Ollama | 本地 | Ollama | 无需 | 支持 |
| LM Studio | 本地 | OpenAI 兼容 | 无需 | 支持 |

## 配置

### 熔断器配置

在 `.devflow/config.json` 中配置：

```json
{
  "circuitBreaker": {
    "failureThreshold": 5,
    "resetTimeout": 60000,
    "halfOpenMaxCalls": 3
  }
}
```

- `failureThreshold` — 触发熔断的连续失败次数（默认 5）
- `resetTimeout` — 熔断器重置超时时间，单位毫秒（默认 60000）
- `halfOpenMaxCalls` — 半开状态下允许的最大测试调用数（默认 3）

## 开发

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 构建
npm run build

# 测试
npm test

# 代码检查
npm run lint
```

## 子项目

- `/web` — React Web 界面
- `/sdk` — JavaScript SDK
- `/vscode` — VSCode 扩展

## License

MIT
