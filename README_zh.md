# DevFlow Agent

**DevFlow Agent** — 一个可靠、诚实、可控的AI开发助手CLI工具。

## 🌟 核心理念

### 三条铁律
1. **可靠性** — 每个AI建议都必须可验证和可复现
2. **诚实** — 清晰区分AI推测和确认事实
3. **可控性** — 用户完全控制所有操作

## 🚀 功能特性

- **意图识别引擎** — 基于规则和AI增强的双重识别机制
- **会话管理系统** — 使用WAL(Write-Ahead Logging)机制实现实时保存
- **信任管理器** — 问题检测、透明报告、用户确认机制
- **变更控制系统** — 风险评估、文件备份、用户批准流程
- **多平台AI集成** — 支持10+ AI平台

## 🛠️ 支持的AI平台

| 平台 | 类型 | 状态 |
|------|------|--------|
| OpenAI | 云端 | ✅ |
| Anthropic | 云端 | ✅ |
| Google Gemini | 云端 | ✅ |
| 硅基流动 | 云端 | ✅ |
| 阿里云百炼 | 云端 | ✅ |
| 智谱AI | 云端 | ✅ |
| 百度千帆 | 云端 | ✅ |
| DeepSeek | 云端 | ✅ |
| Ollama | 本地 | ✅ |
| LM Studio | 本地 | ✅ |

## 📦 安装

```bash
npm install -g @devflow/agent
```

## 🖥️ CLI命令

```bash
# 列出所有平台
devflow ai list

# 检查配置状态
devflow ai status

# 列出所有可用模型
devflow ai model list

# 获取模型推荐
devflow ai model suggest

# 获取模型详情
devflow ai model info <模型名称>
```

## ⚙️ 配置

### 环境变量

```bash
# OpenAI
export OPENAI_API_KEY=your-key

# Anthropic
export ANTHROPIC_API_KEY=your-key

# Google
export GOOGLE_API_KEY=your-key

# 阿里云
export DASHSCOPE_API_KEY=your-key

# 智谱AI
export ZHIPU_API_KEY=your-key

# 百度千帆
export QIANFAN_API_KEY=your-key
export QIANFAN_SECRET_KEY=your-key

# 硅基流动
export SILICONFLOW_API_KEY=your-key

# DeepSeek
export DEEPSEEK_API_KEY=your-key
```

## 📁 项目结构

```
DevFlow-Agent/
├── src/                    # CLI核心代码
│   ├── cli.ts              # CLI入口
│   ├── types.ts            # 类型定义
│   ├── base.ts             # Provider基类
│   └── commands/           # CLI命令
├── packages/               # 核心包
│   └── core/               # 核心工具
├── mcp/                    # MCP工具 (90+)
├── skills/                 # 技能实现
└── .agent-skills/          # Agent配置
```

## 📜 许可证

本项目仅供**个人使用**。未经授权，禁止商业使用。

详见 [LICENSE](LICENSE)。

## 🤝 贡献指南

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 📞 联系方式

商业咨询或授权事宜，请联系：contact@devflow.ai

---

**DevFlow Agent** — 构建AI驱动开发的信任