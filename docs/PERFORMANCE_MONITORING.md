# 性能监控使用说明

## 概述

Personal Assistant 项目内置了一个性能监控系统，用于追踪和分析关键操作的执行时间和性能特征。

## 基本使用

### 1. 导入性能监控器

```typescript
import { performanceMonitor } from '../utils/index.js';
```

### 2. 测量异步函数

```typescript
// 异步测量异步函数
await performanceMonitor.measureAsync(
  'llm_request',
  'llm',
  async () => {
    return await callLLM(messages);
  },
  { model: 'gpt-4' }
);
```

### 3. 测量同步函数

```typescript
// 测量同步函数
const result = performanceMonitor.measureSync(
  'parse_code',
  'parser',
  () => {
    return parseCode(source);
  }
);
```

### 4. 手动开始和结束测量

```typescript
// 手动控制测量
const endMeasurement = performanceMonitor.startMeasurement('complex_operation', 'category');
try {
  // 执行操作
  doComplexOperation();
} finally {
  endMeasurement({ metadata: 'custom-data' });
}
```

### 5. 生成和打印报告

```typescript
// 生成报告
const report = performanceMonitor.generateReport();

// 打印报告到控制台
performanceMonitor.printReport();
```

### 6. 启用/禁用监控

```typescript
performanceMonitor.setEnabled(false); // 禁用
performanceMonitor.setEnabled(true);  // 启用
```

## 报告内容

性能报告包含以下信息：

- **Total Metrics**: 总测量次数
- **Average Duration**: 平均执行时间
- **Metrics by Category**: 按类别统计的指标
- **Slowest Metrics**: 最慢的 10 个指标
- **Recent Metrics**: 最近的 10 个指标

## 建议的监控点

建议在以下地方添加性能监控：

1. **LLM 调用**
2. **文件操作**
3. **知识图谱查询**
4. **记忆检索**
5. **代码解析**
6. **Agent 决策**

## 性能阈值建议

- 超过 1000ms：慢速（需要优化）
- 100-1000ms：正常
- < 100ms：快速
