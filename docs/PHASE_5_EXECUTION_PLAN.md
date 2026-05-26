# Phase 5: 决策与经验系统完整迁移执行计划

## 目标
将 DecisionReflector 和 ExperienceStore 完整迁移到 DDD 架构，保持完全向后兼容性。

## 严格的任务分解

### 任务 1: 分析现有模块
**目标**: 理解现有 DecisionReflector 和 ExperienceStore 的完整实现

**步骤**:
1.1 阅读 decision-reflector.ts 完整代码（约 500 行）
1.2 阅读 experience-store.ts 完整代码（约 300 行）
1.3 识别所有依赖关系
1.4 确定纯业务逻辑和基础设施依赖

**输出**: 完整的依赖分析报告

---

### 任务 2: 实现决策仓储基础设施层
**目标**: 实现决策仓储的具体持久化逻辑

**步骤**:
2.1 创建 `infrastructure/repositories/decision.repository.ts`
   - 实现 `saveDecision()`
   - 实现 `getDecision()`
   - 实现 `getDecisionsByTask()`
   - 实现 `saveReflection()`
   - 实现 `getReflection()`
   - 实现 `getReflectionsByTask()`
   - 实现 `getStats()`
   - 实现 `loadAll()`
   - 实现 `saveAll()`

2.2 使用 JSON 文件持久化（与原实现一致）

**输出**: 完整的决策仓储实现

---

### 任务 3: 实现经验仓储基础设施层
**目标**: 实现经验仓储的具体持久化逻辑

**步骤**:
3.1 创建 `infrastructure/repositories/experience.repository.ts`
   - 实现 `addExperience()`
   - 实现 `getExperience()`
   - 实现 `getAllExperiences()`
   - 实现 `generateBehaviorGuidelines()`
   - 实现 `getExperienceCount()`
   - 实现 `loadAll()`
   - 实现 `saveAll()`

3.2 实现行为指导生成算法（基于历史经验）

**输出**: 完整的经验仓储实现

---

### 任务 4: 创建决策领域服务
**目标**: 提取纯业务逻辑，无基础设施依赖

**步骤**:
4.1 创建 `domain/services/decision.service.ts`
   - 实现 `analyzeDecisions()` - 分析决策结果
   - 实现 `calculateOverallRating()` - 计算总体评分
   - 实现 `generateImprovementReport()` - 生成改进报告
   - 实现 `identifyPatterns()` - 识别决策模式
   - 实现 `calculateStats()` - 计算统计信息

4.2 所有方法必须是无副作用的纯函数

**输出**: 纯业务逻辑服务

---

### 任务 5: 创建经验领域服务
**目标**: 提取纯业务逻辑，无基础设施依赖

**步骤**:
5.1 创建 `domain/services/experience.service.ts`
   - 实现 `extractPatterns()` - 从经验中提取模式
   - 实现 `inferTaskType()` - 推断任务类型
   - 实现 `calculateSuccessRate()` - 计算成功率
   - 实现 `generateGuidelines()` - 生成行为指导

5.2 所有方法必须是无副作用的纯函数

**输出**: 纯业务逻辑服务

---

### 任务 6: 更新兼容层
**目标**: 保持完全向后兼容

**步骤**:
6.1 更新 `decision-reflector.ts`
   - 导入新的领域服务和仓储
   - 保持所有原有方法签名
   - 委托给新实现

6.2 更新 `experience-store.ts`
   - 导入新的领域服务和仓储
   - 保持所有原有方法签名
   - 委托给新实现

6.3 更新 `index.ts` 导出

**输出**: 向后兼容的兼容层

---

### 任务 7: 验证和测试
**目标**: 确保所有功能正常工作

**步骤**:
7.1 TypeScript 编译检查
7.2 运行所有 484+ 个测试
7.3 验证向后兼容性
7.4 性能基准测试（如果需要）

**输出**: 完整的验证报告

---

## 验收标准

- [ ] 所有新文件必须符合 TypeScript 严格模式
- [ ] 所有新服务必须是无副作用的纯函数
- [ ] 所有原有 API 必须保持完全兼容
- [ ] 所有 484+ 个测试必须通过
- [ ] TypeScript 编译无错误
- [ ] 代码覆盖率不降低

## 时间估计

每个任务约需 1-2 小时，总计约 8-10 小时。

## 关键约束

1. **不能破坏现有功能** - 所有测试必须通过
2. **不能改变原有 API** - 向后兼容必须 100%
3. **必须提取纯业务逻辑** - 领域服务不能依赖基础设施
4. **必须使用依赖倒置** - 通过接口解耦
