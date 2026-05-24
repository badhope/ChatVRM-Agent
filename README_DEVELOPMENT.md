# Personal-Assistant 开发环境配置

> 基于 AI-Dev-Config 规范配置的智能开发助手环境

## 📋 项目信息

- **项目名称**: Personal-Assistant
- **GitHub**: https://github.com/badhope/Personal-Assistant
- **技术栈**: TypeScript, Node.js (>=18.0.0), React, VSCode Extension
- **项目描述**: 可靠、诚实、可控的 AI 开发助手 CLI 工具

## 🎯 开发目标

构建一个**可靠、诚实、可控**的 AI 开发助手 CLI 工具，完全模拟人类开发者的思维方式和工作流程。

### 三条铁律

1. **可靠性** — 每个 AI 建议必须可验证、可复现
2. **诚实性** — 明确区分 AI 推测和确认事实
3. **可控性** — 用户对所有操作保持完全控制

## 🔧 环境配置清单

### ✅ 已完成配置

#### 1. 身份定位
- [x] 按照 AI-Dev-Config 规范配置身份
- [x] 设定为 Senior Architect, Senior Software Engineer, AI Expert
- [x] 配置 15+ 年软件架构设计经验
- [x] 配置全栈开发和 AI/ML 专长

#### 2. 技能配置
- [x] AI Agent 开发技能 (`ai-agent-development`)
- [x] Agent 记忆系统 (`agent-memory-systems`)
- [x] Agent 工具构建 (`agent-tool-builder`)
- [x] Agent 编排器 (`agent-orchestrator`)
- [x] Agent 评估 (`agent-evaluation`)

#### 3. MCP 服务器配置
- [x] GitHub MCP Server
- [x] Filesystem MCP Server
- [x] Git MCP Server
- [x] SQLite MCP Server
- [x] Brave Search MCP Server

#### 4. 项目依赖
- [x] Node.js v24.15.0
- [x] npm 依赖安装中（使用 --legacy-peer-deps）
- [x] TypeScript 5.3.3
- [x] Vitest 测试框架

### 📁 配置文件位置

```
Personal-Assistant/
├── .personal-assistant/
│   ├── skills-config.json    # 技能配置清单
│   └── mcp-config.json       # MCP 服务器配置
├── .skills/                  # AI 技能文档
│   ├── ai-agent-development/
│   ├── agent-memory-systems/
│   ├── agent-tool-builder/
│   ├── agent-orchestrator/
│   └── agent-evaluation/
└── docs/                    # 开发文档
    ├── completeness-checklist.md
    ├── technical-roadmap.md
    └── tool-library-design.md
```

## 🚀 快速开始

### 1. 验证环境

```bash
# 检查 Node.js 版本
node --version
# 应该显示: v24.15.0

# 检查 npm 版本
npm --version

# 验证项目构建
npm run build
```

### 2. 安装依赖

```bash
npm install --legacy-peer-deps
```

### 3. 配置 AI 平台

```bash
# 配置 API Key
personal-assistant config provider set-key openai sk-your-key
personal-assistant config set-default openai

# 测试连接
personal-assistant config test openai
```

### 4. 启动开发

```bash
# 开发模式（热重载）
npm run dev

# 或者启动 CLI
npm start

# 运行测试
npm test

# 代码检查
npm run lint
```

## 🎓 学习资源

### AI Agent 开发

1. **ai-agent-development** - AI agent 开发工作流
   - 位置: `.skills/ai-agent-development/SKILL.md`
   - 内容: Agent 设计、单/多 Agent 实现、编排、工具集成

2. **agent-memory-systems** - Agent 记忆系统
   - 位置: `.skills/agent-memory-systems/SKILL.md`
   - 内容: 短期/长期记忆、知识图谱、RAG、检索策略

3. **agent-tool-builder** - Agent 工具构建
   - 位置: `.skills/agent-tool-builder/SKILL.md`
   - 内容: 工具设计、接口、安全性

### 相关资源

- [AI-Dev-Config](https://github.com/badhope/AI-Dev-Config) - AI 配置中心
- [AI-SKILL](https://github.com/badhope/AI-SKILL) - 技能库（500+ 技能）
- [Mcp-Market](https://github.com/badhope/Mcp-Market) - MCP 工具市场

## 📊 项目架构

### 核心模块

```
Personal-Assistant/src/
├── cli.ts                    # CLI 入口点
├── agent/                    # Agent 核心系统
│   ├── core.ts              # 主执行器
│   ├── personality.ts       # 人格系统（Big Five）
│   ├── emotional-state.ts   # 情绪状态
│   ├── trust.ts             # 信任评估
│   ├── experience-store.ts  # 经验学习
│   └── memory/              # 记忆管理
│       ├── manager.ts      # 记忆管理器
│       ├── knowledgeGraph.ts # 知识图谱
│       ├── rag.ts          # RAG 检索
│       └── consolidation.ts # 记忆整合
├── providers/               # AI 平台适配器（10个平台）
├── commands/                # CLI 命令
├── tools/                   # 工具系统
├── config/                  # 配置管理
└── services/                # 服务层
```

### AI 平台支持

| 平台 | 状态 | 配置命令 |
|------|------|---------|
| OpenAI | ✅ | `personal-assistant config provider set-key openai sk-xxx` |
| Anthropic Claude | ✅ | `personal-assistant config provider set-key anthropic sk-ant-xxx` |
| Google Gemini | ✅ | `personal-assistant config provider set-key google AIxxx` |
| DeepSeek | ✅ | `personal-assistant config provider set-key deepseek sk-xxx` |
| 硅基流动 | ✅ | `personal-assistant config provider set-key siliconflow sk-xxx` |
| 阿里云百炼 | ✅ | `personal-assistant config provider set-key aliyun sk-xxx` |
| 智谱AI | ✅ | `personal-assistant config provider set-key zhipu 32位十六进制` |
| 百度千帆 | ✅ | `personal-assistant config provider set-key baidu <appId>.<secretKey>` |
| Ollama | ✅ | `personal-assistant config provider set-key ollama` |
| LM Studio | ✅ | `personal-assistant config provider set-key lmstudio` |

## 🔒 安全特性

- 路径验证 - 所有文件操作都经过 validatePath 检查
- 命令白名单 - Shell 命令限制在白名单内
- 危险模式检测 - 自动识别并阻止危险命令
- 敏感信息过滤 - 日志自动脱敏 API Key 等敏感信息
- SSRF 防护 - HTTP 工具阻止访问私有 IP
- 并发锁保护 - AsyncLock 防止竞态条件
- 熔断器 - 自动隔离故障平台

## 📝 开发指南

### 添加新功能

1. **Agent 功能扩展**
   - 阅读 `agent-memory-systems` 了解记忆设计
   - 使用 `agent-tool-builder` 创建工具
   - 参考 `ai-agent-development` 实施流程

2. **AI 平台集成**
   - 在 `src/providers/` 创建新适配器
   - 继承基础 Provider 类
   - 实现 `chat()` 和 `embeddings()` 方法

3. **CLI 命令**
   - 在 `src/commands/` 添加新命令
   - 使用 Commander.js 注册命令
   - 添加到 `cli.ts` 的命令映射

### 测试

```bash
# 运行所有测试
npm test

# 监视模式
npm run test:watch

# UI 模式
npm run test:ui

# 覆盖率报告
npm run test:coverage
```

## 🛠️ 工具配置

### MCP 服务器

已配置以下 MCP 服务器：

1. **GitHub** - GitHub API 集成
   - 功能: 仓库操作、Issue、PR 等

2. **Filesystem** - 文件系统访问
   - 路径: `/workspace/Personal-Assistant`
   - 功能: 读取、写入、搜索文件

3. **Git** - Git 版本控制
   - 功能: 提交、分支、差异等

4. **SQLite** - 本地数据库
   - 路径: `.data/personal-assistant.db`
   - 功能: 持久化存储

5. **Brave Search** - 网络搜索
   - 功能: 实时网络搜索

## 📚 下一步

1. ✅ 身份定位 - 已按照 AI-Dev-Config 规范配置
2. ✅ 技能配置 - 已安装 AI Agent 相关技能
3. ✅ MCP 配置 - 已配置 MCP 服务器
4. 🔄 依赖安装 - 正在安装 npm 依赖
5. ⏳ 验证测试 - 待验证配置完整性

## 🤝 贡献指南

请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解如何为项目贡献代码。

## 📄 许可证

MIT License - 详见 [LICENSE](./LICENSE)
