# 任务 1.1：完善代码解析引擎 - 详细执行计划

## 📋 任务目标

基于 ts-morph 实现完整的 TypeScript 代码解析功能，替代被移除的 tree-sitter。

---

## 🔍 步骤 1：深入分析 ts-morph 能力

### 1.1 探索现有代码

查看项目中已有的 ts-morph 集成：
- `src/parser/ts-morph-project.ts` - 项目单例管理
- `src/parser/dependency-graph.ts` - 依赖图构建（已存在）
- `src/parser/importance-ranker.ts` - 符号重要性排序（已存在）

### 1.2 研究 ts-morph API

关键能力：
1. 类型系统访问
2. 符号提取
3. 引用查找
4. AST 遍历
5. 代码操作

---

## 🛠️ 步骤 2：扩展 parser/engine.ts

### 2.1 设计新的解析引擎接口

```typescript
export interface EnhancedParseResult {
  sourceFile: SourceFile;
  symbols: CodeSymbol[];
  imports: ImportInfo[];
  exports: ExportInfo[];
  types: TypeInfo[];
}
```

### 2.2 实现功能模块

| 模块 | 功能 |
|------|------|
| 符号提取器 | 提取类、函数、接口、类型、变量等 |
| 导入分析器 | 分析导入语句和依赖 |
| 导出分析器 | 分析导出的符号和类型 |
| 文档提取器 | 提取 JSDoc 注释 |
| 类型分析器 | 获取类型信息和继承关系 |

### 2.3 更新 parseFile 函数

增强现有函数，支持：
- 提取完整的符号信息
- 解析导入导出关系
- 获取类型信息
- 保持向后兼容

---

## 📝 步骤 3：实现符号提取功能

### 3.1 支持的符号类型

| 类型 | ts-morph 类 | 优先级 |
|------|-------------|--------|
| 类 | ClassDeclaration | 🔴 高 |
| 接口 | InterfaceDeclaration | 🔴 高 |
| 类型别名 | TypeAliasDeclaration | 🔴 高 |
| 函数 | FunctionDeclaration | 🔴 高 |
| 箭头函数 | ArrowFunction | 🟠 中 |
| 变量 | VariableDeclaration | 🟠 中 |
| 枚举 | EnumDeclaration | 🟠 中 |
| 命名空间 | NamespaceDeclaration | 🟡 低 |

### 3.2 每个符号提取的信息

```typescript
interface CodeSymbol {
  name: string;
  kind: SymbolKind;
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  signature?: string;
  documentation?: string;
  isExported: boolean;
  isDefaultExport: boolean;
  modifiers?: string[];
  parent?: string;
  children?: CodeSymbol[];
  typeInfo?: TypeInfo;
}
```

---

## 🔄 步骤 4：更新 parser/symbols.ts

### 4.1 更新类型定义

扩展现有 `SymbolKind`，支持所有 ts-morph 符号类型。

### 4.2 实现提取器类

创建 `TsMorphSymbolExtractor` 类，封装符号提取逻辑：

```typescript
class TsMorphSymbolExtractor {
  extractFromSourceFile(sourceFile: SourceFile): CodeSymbol[];
  extractClassSymbols(classDecl: ClassDeclaration): CodeSymbol;
  extractInterfaceSymbols(interfaceDecl: InterfaceDeclaration): CodeSymbol;
  extractFunctionSymbols(functionDecl: FunctionDeclaration): CodeSymbol;
  // ... 其他方法
}
```

### 4.3 保持向后兼容

确保 `extractSymbols` 函数接口不变，但底层实现更新为 ts-morph。

---

## ✅ 步骤 5：编写单元测试

### 5.1 创建测试文件

`src/__tests__/parser/ts-morph-engine.test.ts`

### 5.2 测试用例

1. 基本符号提取测试
2. 复杂类型解析测试
3. 导入导出分析测试
4. 文档提取测试
5. 边界情况测试

### 5.3 测试标准

- 单元测试覆盖 ≥ 80%
- 所有测试通过
- 性能测试在可接受范围内

---

## 📁 预期文件结构

```
src/parser/
├── engine.ts              (更新)
├── symbols.ts             (更新)
├── ts-morph-extractor.ts  (新增)
├── types-extractor.ts     (新增)
└── import-export-analyzer.ts (新增)

src/__tests__/parser/
└── ts-morph-engine.test.ts (新增)
```

---

## 🎯 验收标准

1. ✅ 能够正确解析 TypeScript 文件中的所有符号类型
2. ✅ 能够提取完整的符号信息（位置、签名、文档、类型）
3. ✅ 能够分析导入导出关系
4. ✅ 单元测试覆盖 ≥ 80%
5. ✅ 保持 API 向后兼容
6. ✅ 性能符合要求（单个文件 < 100ms）
