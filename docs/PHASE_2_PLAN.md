# Personal Assistant - Phase 2 深度优化计划

## 📋 执行概览
- **执行日期**: 2026-05-25
- **目标**: 完成 5 个核心改进任务
- **优先级**: 从高到低依次执行

---

## 🎯 任务 1: 重构 Agent 模块分层架构 🔴 高优先级

### 问题分析
当前 `src/agent/` 模块存在以下问题：
- 职责混乱，业务逻辑、基础设施、类型定义混在一起
- 缺乏清晰的分层架构
- 难以进行单元测试和维护
- 模块之间耦合度高

### 目标架构
```
src/agent/
├── domain/                      # 领域层（纯业务逻辑）
│   ├── models/                  # 领域模型
│   │   ├── task.ts
│   │   ├── step.ts
│   │   ├── trust-level.ts
│   │   └── personality.ts
│   ├── services/                # 领域服务
│   │   ├── task-planner.service.ts
│   │   ├── reasoning.service.ts
│   │   └── trust-evaluator.service.ts
│   ├── repositories/            # 仓储接口
│   │   ├── experience.repository.ts
│   │   └── knowledge.repository.ts
│   └── value-objects/           # 值对象
│       ├── task-id.ts
│       └── confidence-score.ts
├── application/                 # 应用层（用例编排）
│   ├── use-cases/               # 用例
│   │   ├── execute-task.use-case.ts
│   │   ├── plan-task.use-case.ts
│   │   └── reflect-on-task.use-case.ts
│   ├── orchestrators/           # 编排器
│   │   └── dual-model.orchestrator.ts
│   └── dtos/                    # 数据传输对象
│       ├── execute-task.dto.ts
│       └── plan-task.dto.ts
├── infrastructure/              # 基础设施层
│   ├── repositories/            # 仓储实现
│   │   ├── json-experience.repository.ts
│   │   └── graph-knowledge.repository.ts
│   ├── llm/                     # LLM 提供者
│   │   └── llm-caller.ts
│   └── storage/                 # 存储适配器
│       └── lowdb-adapter.ts
├── interfaces/                  # 接口层（用户交互）
│   ├── cli/                     # CLI 命令
│   └── display/                 # 显示组件
├── core/                        # 核心组件（状态机、工具执行等）
│   ├── state-machine.ts
│   ├── tool-executor.ts
│   └── response-parser.ts
└── index.ts                     # 统一导出
```

### 执行步骤
1. **创建新目录结构** - 按照架构图创建所有文件夹
2. **迁移领域模型** - 从现有代码中提取纯业务逻辑
3. **迁移核心组件** - 移动状态机、工具执行器等基础设施
4. **迁移应用层用例** - 重构 `core.ts` 的逻辑到用例
5. **保留向后兼容层** - 保持现有 `index.ts` 和主要接口不变
6. **更新测试** - 确保所有测试仍然通过
7. **重构完成** - 清理旧的代码结构

---

## 🎯 任务 2: 升级 0.x 版本的依赖包 🔴 高优先级

### 问题包清单
| 包名 | 当前版本 | 状态 | 方案 |
|------|---------|------|------|
| `cli-table3` | ^0.6.5 | 0.x | 寻找替代或接受现状 |
| `tree-sitter` | ^0.25.0 | 0.x | 评估升级或接受现状 |
| `tree-sitter-javascript` | ^0.25.0 | 0.x | 评估升级或接受现状 |
| `tree-sitter-python` | ^0.25.0 | 0.x | 评估升级或接受现状 |
| `tree-sitter-typescript` | ^0.23.2 | 0.x | 评估升级或接受现状 |
| `reflect-metadata` | ^0.2.2 | 0.x | 社区标准，保持 |

### 执行步骤
1. **评估每个 0.x 包的风险和替代方案**
2. **尝试升级到最新版本（如存在）**
3. **检查新版本的破坏性变更**
4. **更新代码适配新的 API**
5. **运行完整测试套件验证**
6. **对于无法升级的包，添加注释说明原因**

---

## 🎯 任务 3: 完善集成测试和 E2E 测试 🟡 中优先级

### 测试金字塔目标
```
        /\   E2E 测试 (5-10%)
       /--\  集成测试 (30-40%)
      /----\ 单元测试 (50-60%)
```

### 新增测试覆盖范围
1. **集成测试**:
   - Agent + Memory 模块集成
   - Agent + LLM Provider 集成（使用 Mock）
   - Dual Model 流程集成测试
   - Config + Memory + Agent 完整流程

2. **E2E 测试**:
   - 基本聊天流程
   - 代码修改和自动提交
   - 知识提取和查询
   - 配置管理

### 执行步骤
1. **创建集成测试目录结构**
2. **实现主要集成测试用例**
3. **创建 E2E 测试工具和 Mock**
4. **实现 E2E 测试脚本**
5. **在 package.json 添加测试脚本**

---

## 🎯 任务 4: 添加代码质量工具 🟡 中优先级

### 工具清单
| 工具 | 用途 | 配置内容 |
|------|------|---------|
| **ESLint** | 代码质量检查 | TypeScript 规则，推荐配置 |
| **Prettier** | 代码格式化 | 统一的格式化规则 |
| **Husky** | Git Hooks | 提交前的代码检查 |
| **lint-staged** | 暂存文件检查 | 只检查变更的文件 |

### 配置规范
1. **Prettier 配置**
   - Tab 宽度: 2
   - 分号: 是
   - 单引号: 是
   - 换行符: LF

2. **ESLint 配置**
   - 继承 `@typescript-eslint/recommended`
   - 规则严格程度适中
   - 自动修复功能

### 执行步骤
1. **安装所有依赖**
2. **创建配置文件**
3. **配置 package.json 脚本**
4. **配置 Git Hooks (Husky)**
5. **修复现有代码的违规问题**
6. **验证一切正常工作**

---

## 🎯 任务 5: 实施性能监控机制 🟢 低优先级

### 监控范围
- Agent 任务执行时间
- LLM 调用时间和次数
- 内存使用情况
- 知识图谱查询性能

### 实现方案
1. **性能指标收集器**
   - 自动记录关键操作的耗时
   - 分类统计（LLM、IO、计算等）

2. **性能日志输出**
   - 可选的详细性能报告
   - 可视化展示

3. **性能警报**
   - 检测异常慢的操作
   - 提供优化建议

### 执行步骤
1. **设计性能监控接口**
2. **实现指标收集器**
3. **集成到核心流程**
4. **添加配置开关**
5. **实现报告输出**

---

## 📊 验证标准

每个任务完成后必须满足：
1. ✅ 所有现有的 480 个单元测试通过
2. ✅ 完整的 TypeScript 编译无错误
3. ✅ 保持向后兼容性
4. ✅ 更新相关文档
5. ✅ 添加适当的注释

---

## ⏱️ 预估时间

| 任务 | 预估时间 |
|------|---------|
| 任务 1: 重构 Agent 分层架构 | 3-4 小时 |
| 任务 2: 升级 0.x 依赖 | 1-2 小时 |
| 任务 3: 完善集成测试 | 2-3 小时 |
| 任务 4: 添加代码质量工具 | 1-2 小时 |
| 任务 5: 性能监控 | 1-2 小时 |
| **总计** | **8-13 小时** |
