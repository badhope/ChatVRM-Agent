# Memory Module - 内存系统

## 概述

Personal Assistant 的内存系统由两个核心图谱组成，分别服务于不同的用途：

1. **Knowledge Graph (知识图谱)** - `knowledge-graph.ts`
   - 存储实体（人、项目、技术、概念）和它们之间的关系
   - 用于语义理解和上下文关联
   - 有向图，支持最短路径查询

2. **Memory Graph (记忆图谱)** - `memory-graph.ts`
   - 存储事实、经验、偏好等记忆节点
   - 用于上下文检索和用户个性化
   - 无向图，支持语义搜索

## 迁移指南

### 旧 API → 新 API

| 旧导入             | 新导入              |
| ------------------ | ------------------- |
| `./knowledgeGraph` | `./knowledge-graph` |
| `./memoryGraph`    | `./memory-graph`    |

### 代码示例

```typescript
// 知识图谱使用
import { knowledgeGraph } from './knowledge-graph.js';
await knowledgeGraph.init();
await knowledgeGraph.addEntity('person', '张三');

// 记忆图谱使用
import { memoryGraph } from './memory-graph.js';
await memoryGraph.init();
await memoryGraph.addNode('fact', '这是一个事实');
```
