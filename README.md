# Personal-Assistant

**Personal-Assistant** — A powerful personal AI assistant CLI tool.

## 🌟 Key Features

### AI Capabilities
- **10+ AI Platforms** — OpenAI, Anthropic, Google, DeepSeek, SiliconFlow, Alibaba Bailian, Zhipu AI, Baidu Qianfan, Ollama, LM Studio
- **Smart Model Search** — Automatically search and match models from platform APIs
- **Auto-fallback** — Automatically try next model when one fails
- **Streaming Responses** — Real-time AI output display
- **Circuit Breaker** — Built-in circuit breaker for automatic platform isolation

### Chat Features
- **Conversation Management** — Complete conversation history management
- **Local Storage** — Data persistence to local disk
- **Multi-turn Dialogue** — Support for context-aware conversations

### Development Tools
- **Built-in Tools** — Shell, file operations, HTTP, JSON, text processing, etc.
- **Memory System** — Context memory, knowledge graph, RAG retrieval

### Trust & Safety
- **Trust Assessment** — Auto-execute / require confirmation
- **Risk Detection** — Automatic detection of destructive operations and sensitive information

### 🎯 Architecture Features
- **Domain-Driven Design (DDD)** — Clean architecture with four layers
- **Type-Safe** — Full TypeScript with strict type checking
- **Test Coverage** — 484+ comprehensive tests passing
- **Clean Code** — Prettier, ESLint, and Git hooks

## 📦 Installation

### From GitHub

```bash
# Clone repository
git clone https://github.com/badhope/Personal-Assistant.git
cd Personal-Assistant

# Install dependencies
npm install

# Global link (optional)
npm link
```

Requirement: Node.js >= 18.0.0 < 23.0.0

## 🚀 Quick Start

```bash
# 1. Configure API Key
personal-assistant config provider set-key aliyun sk-xxxxx
personal-assistant config set-default aliyun

# 2. Start chatting
personal-assistant chat ask "Hello, introduce yourself"

# 3. Interactive multi-turn dialogue
personal-assistant chat start
```

## ⚙️ Command Reference

### Chat Commands
```bash
personal-assistant chat start           # Interactive multi-turn dialogue
personal-assistant chat ask <question>       # Single round quick question
personal-assistant chat models -p aliyun    # List platform models
```

### Configuration Commands
```bash
personal-assistant config init            # Interactive configuration wizard
personal-assistant config list            # View all configuration
personal-assistant config provider set-key <platform> <API Key>
personal-assistant config set-default <platform>
personal-assistant config test <platform>   # Test platform connection
```

### Tools Commands
```bash
personal-assistant tools list          # List all tools
```

### Development Commands
```bash
npm run build              # Build project
npm run dev               # Watch mode development
npm run test              # Run all tests
npm run lint              # Run ESLint
npm run format            # Run Prettier
npm run test:coverage     # Test with coverage report
```

## 🏗️ Project Structure

```
Personal-Assistant/
├── src/                    # Source code
│   ├── cli.ts             # CLI entry point
│   ├── commands/           # CLI commands
│   ├── providers/         # AI platform adapters
│   ├── agent/            # Agent system (DDD architecture)
│   │   ├── domain/       # Domain layer (business logic)
│   │   │   ├── models/   # Domain models
│   │   │   ├── services/ # Domain services
│   │   │   └── repositories/ # Repository interfaces
│   │   ├── application/  # Application layer (use cases)
│   │   │   ├── services/ # Application services
│   │   │   └── dtos/     # Data Transfer Objects
│   │   ├── infrastructure/ # Infrastructure layer
│   │   │   ├── repositories/ # Repository implementations
│   │   │   └── state-machines/ # State machines
│   │   └── interfaces/   # Interface layer (controllers)
│   ├── memory/          # Memory system
│   ├── tools/            # Tools system
│   ├── config/           # Configuration management
│   └── utils/            # Utility functions
├── dist/                   # Compiled output
├── docs/                   # Documentation
├── plugins/               # Plugins
├── sdk/                   # SDK
└── vscode/               # VSCode extension
```

## 🧪 Testing

```bash
npm run test          # Run all tests
npm run test:unit     # Run only unit tests
npm run test:integration # Run integration tests
npm run test:watch    # Watch mode for development
npm run test:coverage # Test with coverage report
npm run test:ui       # Vitest UI for interactive testing
```

## 📁 Architecture Documentation

Complete architecture documentation is available in the [docs/](docs/) directory:

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — Detailed architecture overview
- [FINAL_ARCHITECTURE_SUMMARY.md](docs/FINAL_ARCHITECTURE_SUMMARY.md) — Full migration summary
- [CODE_STRUCTURE_ANALYSIS.md](docs/CODE_STRUCTURE_ANALYSIS.md) — Code structure analysis
- [PERFORMANCE_MONITORING.md](docs/PERFORMANCE_MONITORING.md) — Performance monitoring setup

## 🔒 Supported AI Platforms

| Platform | Type | API Format |
|----------|------|------------|
| OpenAI | Cloud | OpenAI |
| Anthropic | Cloud | Anthropic |
| Google Gemini | Cloud | Google |
| DeepSeek | Cloud | OpenAI Compatible |
| SiliconFlow | Cloud | OpenAI Compatible |
| Alibaba Bailian | Cloud | OpenAI Compatible |
| Zhipu AI | Cloud | OpenAI Compatible |
| Baidu Qianfan | Cloud | Custom |
| Ollama | Local | Ollama |
| LM Studio | Local | OpenAI Compatible |

## 💻 Development

### Code Quality
- **Prettier** — Auto code formatting
- **ESLint** — Code linting with TypeScript support
- **Husky** — Git hooks for pre-commit checks
- **Lint-Staged** — Run linters on staged files

### Architecture Philosophy
- **Domain-Driven Design (DDD)**
- **Clean Architecture**
- **Dependency Inversion**
- **Testability First**

### Building from Source

```bash
# Clone
git clone https://github.com/badhope/Personal-Assistant.git
cd Personal-Assistant

# Install
npm install

# Build
npm run build

# Test
npm run test

# Development
npm run dev
```

## 📜 License

MIT License

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

**Personal-Assistant** — Your Smart Personal AI Assistant
