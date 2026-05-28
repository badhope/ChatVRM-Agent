# 双 Agent 协作系统架构文档

## 📋 目录

- [概述](#概述)
- [系统架构](#系统架构)
- [核心组件](#核心组件)
- [通信协议](#通信协议)
- [任务分解策略](#任务分解策略)
- [集成方案](#集成方案)
- [使用指南](#使用指南)

---

## 概述

双 Agent 协作系统是一个智能任务执行框架，通过两个专门化的 Agent 协同工作：

1. **Planning Agent（规划 Agent）** - 负责任务分解和策略制定
2. **Execution Agent（执行 Agent）** - 负责具体操作执行和结果反馈

### 设计目标

- 🎯 **智能任务分解** - 自动将复杂任务分解为可管理的子任务
- 🔗 **无缝协作** - Agent 间通过标准化协议通信
- 🔄 **自动模式切换** - 根据任务复杂度智能选择单/双 Agent 模式
- 💪 **容错能力** - 双 Agent 失败时自动回退到单 Agent 模式

---

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                     User Input                          │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│              Task Complexity Assessment                 │
│         (assessTaskComplexity / shouldUseDualAgent)      │
└────────────────────────────┬────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
        Simple Task                    Complex Task
              │                             │
              ▼                             ▼
┌─────────────────────┐      ┌──────────────────────────────┐
│  Single Agent Mode  │      │   Dual Agent Collaboration    │
│  (AgentExecutor)    │      │   (CollaborationManager)      │
└─────────────────────┘      └──────────┬───────────────────┘
                                          │
                              ┌───────────┴───────────┐
                              ▼                       ▼
                    ┌───────────────┐     ┌────────────────┐
                    │ Planning Agent│     │ Execution Agent│
                    │  (decompose)  │     │  (executeTask) │
                    └───────┬───────┘     └────────┬───────┘
                            │                       │
                            └───────────┬───────────┘
                                        ▼
                           ┌───────────────────────┐
                           │   Collaboration Manager│
                           │   (orchestration)     │
                           └───────────┬───────────┘
                                       ▼
                           ┌───────────────────────┐
                           │   Final Result        │
                           └───────────────────────┘
```

---

## 核心组件

### 1. Planning Agent（规划 Agent）

**文件**：`src/agent/infrastructure/common/planning-agent.ts`

**职责**：
- 根据任务类型进行智能任务分解
- 为每个子任务分配优先级和依赖关系
- 制定执行策略

**核心方法**：
```typescript
// 主入口 - 任务分解
async decomposeTask(
  userInput: string,
  intent: string,
  maxDepth: number,
  maxSubtasks: number
): Promise<SubTask[]>

// 不同任务类型的专用分解器
private decomposeBugFixTask(): DecompositionSubTask[]
private decomposeDevelopmentTask(): DecompositionSubTask[]
private decomposeDocumentationTask(): DecompositionSubTask[]
private decomposeReviewTask(): DecompositionSubTask[]
private decomposeSearchTask(): DecompositionSubTask[]
private decomposeDevopsTask(): DecompositionSubTask[]
private decomposeTestingTask(): DecompositionSubTask[]
private decomposeRefactorTask(): DecompositionSubTask[]
private decomposeSecurityTask(): DecompositionSubTask[]
private decomposeDatabaseTask(): DecompositionSubTask[]
private decomposeGeneralTask(): DecompositionSubTask[]
```

### 2. Execution Agent（执行 Agent）

**文件**：`src/agent/infrastructure/common/execution-agent.ts`

**职责**：
- 执行单个子任务
- 调用相应的工具（write_file, shell 等）
- 返回执行结果和错误信息

**核心方法**：
```typescript
// 执行子任务
private async executeSubTask(
  subtask: SubTask,
  context?: Record<string, unknown>
): Promise<ToolResult>
```

### 3. Collaboration Manager（协作管理器）

**文件**：`src/agent/infrastructure/common/collaboration-manager.ts`

**职责**：
- 协调整个工作流
- 管理任务状态
- 处理 Agent 间通信
- 进度追踪和结果汇总

**核心方法**：
```typescript
// 主协作流程入口
async startCollaboration(
  userInput: string,
  intent: string,
  options?: {
    maxDepth?: number;
    maxSubtasks?: number;
    onStatusUpdate?: (
      taskId: string,
      status: string,
      progress?: number
    ) => void;
  }
): Promise<CollaborationResult>
```

### 4. Task Complexity Assessment（任务复杂度评估）

**文件**：`src/agent/infrastructure/common/task-complexity.ts`

**职责**：
- 分析任务描述的复杂度
- 识别任务类型关键词
- 决策使用单 Agent 还是双 Agent 模式

**核心方法**：
```typescript
// 评估任务复杂度
function assessTaskComplexity(userInput: string): ComplexityAssessment

// 判断是否应该使用双 Agent 模式
function shouldUseDualAgent(
  assessment: ComplexityAssessment,
  forceDualAgent?: boolean
): boolean
```

---

## 通信协议

**文件**：`src/agent/infrastructure/common/agent-protocol.ts`

### 核心数据结构

#### SubTask（子任务）
```typescript
interface SubTask {
  id: string;                    // 唯一标识符
  parentId?: string;            // 父任务 ID
  description: string;          // 任务描述
  tool?: string;                // 使用的工具名称
  args?: Record<string, unknown>; // 工具参数
  dependencies: string[];       // 依赖的子任务 ID 列表
  priority: number;             // 优先级（数字越小优先级越高）
  estimatedTimeMs?: number;     // 预估执行时间
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: string;              // 执行结果
  error?: string;               // 错误信息
}
```

#### Agent Message（Agent 消息）
```typescript
// 任务分解请求
interface TaskDecompositionRequest {
  type: 'task_decomposition_request';
  taskId: string;
  userInput: string;
  intent: string;
  maxDepth: number;
  maxSubtasks: number;
}

// 任务分解响应
interface TaskDecompositionResponse {
  type: 'task_decomposition_response';
  taskId: string;
  subtasks: SubTask[];
}

// 执行任务请求
interface ExecuteTaskRequest {
  type: 'execute_task_request';
  taskId: string;
  subtask: SubTask;
  context?: Record<string, unknown>;
}

// 执行任务响应
interface ExecuteTaskResponse {
  type: 'execute_task_response';
  taskId: string;
  subtaskId: string;
  result: ToolResult;
}

// 状态更新
interface TaskStatusUpdate {
  type: 'task_status_update';
  taskId: string;
  status: string;
  progress?: number;
}

// 任务完成
interface TaskCompleted {
  type: 'task_completed';
  taskId: string;
  summary: string;
  subtasks: SubTask[];
}

// 任务失败
interface TaskFailed {
  type: 'task_failed';
  taskId: string;
  error: string;
}

// 心跳
interface Heartbeat {
  type: 'heartbeat';
  timestamp: number;
}
```

#### 协作上下文
```typescript
interface CollaborationContext {
  taskId: string;
  userInput: string;
  intent: string;
  subtasks: SubTask[];
  completedSubtasks: SubTask[];
  failedSubtasks: SubTask[];
  sharedContext: Record<string, unknown>;
  startTime: number;
  status: 'planning' | 'executing' | 'completed' | 'failed';
}
```

#### 协作结果
```typescript
interface CollaborationResult {
  taskId: string;
  success: boolean;
  summary?: string;
  subtasks: SubTask[];
  error?: string;
  durationMs: number;
}
```

---

## 任务分解策略

### 支持的任务类型

| 任务类型 | 关键词识别 | 子任务模式 |
|---------|----------|----------|
| **Bug 修复** | fix, bug, repair, error | 搜索 → 定位 → 分析 → 修复 → 验证 |
| **开发任务** | implement, develop, feature | 分析 → 设计 → 编码 → 测试 |
| **文档任务** | document, write, doc | 确认路径 → 收集信息 → 生成内容 → 写入 → 验证 |
| **代码审查** | review, audit, check | 读取 → 质量分析 → 安全检查 → 性能评估 → 生成报告 |
| **搜索任务** | search, find, locate | 分析 → 执行搜索 → 定位 → 分析结果 |
| **DevOps** | deploy, release, ci/cd | 环境检查 → 版本验证 → 执行部署 → 验证 |
| **测试任务** | test, testing, unit test | 分析 → 编写用例 → 执行 → 分析结果 |
| **重构任务** | refactor, improve, clean | 读取 → 识别坏味道 → 制定方案 → 执行 → 验证 |
| **安全任务** | security, vulnerability, audit | 读取 → 漏洞扫描 → 风险分析 → 生成报告 |
| **数据库任务** | database, sql, migrate | 分析 → 编写脚本 → 执行 → 验证 |
| **通用任务** | 其他 | 分析 → 计划 → 执行 → 验证 |

### 复杂度评分标准

| 分数 | 等级 | 推荐模式 | 触发条件 |
|------|-----|---------|---------|
| 0-20 | Simple | 单 Agent | 简单查询、简短对话 |
| 21-39 | Medium | 单 Agent | 中等复杂度任务 |
| 40+ | Complex | 双 Agent | 包含重构、架构、开发等关键词 |

---

## 集成方案

### 与 AgentExecutor 的集成

**修改文件**：`src/agent/core.ts`

**集成方式**：

```typescript
// 1. 在构造函数中评估任务复杂度
constructor(
  userInput: string,
  onStepChange?: (step: TaskStep) => void,
  onOutput?: (text: string) => void,
  options?: {
    rootDir?: string;
    enableRepoMap?: boolean;
    enableKnowledgeGraph?: boolean;
    enableChangeControl?: boolean;
    useDualAgent?: boolean;  // 新增：双 Agent 选项
  }
) {
  // ... 其他初始化代码 ...

  // 评估任务复杂度
  const assessment = assessTaskComplexity(userInput);
  this.useDualAgent = shouldUseDualAgent(assessment, options?.useDualAgent);
  
  // 初始化协作管理器
  this.collaborationManager = new CollaborationManager();
}

// 2. 在 run() 方法中实现模式切换
async run(): Promise<Task> {
  if (this.useDualAgent) {
    return this.runWithDualAgent();  // 双 Agent 模式
  }

  // 原有单 Agent 执行流程
  // ...
}

// 3. 双 Agent 执行方法
private async runWithDualAgent(): Promise<Task> {
  this.output(chalk.cyan('🤖 启用双 Agent 协作模式...'));

  try {
    const assessment = assessTaskComplexity(this.task.userInput);
    const intent = assessment.recommendedIntent || 'general';

    const result = await this.collaborationManager.startCollaboration(
      this.task.userInput,
      intent,
      {
        maxDepth: 3,
        maxSubtasks: 10,
        onStatusUpdate: (taskId, status, progress) => {
          this.output(chalk.gray(`  [${status}] ${progress !== undefined ? `${progress}%` : ''}`));
        },
      }
    );

    // 处理结果
    this.task.status = result.success ? 'completed' : 'failed';
    this.task.result = result.summary;
    return this.task;
  } catch (error) {
    // 双 Agent 失败时回退到单 Agent 模式
    this.output(chalk.yellow('双 Agent 模式失败，回退到单 Agent 模式...'));
    this.useDualAgent = false;
    return this.run(); // 重新执行单 Agent 流程
  }
}
```

### CLI 集成

**修改文件**：`src/commands/agent.ts`

**新增选项**：
- `--dual-agent` - 强制启用双 Agent 模式
- `--da` - `--dual-agent` 的简写形式

**使用方式**：
```bash
# 简单任务（自动单 Agent）
personal-assistant agent run "查看当前目录"

# 复杂任务（自动双 Agent）
personal-assistant agent run "重构整个项目的代码架构"

# 强制双 Agent 模式
personal-assistant agent run --dual-agent "实现用户认证功能"

# 简写形式
personal-assistant agent run --da "修复多个 bug"
```

---

## 使用指南

### 1. 快速开始

#### 基本使用（自动模式）

```typescript
import { AgentExecutor } from './agent';

const executor = new AgentExecutor(
  '修复登录页面的 bug',
  undefined,
  console.log
);

const result = await executor.run();
console.log('Result:', result);
```

#### 强制双 Agent 模式

```typescript
const executor = new AgentExecutor(
  '重构整个项目的代码架构',
  undefined,
  console.log,
  { useDualAgent: true }
);

const result = await executor.run();
```

### 2. 直接使用协作管理器

```typescript
import { CollaborationManager } from './agent';

const manager = new CollaborationManager();

const result = await manager.startCollaboration(
  '修复登录页面的 bug',
  'bug-hunter',
  {
    maxDepth: 3,
    maxSubtasks: 10,
    onStatusUpdate: (taskId, status, progress) => {
      console.log(`[${status}] Progress: ${progress}%`);
    },
  }
);

console.log('Success:', result.success);
console.log('Summary:', result.summary);
```

### 3. 任务复杂度评估

```typescript
import { assessTaskComplexity, shouldUseDualAgent } from './agent';

const assessment = assessTaskComplexity('重构代码架构');
console.log('Complexity:', assessment.level);
console.log('Score:', assessment.score);
console.log('Recommended intent:', assessment.recommendedIntent);

const useDual = shouldUseDualAgent(assessment);
console.log('Use dual agent:', useDual);
```

### 4. 直接使用规划 Agent

```typescript
import { PlanningAgent } from './agent';

const planner = new PlanningAgent();

const subtasks = await planner.decomposeTask(
  '实现用户登录功能',
  'fullstack',
  3,
  10
);

console.log('Subtasks:', subtasks);
```

---

## 📊 与现有系统的对比

| 特性 | 单 Agent 模式 | 双 Agent 模式 |
|------|-------------|-------------|
| **适用场景** | 简单、直接任务 | 复杂、多步骤任务 |
| **任务分解** | 内部隐式 | 显式、结构化 |
| **执行流程** | 单阶段 | 多阶段、协作 |
| **错误处理** | 单次重试 | 子任务级错误处理 |
| **资源开销** | 较低 | 较高 |
| **适用任务** | 查询、简单修改 | 重构、开发、复杂修复 |

---

## 🔧 故障排除

### 问题：双 Agent 模式总是失败

**解决方案**：
1. 检查网络连接（需要 LLM API）
2. 确认任务描述清晰明确
3. 尝试使用 `--da` 强制启用或单 Agent 模式

### 问题：任务分解不够准确

**解决方案**：
1. 调整任务描述，添加更多上下文
2. 使用更明确的关键词（如 "重构"、"开发"）
3. 强制使用特定意图类型

---

## 📚 相关文件

| 文件路径 | 说明 |
|---------|------|
| `src/agent/infrastructure/common/planning-agent.ts` | 规划 Agent 实现 |
| `src/agent/infrastructure/common/execution-agent.ts` | 执行 Agent 实现 |
| `src/agent/infrastructure/common/collaboration-manager.ts` | 协作管理器 |
| `src/agent/infrastructure/common/agent-protocol.ts` | 通信协议定义 |
| `src/agent/infrastructure/common/task-complexity.ts` | 任务复杂度评估 |
| `src/agent/core.ts` | AgentExecutor 核心（集成双 Agent） |
| `src/commands/agent.ts` | CLI 命令集成 |
| `src/agent/index.ts` | 模块导出 |
