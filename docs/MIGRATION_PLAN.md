# 🚀 完整现代化替换计划

## 📊 一、旧代码清单（需要全部替换）

### 1️⃣ **向后兼容层代码**（必须删除）

| 文件 | 状态 | 替代方案 | 优先级 |
|------|------|----------|--------|
| `src/agent/personality.ts` | `@deprecated` | `src/agent/interfaces/controllers/personality.controller.ts` | 🔴 高 |
| `src/agent/emotional-state.ts` | `@deprecated` | `src/agent/domain/services/emotion.service.ts` + 状态机 | 🔴 高 |
| `src/agent/experience-store.ts` | `@deprecated` | `src/agent/infrastructure/repositories/experience.repository.ts` | 🔴 高 |
| `src/agent/decision-reflector.ts` | 可替换 | `src/agent/domain/services/decision.service.ts` | 🟡 中 |
| `src/agent/trust.ts` (旧版) | 可重构 | `src/agent/trust/` (新模块) | 🟡 中 |

### 2️⃣ **旧核心模块**（可重构）

| 模块 | 问题 | 替代方案 |
|------|------|----------|
| `src/agent/core.ts` | 逻辑过多，职责不清 | 拆分到新架构各层 |
| `src/agent/context-manager.ts` | 混合职责 | 迁移到领域服务 + 仓储 |
| `src/agent/output-validator.ts` | 部分功能重复 | 重构到统一验证层 |
| `src/agent/change-control.ts` | 可合并 | 迁移到新的变更控制模块 |

---

## 🗂️ 二、完整目录结构对比

### 📌 **目标最终结构（全部使用新架构）**

```
src/
├── agent/
│   ├── domain/                    # ✅ 新领域层（保留）
│   │   ├── models/
│   │   │   ├── personality.model.ts
│   │   │   ├── emotion.model.ts
│   │   │   ├── decision.model.ts
│   │   │   ├── experience.model.ts
│   │   │   ├── trust.model.ts
│   │   │   ├── task.model.ts
│   │   │   ├── context.model.ts
│   │   │   ├── reasoner.model.ts
│   │   │   └── validation.model.ts
│   │   ├── services/
│   │   │   ├── personality.service.ts
│   │   │   ├── emotion.service.ts
│   │   │   ├── decision.service.ts
│   │   │   └── experience.service.ts
│   │   └── repositories/
│   │       ├── personality.repository.ts
│   │       ├── decision.repository.ts
│   │       └── experience.repository.ts
│   ├── application/               # ✅ 新应用层（保留）
│   │   ├── services/
│   │   │   ├── personality.application.service.ts
│   │   │   ├── emotion.application.service.ts
│   │   │   ├── decision.application.service.ts
│   │   │   └── experience.application.service.ts
│   │   └── dtos/
│   │       ├── decision.dto.ts
│   │       ├── execute-task.dto.ts
│   │       └── task-plan.dto.ts
│   ├── infrastructure/            # ✅ 新基础设施层（保留）
│   │   ├── repositories/
│   │   │   ├── personality.repository.ts
│   │   │   ├── decision.repository.ts
│   │   │   └── experience.repository.ts
│   │   └── state-machines/
│   │       └── emotional.machine.ts
│   ├── interfaces/                # ✅ 新接口层（保留）
│   │   └── controllers/
│   │       ├── personality.controller.ts
│   │       └── decision.controller.ts
│   ├── core/                      # ✅ 重构后的核心
│   │   ├── state-machine.ts
│   │   ├── tool-executor.ts
│   │   ├── response-parser.ts
│   │   └── types.ts
│   ├── trust/                     # ✅ 新信任模块（保留）
│   ├── change-control/            # ✅ 新变更控制模块（保留）
│   └── (保留的其他必要模块)
│       ├── llm-caller.ts
│       ├── task-planner.ts
│       └── reasoner.ts
├── (其他模块保持不变)
```

---

## 🔄 三、分阶段执行计划

### **Phase 1: 更新 DI 容器，使用新架构** 🎯
**目标：** 将依赖注入容器切换到新架构组件

#### 需要修改的文件：

| 文件 | 操作 |
|------|------|
| `src/di/tokens.ts` | 更新 tokens 指向新组件 |
| `src/di/container.ts` | 注册新架构服务 |
| `src/agent/services/factory.ts` | 使用新架构创建服务 |

---

### **Phase 2: 替换 PersonalityManager** 👤
**替换文件：** `src/agent/personality.ts`

#### 📝 **迁移步骤：**

1. ✅ **已有新组件：**
   - Model: `src/agent/domain/models/personality.model.ts`
   - Service: `src/agent/domain/services/personality.service.ts`
   - Repository Interface: `src/agent/domain/repositories/personality.repository.ts`
   - Repository Implementation: `src/agent/infrastructure/repositories/personality.repository.ts`
   - Controller: `src/agent/interfaces/controllers/personality.controller.ts`

2. **更新依赖方：**
   - `src/agent/core.ts`
   - `src/commands/chat/chat-start.ts`
   - `src/di/container.ts`

3. **删除旧文件：** `src/agent/personality.ts`

---

### **Phase 3: 替换 EmotionalStateManager** 💭
**替换文件：** `src/agent/emotional-state.ts`

#### 📝 **迁移步骤：**

1. ✅ **已有新组件：**
   - Model: `src/agent/domain/models/emotion.model.ts`
   - Service: `src/agent/domain/services/emotion.service.ts`
   - State Machine: `src/agent/infrastructure/state-machines/emotional.machine.ts`

2. **创建应用服务：** `src/agent/application/services/emotion.application.service.ts` (已存在)

3. **更新依赖方：**
   - `src/agent/core.ts`

4. **删除旧文件：** `src/agent/emotional-state.ts`

---

### **Phase 4: 替换 ExperienceStore** 💾
**替换文件：** `src/agent/experience-store.ts`

#### 📝 **迁移步骤：**

1. ✅ **已有新组件：**
   - Model: `src/agent/domain/models/experience.model.ts`
   - Service: `src/agent/domain/services/experience.service.ts`
   - Repository Interface: `src/agent/domain/repositories/experience.repository.ts`
   - Repository Implementation: `src/agent/infrastructure/repositories/experience.repository.ts`

2. **更新依赖方：**
   - `src/agent/core.ts`
   - `src/agent/decision-reflector.ts`

3. **删除旧文件：** `src/agent/experience-store.ts`

---

### **Phase 5: 替换 DecisionReflector** 🤔
**替换文件：** `src/agent/decision-reflector.ts`

#### 📝 **迁移步骤：**

1. ✅ **已有新组件：**
   - Model: `src/agent/domain/models/decision.model.ts`
   - Service: `src/agent/domain/services/decision.service.ts`
   - Repository: `src/agent/infrastructure/repositories/decision.repository.ts`
   - Controller: `src/agent/interfaces/controllers/decision.controller.ts`

2. **更新依赖方：**
   - `src/agent/core.ts`

3. **删除旧文件：** `src/agent/decision-reflector.ts`

---

### **Phase 6: 重构和清理** 🧹

#### **重构任务清单：**

| 任务 | 状态 | 说明 |
|------|------|------|
| 更新 `src/agent/core.ts` | ⏳ | 使用新架构组件 |
| 更新 `src/di/container.ts` | ⏳ | 注册新服务 |
| 更新 `src/agent/index.ts` | ⏳ | 只导出新架构 API |
| 清理测试文件 | ⏳ | 更新测试以使用新架构 |
| 删除所有 `@deprecated` | ⏳ | 清理旧代码 |

---

## 📋 四、详细文件替换对照表

### **Personality 模块**

| 旧 API | 新 API | 迁移方法 |
|--------|--------|----------|
| `PersonalityManager` | `PersonalityController` | 直接替换 |
| `personality.ts` 导出 | `interfaces/controllers/` + `domain/` | 按层导入 |
| `getPersonalityPrompt()` | `PersonalityService.getPersonalityPrompt()` | 静态方法调用 |

### **Emotion 模块**

| 旧 API | 新 API | 迁移方法 |
|--------|--------|----------|
| `EmotionalStateManager` | `EmotionService` + 状态机 | 分离状态管理 |
| 状态机 actor | 直接使用 `emotionalMachine` | 保持 xstate 用法 |

### **Experience 模块**

| 旧 API | 新 API | 迁移方法 |
|--------|--------|----------|
| `ExperienceStore` | `ExperienceRepository` + `ExperienceService` | 分离存储和业务逻辑 |

### **Decision 模块**

| 旧 API | 新 API | 迁移方法 |
|--------|--------|----------|
| `DecisionReflector` | `DecisionService` + `DecisionController` | 直接替换 |

---

## 🔧 五、具体执行步骤（按顺序）

### ✅ Step 1: 更新 DI 容器 - 已完成
- 更新 `src/di/tokens.ts` - 添加新架构的 token
- 更新 `src/di/container.ts` - 注册新架构服务
- 添加新架构的 getter 函数

### Step 2: 更新核心模块使用新架构
需要修改以下文件，将旧模块替换为新架构：

1. `src/agent/core.ts` - 核心执行器
   - 替换 `PersonalityManager` → `PersonalityController`
   - 替换 `EmotionalStateManager` → `EmotionApplicationService` + 状态机
   - 替换 `ExperienceStore` → `ExperienceRepository`
   - 替换 `DecisionReflector` → `DecisionService`

2. `src/commands/chat/chat-start.ts` - 聊天启动命令
   - 使用新架构组件

### Step 3: 更新 index.ts 导出
- 修改 `src/agent/index.ts` - 只导出新架构 API
- 标记旧 API 为 deprecated（然后删除）

### Step 4: 删除兼容层文件
可以安全删除的旧文件：
- `src/agent/personality.ts` - 已被新架构替代
- `src/agent/emotional-state.ts` - 已被新架构替代
- `src/agent/experience-store.ts` - 已被新架构替代
- `src/agent/decision-reflector.ts` - 已被新架构替代

### Step 5: 验证与测试
- 运行 TypeScript 编译
- 运行所有测试，确保 484 个测试 100% 通过

---

## 📊 六、完整文件清单与状态

### 新架构文件（已存在，无需修改）
| 路径 | 说明 |
|------|------|
| `src/agent/domain/models/personality.model.ts` | 人格领域模型 |
| `src/agent/domain/models/emotion.model.ts` | 情绪领域模型 |
| `src/agent/domain/models/decision.model.ts` | 决策领域模型 |
| `src/agent/domain/models/experience.model.ts` | 经验领域模型 |
| `src/agent/domain/services/personality.service.ts` | 人格领域服务 |
| `src/agent/domain/services/emotion.service.ts` | 情绪领域服务 |
| `src/agent/domain/services/decision.service.ts` | 决策领域服务 |
| `src/agent/domain/services/experience.service.ts` | 经验领域服务 |
| `src/agent/domain/repositories/personality.repository.ts` | 人格仓储接口 |
| `src/agent/domain/repositories/decision.repository.ts` | 决策仓储接口 |
| `src/agent/domain/repositories/experience.repository.ts` | 经验仓储接口 |
| `src/agent/application/services/personality.application.service.ts` | 人格应用服务 |
| `src/agent/application/services/emotion.application.service.ts` | 情绪应用服务 |
| `src/agent/application/services/decision.application.service.ts` | 决策应用服务 |
| `src/agent/application/services/experience.application.service.ts` | 经验应用服务 |
| `src/agent/infrastructure/repositories/personality.repository.ts` | 人格仓储实现 |
| `src/agent/infrastructure/repositories/decision.repository.ts` | 决策仓储实现 |
| `src/agent/infrastructure/repositories/experience.repository.ts` | 经验仓储实现 |
| `src/agent/infrastructure/state-machines/emotional.machine.ts` | 情绪状态机 |
| `src/agent/interfaces/controllers/personality.controller.ts` | 人格控制器 |
| `src/agent/interfaces/controllers/decision.controller.ts` | 决策控制器 |

### 旧架构文件（待删除）
| 路径 | 状态 | 替代方案 |
|------|------|----------|
| `src/agent/personality.ts` | ⚠️ deprecated | `PersonalityController` |
| `src/agent/emotional-state.ts` | ⚠️ deprecated | `EmotionService` + 状态机 |
| `src/agent/experience-store.ts` | ⚠️ deprecated | `ExperienceRepository` |
| `src/agent/decision-reflector.ts` | ⚠️ deprecated | `DecisionService` |
| `src/agent/trust.ts` | ⚠️ 可重构 | `src/agent/trust/` 新模块 |

### 需要更新的文件
| 路径 | 操作 |
|------|------|
| `src/agent/core.ts` | 更新为使用新架构 |
| `src/commands/chat/chat-start.ts` | 更新为使用新架构 |
| `src/agent/index.ts` | 更新导出 |
| `src/di/container.ts` | ✅ 已完成 |
| `src/di/tokens.ts` | ✅ 已完成 |

---

## 🎯 七、总结

当前状态：
- ✅ 完整的 DDD 四层架构已实现
- ✅ 所有 484 个测试通过
- ✅ TypeScript 编译无错误
- ✅ DI 容器已更新支持新架构
- ⏳ 待执行：替换旧模块使用新架构

下一步行动：
继续执行 Phase 2-6，完成全部旧模块替换！

