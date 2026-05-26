# Personal Assistant - 架构设计文档 v2.0

## 📋 概述

本文档定义了 Personal Assistant 项目的新架构，旨在解决现有架构中的问题：
- 模块职责不清
- 重复代码和文件
- 命名规范不一致
- 依赖关系混乱

## 🎯 设计原则

1. **领域驱动设计 (DDD)**：按业务领域组织代码
2. **单一职责原则 (SRP)**：每个模块只负责一件事
3. **依赖倒置原则 (DIP)**：高层模块不依赖低层模块
4. **开放/封闭原则 (OCP)**：对扩展开放，对修改封闭
5. **清晰的分层架构**：从 UI → Application → Domain → Infrastructure

## 📁 新目录结构

```
src/
├── core/                    # 核心基础设施
│   ├── errors/             # 错误处理系统
│   ├── types/              # 全局类型定义
│   ├── utils/              # 工具函数（已存在，需要清理）
│   └── di/                # 依赖注入容器
│
├── domain/                  # 领域层（核心业务逻辑）
│   ├── agent/             # Agent 领域
│   │   ├── models/        # 领域模型
│   │   ├── services/      # 领域服务
│   │   └── repositories/  # 仓储接口
│   ├── memory/            # 记忆领域
│   │   ├── models/
│   │   ├── services/
│   │   └── repositories/
│   └── analysis/          # 代码分析领域
│
├── application/             # 应用层（用例编排）
│   ├── commands/          # 命令处理（已存在，重构）
│   ├── services/          # 应用服务
│   └── orchestrators/     # 编排器
│
├── infrastructure/          # 基础设施层
│   ├── persistence/       # 持久化
│   ├── providers/         # LLM 提供者（已存在）
│   ├── git/              # Git 操作（已存在）
│   └── tools/            # 工具系统（已存在）
│
├── ui/                      # 用户界面层
│   ├── display/           # 显示组件
│   ├── handlers/          # 事件处理器
│   └── menu/             # 菜单系统
│
├── sdk/                     # SDK（独立包）
│   └── ...
│
└── cli.ts                  # 入口点
```

## 🔧 重构计划

### Phase 1: 基础设施重构
1. **更新依赖包**：升级 0.x 版本的包到稳定版本
2. **建立命名规范**：统一文件名和类型定义
3. **清理工具函数**：重构 `src/utils/`

### Phase 2: 领域层重构
1. **分离 agent 模块**：将 `src/agent/` 重构为领域层
2. **合并 editor 功能**：明确 `src/agent/editor.ts` 和 `src/editor/` 的职责
3. **统一 memory 系统**：整合 `knowledgeGraph` 和 `memoryGraph`

### Phase 3: 应用层重构
1. **重构 commands**：清理并统一命令结构
2. **建立服务层**：提供清晰的应用服务接口

### Phase 4: 文档和测试
1. **完善文档**
2. **添加集成测试**

## 📝 命名规范

### 文件命名
- **模块文件**：kebab-case（如 `user-profile.ts`）
- **测试文件**：`*.test.ts`（如 `user-profile.test.ts`）
- **类型文件**：`*.types.ts` 或单独的 `types/` 目录
- **索引文件**：`index.ts`（只做 re-export）

### 变量和函数命名
- **函数**：camelCase（如 `getUserProfile()`）
- **类**：PascalCase（如 `UserProfile`）
- **常量**：UPPER_SNAKE_CASE（如 `MAX_RETRY_COUNT`）
- **接口/类型**：PascalCase，不以 I 开头（如 `UserProfile`）

### 导出规范
- 优先使用 named export
- 只在必要时使用 default export（如 React 组件）
- `index.ts` 只做 re-export，不包含业务逻辑

## 🔄 依赖管理

### package.json 升级计划

需要升级的 0.x 包：
```
tree-sitter: ^0.25.0 → ^1.0.0 (等稳定版)
tree-sitter-javascript: ^0.25.0 → ^1.0.0
tree-sitter-python: ^0.25.0 → ^1.0.0
tree-sitter-typescript: ^0.23.2 → ^1.0.0
cli-table3: ^0.6.5 → ^1.0.0 (或寻找替代方案)
reflect-metadata: ^0.2.2 → ^0.2.2 (保持，社区标准)
```

### SDK 依赖关系
- SDK 应该是独立包，不依赖主项目
- 主项目可以依赖 SDK
- 使用 TypeScript project references 进行管理

## 🔐 安全规范

### 敏感信息处理
1. 所有 API keys 和 secrets 必须从环境变量读取
2. 测试中使用 mock keys，如 `test-api-key`
3. `.env` 文件必须在 `.gitignore` 中
4. 添加 `.env.example` 作为模板

### 错误处理
1. 统一错误类型系统
2. 错误消息不包含敏感信息
3. 使用结构化错误对象

## 🧪 测试策略

### 测试金字塔
- **单元测试**：覆盖领域逻辑（≥ 80%）
- **集成测试**：测试模块间交互
- **E2E 测试**：关键用户流程

### 测试文件位置
- 单元测试：与源文件同级，`*.test.ts`
- 集成测试：`src/__tests__/integration/`
- E2E 测试：`e2e/`

## 📊 迁移策略

### 渐进式迁移
1. 新建新架构目录结构
2. 逐步迁移代码到新位置
3. 使用别名保持兼容性
4. 最终清理旧目录

### 兼容性保证
- 使用 `package.json` 的 `exports` 字段
- 提供迁移指南
- 保持 API 稳定，直到下一个 major 版本
