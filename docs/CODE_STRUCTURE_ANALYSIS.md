# Agent 模块代码结构分析报告

## 执行日期
2026-05-25

---

## 1. 当前目录结构分析

### 现有文件分类

#### 领域相关模块（应该属于 domain 层）
- `types.ts` - 类型定义
- `decision-types.ts` - 决策类型
- `trust-types.ts` - 信任类型
- `personality.ts` - 人格系统
- `emotional-state.ts` - 情绪状态
- `experience-store.ts` - 经验存储
- `trust.ts` - 信任系统
- `task-planner.ts` - 任务规划

#### 基础设施相关（应该属于 infrastructure 层）
- `llm-caller.ts` - LLM 调用
- `context-manager.ts` - 上下文管理
- `context-builder.ts` - 上下文构建
- `circuit-breaker.ts` - 熔断器
- `error-handler.ts` - 错误处理
- `error-types.ts` - 错误类型

#### 应用服务相关（应该属于 application 层）
- `core.ts` - 核心逻辑
- `architect.ts` - 架构师
- `llm-code-editor.ts` - LLM 代码编辑器
- `dual-model.ts` - 双模型
- `intent-recognizer.ts` - 意图识别
- `reasoner.ts` - 推理器
- `decision-reflector.ts` - 决策反射
- `act-mode.ts` - 执行模式
- `plan-act.ts` - 规划-执行
- `plan-mode.ts` - 规划模式
- `autonomous-goals.ts` - 自主目标
- `change-control.ts` - 变更控制
- `backup.ts` - 备份
- `test-automation.ts` - 测试自动化
- `startup-suggestions.ts` - 启动建议

#### 已经部分模块化的
- `core/` - 核心组件（响应解析、状态机、工具执行）
- `change-control/` - 变更控制
- `trust/` - 信任检测
- `output-validator/` - 输出验证
- `services/` - 服务

---

## 2. 模块依赖关系分析

### 高耦合点识别
1. **core.ts** - 高度耦合的核心模块，依赖几乎所有其他模块
2. **dual-model.ts** - 依赖 architect 和 editor
3. **services/** - 工厂模式创建依赖
4. **context-builder.ts** - 依赖多个外部模块

### 依赖树（简化版）
```
core.ts
├── llm-caller.ts
├── context-builder.ts
├── context-manager.ts
├── trust-detector.ts
├── decision-reflector.ts
├── experience-store.ts
├── services/factory.ts
├── core/
│   ├── state-machine.ts
│   ├── tool-executor.ts
│   └── response-parser.ts
└── 多个其他模块
```

---

## 3. 测试覆盖分析

### 现有测试
| 测试文件 | 测试数量 | 覆盖范围 |
|---------|---------|---------|
| `core.test.ts` | 118 | 核心功能 |
| `output-validator.test.ts` | 137 | 输出验证 |
| `trust-detector.test.ts` | 107 | 信任检测 |
| `experience-store.test.ts` | 27 | 经验存储 |
| **总计** | **484** | **主要功能** |

### 测试空白区域
- 集成测试较少
- E2E 测试缺失
- 边缘情况覆盖不够

---

## 4. 重构风险评估

### 高风险区域
1. **core.ts** - 核心逻辑，重构影响大
2. **index.ts** - 导出接口，需保持兼容
3. **服务集成** - 模块之间耦合高

### 最小可行重构路径
1. **阶段 1** - 创建新目录结构，不改动现有代码
2. **阶段 2** - 逐步迁移代码到新结构
3. **阶段 3** - 保持兼容层，逐步废弃旧代码
4. **阶段 4** - 完成重构，删除旧代码

### 回滚方案
1. Git 分支策略 - 为每个阶段创建分支
2. 测试作为安全网 - 确保每个阶段都有完整测试
3. 向后兼容层 - 保持旧接口可用

---

## 5. 具体重构路径

### 优先级 1（安全的）
- 创建新目录结构
- 迁移类型定义
- 迁移基础设施代码

### 优先级 2（中等风险）
- 迁移领域逻辑
- 创建应用用例

### 优先级 3（高风险）
- 重构 core.ts
- 更新所有导入
- 清理旧代码

---

## 结论
重构是可行的，但需要循序渐进，保持向后兼容性，确保每个阶段都通过三次检查！
