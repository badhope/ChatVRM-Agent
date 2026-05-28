# Personal-Assistant

**Personal-Assistant** — 功能强大的个人AI助手CLI工具。

## 🌟 核心功能

### AI平台支持
- **10+ AI平台** — OpenAI, Anthropic, Google, DeepSeek, SiliconFlow, 阿里云百炼, 智谱AI, 百度文心, Ollama, LM Studio
- **智能模型搜索** — 自动从平台API搜索匹配模型
- **自动降级** — 一个模型失败时自动尝试下一个
- **流式响应** — 实时AI输出显示
- **熔断器** — 内置熔断器自动隔离问题平台

### 对话功能
- **对话管理** — 完整的对话历史管理
- **本地存储** — 数据持久化到本地磁盘
- **多轮对话** — 支持上下文感知的对话

### 🤖 双Agent协作系统
- **智能任务分解** — LLM驱动的规划Agent自动分解复杂任务
- **智能执行决策** — 执行Agent智能选择工具调用策略
- **任务复杂度评估** — 自动判定任务难度，选择单/双Agent模式
- **协作管理器** — 协调Agent间通信和状态管理
- **优雅降级** — LLM失败时自动回退到规则模式

### 🧠 知识与记忆系统
- **知识图谱** — 智能知识提取、推理、关联分析
- **长期记忆** — 智能重要性评分、遗忘机制、关联网络
- **RAG检索** — 多种检索策略、质量评估、结果重排序
- **记忆摘要** — 自动生成对话摘要和关键点

### 🎭 人格与情绪系统
- **预设人格** — 友好导师、技术专家、创意天才、务实工作者
- **情绪响应** — 基于对话调整情绪状态
- **用户偏好学习** — 学习用户交互风格和偏好
- **人格兼容性分析** — 分析不同人格配合效果

### 🔒 信任与安全系统
- **信任等级** — 自动评估信任度，动态调整执行策略
- **风险检测** — 自动检测破坏性操作和敏感信息
- **审计日志** — 完整记录所有操作历史
- **安全确认** — 敏感操作需要用户确认

### 🛠️ 开发工具生态
- **内置工具** — Shell, 文件操作, HTTP, JSON, 文本处理等
- **高级工具** — 批量操作、Git智能、代码质量分析
- **安全工具** — 安全审计、文档生成、测试生成
- **性能监控** — 系统指标、操作统计、性能分析

### 📊 架构特性
- **领域驱动设计(DDD)** — 四层清晰架构
- **类型安全** — 完整TypeScript严格类型检查
- **测试覆盖** — 348+综合测试全部通过
- **代码规范** — Prettier, ESLint, Git Hooks

## 📦 安装

### 从GitHub安装

```bash
# 克隆仓库
git clone https://github.com/badhope/Personal-Assistant.git
cd Personal-Assistant

# 安装依赖
npm install

# 全局链接(可选)
npm link
```

**要求**: Node.js >= 18.0.0 < 23.0.0

## 🚀 快速开始

### 基础配置

```bash
# 1. 配置API密钥
personal-assistant config provider set-key aliyun sk-xxxxx
personal-assistant config set-default aliyun

# 2. 开始对话
personal-assistant chat ask "Hello, introduce yourself"

# 3. 交互式多轮对话
personal-assistant chat start
```

### 双Agent模式使用

```bash
# 强制启用双Agent协作模式
personal-assistant agent run "重构项目架构" --dual-agent

# 简写方式
personal-assistant agent run "分析代码库" --da

# 自动模式(根据任务复杂度智能选择)
personal-assistant agent run "修复简单bug"
```

### 高级工具示例

```bash
# 安全审计扫描
securityAudit({ path: './src', severity: 'medium' })

# 代码质量分析
codeQuality({ path: './src', language: 'typescript' })

# 智能Git提交
gitSmartCommit({ autoAdd: 'true' })

# 性能监控
systemMetrics()
```

## ⚙️ 命令参考

### 对话命令

```bash
personal-assistant chat start                    # 交互式多轮对话
personal-assistant chat ask <question>             # 单轮快速问答
personal-assistant chat models -p aliyun          # 列出平台模型
```

### Agent命令

```bash
personal-assistant agent run <task>              # 运行Agent任务
personal-assistant agent run <task> --dual-agent # 双Agent模式
personal-assistant agent run <task> --da        # 简写双Agent模式
```

### 配置命令

```bash
personal-assistant config init                   # 交互式配置向导
personal-assistant config list                   # 查看所有配置
personal-assistant config provider set-key <platform> <API Key>
personal-assistant config set-default <platform>
personal-assistant config test <platform>        # 测试平台连接
```

### 工具命令

```bash
personal-assistant tools list                    # 列出所有工具
```

### 开发命令

```bash
npm run build                      # 构建项目
npm run dev                       # 监听模式开发
npm run test                      # 运行所有测试
npm run lint                      # 运行ESLint
npm run format                    # 运行Prettier
npm run test:coverage             # 测试覆盖率报告
```

## 🏗️ 项目架构

```
Personal-Assistant/
├── src/                         # 源代码
│   ├── cli.ts                  # CLI入口
│   ├── commands/               # CLI命令
│   ├── providers/             # AI平台适配器
│   ├── agent/                # Agent系统(DDD架构)
│   │   ├── domain/           # 领域层(业务逻辑)
│   │   │   ├── models/       # 领域模型
│   │   │   ├── services/     # 领域服务
│   │   │   └── repositories/ # 仓库接口
│   │   ├── application/      # 应用层(用例)
│   │   │   ├── services/     # 应用服务
│   │   │   └── dtos/        # 数据传输对象
│   │   ├── infrastructure/  # 基础设施层
│   │   │   ├── repositories/ # 仓库实现
│   │   │   ├── common/      # 公共组件(双Agent、协议等)
│   │   │   └── state-machines/ # 状态机
│   │   └── interfaces/      # 接口层(控制器)
│   ├── memory/               # 记忆系统
│   ├── tools/                # 工具系统
│   ├── config/               # 配置管理
│   └── utils/                # 工具函数
├── dist/                        # 编译输出
├── docs/                        # 文档
├── sdk/                         # SDK
└── vscode/                     # VSCode扩展
```

## 📚 详细文档

完整架构和功能文档请查看 [docs/](docs/) 目录:

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — 详细架构概述
- [FINAL_ARCHITECTURE_SUMMARY.md](docs/FINAL_ARCHITECTURE_SUMMARY.md) — 完整迁移总结
- [CODE_STRUCTURE_ANALYSIS.md](docs/CODE_STRUCTURE_ANALYSIS.md) — 代码结构分析
- [DUAL_AGENT_SYSTEM.md](docs/DUAL_AGENT_SYSTEM.md) — 双Agent系统文档
- [PERFORMANCE_MONITORING.md](docs/PERFORMANCE_MONITORING.md) — 性能监控设置
- [PHASE_3_DETAILED_PLAN.md](docs/PHASE_3_DETAILED_PLAN.md) — 第三阶段计划
- [PHASE_4_DETAILED_PLAN.md](docs/PHASE_4_DETAILED_PLAN.md) — 第四阶段计划

## 🧪 测试

```bash
npm run test              # 运行所有测试
npm run test:unit         # 只运行单元测试
npm run test:integration  # 运行集成测试
npm run test:watch        # 监听模式开发
npm run test:coverage     # 测试覆盖率报告
npm run test:ui           # Vitest UI交互式测试
```

## 🔧 工具生态

### 基础工具

| 工具名 | 功能描述 |
|--------|----------|
| `readFile` | 读取文件内容 |
| `writeFile` | 写入文件内容 |
| `shell` | 执行Shell命令 |
| `http` | HTTP请求 |
| `json` | JSON处理 |

### 高级工具

| 工具名 | 功能描述 |
|--------|----------|
| `batchRead` | 批量读取多个文件 |
| `batchWrite` | 批量写入多个文件 |
| `copyMove` | 复制/移动文件或目录 |
| `gitSmartCommit` | AI驱动的智能Git提交 |
| `gitBranch` | Git分支管理 |
| `gitHistory` | Git历史分析 |
| `codeQuality` | 代码质量分析和坏味道检测 |
| `systemMetrics` | 系统性能指标 |
| `operationMetrics` | 操作性能统计 |
| `performanceProfile` | 性能分析报告 |
| `securityAudit` | 安全审计扫描 |
| `generateDocumentation` | 自动文档生成 |
| `generateTests` | 测试代码生成 |

## 🔒 支持的AI平台

| 平台 | 类型 | API格式 |
|-------|------|----------|
| OpenAI | 云服务 | OpenAI |
| Anthropic | 云服务 | Anthropic |
| Google Gemini | 云服务 | Google |
| DeepSeek | 云服务 | OpenAI兼容 |
| SiliconFlow | 云服务 | OpenAI兼容 |
| 阿里云百炼 | 云服务 | OpenAI兼容 |
| 智谱AI | 云服务 | OpenAI兼容 |
| 百度文心 | 云服务 | 自定义 |
| Ollama | 本地 | Ollama |
| LM Studio | 本地 | OpenAI兼容 |

## 💻 开发

### 代码质量
- **Prettier** — 自动代码格式化
- **ESLint** — TypeScript代码检查
- **Husky** — Git Hooks预提交检查
- **Lint-Staged** — 对暂存文件运行检查

### 架构理念
- **领域驱动设计(DDD)**
- **整洁架构**
- **依赖倒置**
- **测试优先**

### 从源码构建

```bash
# 克隆
git clone https://github.com/badhope/Personal-Assistant.git
cd Personal-Assistant

# 安装
npm install

# 构建
npm run build

# 测试
npm run test

# 开发
npm run dev
```

## 📜 许可证

MIT License

## 🤝 贡献

欢迎贡献！详细信息请查看 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

**Personal-Assistant** — 您的智能个人AI助手
