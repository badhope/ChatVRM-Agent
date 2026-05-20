# 工具库设计文档

## 概念

DevFlow Agent 的工具库是一个**可选的扩展系统**，用户可以根据需要下载和启用各种专业工具，而不是一股脑儿加载所有工具。

### 设计理念

```
传统方式（全部加载）：
┌────────────────────────────────────┐
│ Agent                              │
│  ├─ 100+ 工具（大多数用不到）      │
│  ├─ 臃肿                           │
│  └─ 加载慢                        │
└────────────────────────────────────┘

新方式（按需加载）：
┌────────────────────────────────────┐
│ Agent                              │
│  ├─ 核心工具（始终加载）           │
│  └─ 可选工具（用户选择加载）       │
│       ├─ devops-engineer          │
│       ├─ security-auditor          │
│       ├─ code-reviewer             │
│       └─ ...                       │
└────────────────────────────────────┘
```

---

## 工具库结构

```
DevFlow-Agent/
├── src/
│   ├── tools/
│   │   ├── registry.ts           # 核心工具注册表
│   │   └── loader.ts             # 工具加载器
│   └── ...
├── mcp/                            # 工具库源定义
│   ├── index.ts                    # 工具库索引
│   ├── devops/
│   │   ├── docker/index.ts
│   │   ├── kubernetes/index.ts
│   │   └── ...
│   ├── security/
│   │   ├── security-auditor/index.ts
│   │   └── ...
│   ├── code/
│   │   ├── code-generator/index.ts
│   │   ├── code-review/index.ts
│   │   └── ...
│   └── ...
└── tools/                          # 用户下载的工具（本地）
```

---

## 工具分类

### 1. 开发工具（Development）

| 工具 | 描述 | 依赖 |
|------|------|------|
| code-generator | 代码生成器 | - |
| code-review | 代码审查 | - |
| debugging-workflow | 调试工作流 | - |
| refactoring-workflow | 重构工作流 | - |
| testing-toolkit | 测试工具包 | jest/vitest |
| test-generator | 测试生成器 | - |

### 2. DevOps 工具

| 工具 | 描述 | 依赖 |
|------|------|------|
| docker | Docker 操作 | docker CLI |
| kubernetes | K8s 操作 | kubectl |
| aws | AWS 操作 | aws CLI |
| git | Git 操作 | git |
| ci-cd | CI/CD 工具 | - |

### 3. 安全工具

| 工具 | 描述 | 依赖 |
|------|------|------|
| security-auditor | 安全审计 | - |
| secrets | 密钥管理 | - |

### 4. 数据工具

| 工具 | 描述 | 依赖 |
|------|------|------|
| database | 数据库操作 | - |
| mongodb | MongoDB 操作 | - |
| redis | Redis 操作 | redis-cli |
| csv | CSV 处理 | - |
| json | JSON 处理 | - |

### 5. 平台集成

| 工具 | 描述 | 依赖 |
|------|------|------|
| github | GitHub API | gh CLI |
| gitlab | GitLab API | - |
| jira | Jira 集成 | - |
| vercel | Vercel 部署 | vercel CLI |

### 6. 实用工具

| 工具 | 描述 | 依赖 |
|------|------|------|
| web-search | 网络搜索 | - |
| web-crawler | 网页爬虫 | - |
| browser-automation | 浏览器自动化 | puppeteer |
| pdf | PDF 处理 | - |

---

## 工具定义格式

每个工具在 `mcp/<category>/<name>/index.ts` 中定义：

```typescript
export default {
  name: 'security-auditor',
  version: '1.0.0',
  description: '代码安全审计工具',
  category: 'security',
  author: 'DevFlow',
  tools: [
    {
      id: 'scan-vulnerabilities',
      name: '扫描漏洞',
      description: '扫描代码中的安全漏洞',
      parameters: [
        {
          name: 'path',
          type: 'string',
          required: true,
          description: '要扫描的代码路径'
        }
      ]
    },
    {
      id: 'check-dependencies',
      name: '检查依赖',
      description: '检查依赖的安全性',
      parameters: [
        {
          name: 'packageFile',
          type: 'string',
          required: true,
          description: 'package.json 路径'
        }
      ]
    }
  ],
  dependencies: [],
  load: async () => {
    // 工具加载逻辑
  }
};
```

---

## 工具库索引

`mcp/index.ts` 提供工具库索引：

```typescript
export interface ToolIndex {
  version: string;
  lastUpdated: string;
  tools: Record<string, ToolMetadata>;
}

export interface ToolMetadata {
  name: string;
  category: string;
  description: string;
  version: string;
  author: string;
  tools: string[];
  dependencies: string[];
  size: string;
}

export async function getToolIndex(): Promise<ToolIndex> {
  return {
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    tools: {
      'security-auditor': {
        name: 'security-auditor',
        category: 'security',
        description: '代码安全审计工具',
        version: '1.0.0',
        author: 'DevFlow',
        tools: ['scan-vulnerabilities', 'check-dependencies'],
        dependencies: [],
        size: '150KB'
      },
      // ... 更多工具
    }
  };
}

export async function getToolByCategory(category: string): Promise<ToolMetadata[]> {
  const index = await getToolIndex();
  return Object.values(index.tools).filter(t => t.category === category);
}

export async function getTool(toolName: string): Promise<ToolMetadata | null> {
  const index = await getToolIndex();
  return index.tools[toolName] || null;
}
```

---

## 用户命令接口

### 1. 查看可用工具

```bash
devflow tools available          # 列出所有可用工具
devflow tools available --category security  # 按分类查看
devflow tools search <keyword>   # 搜索工具
```

### 2. 管理已安装工具

```bash
devflow tools list              # 列出已安装的工具
devflow tools list --enabled    # 只显示已启用的
devflow tools list --disabled    # 只显示已禁用的
```

### 3. 安装工具

```bash
devflow tools install security-auditor    # 安装单个工具
devflow tools install security-auditor code-review  # 安装多个
devflow tools install --all                # 安装所有工具
devflow tools install --category security # 安装整个分类
```

### 4. 卸载工具

```bash
devflow tools uninstall security-auditor  # 卸载单个工具
devflow tools uninstall --all             # 卸载所有
```

### 5. 启用/禁用工具

```bash
devflow tools enable security-auditor    # 启用
devflow tools disable security-auditor   # 禁用
devflow tools disable --all              # 禁用所有
```

### 6. 工具信息

```bash
devflow tools info security-auditor     # 查看工具详情
devflow tools deps security-auditor      # 查看依赖
```

---

## 配置存储

用户配置保存在 `~/.devflow/tools-config.json`：

```json
{
  "version": "1.0.0",
  "installedTools": [
    "security-auditor",
    "code-review",
    "docker"
  ],
  "enabledTools": [
    "security-auditor",
    "code-review"
  ],
  "disabledTools": [
    "docker"
  ],
  "lastUpdate": "2024-01-15T10:30:00Z"
}
```

---

## 实现计划

### Phase 1: 基础设施

1. **创建工具加载器** (`src/tools/loader.ts`)
2. **创建工具库索引** (`mcp/index.ts`)
3. **创建配置管理** (`src/config/tools.ts`)

### Phase 2: 命令实现

4. **实现 `devflow tools available`**
5. **实现 `devflow tools install`**
6. **实现 `devflow tools uninstall`**
7. **实现 `devflow tools enable/disable`**

### Phase 3: 适配现有工具

8. **将现有 13 个核心工具迁移到新系统**
9. **适配 mcp/ 中的工具定义**

### Phase 4: 高级功能

10. **实现工具依赖解析**
11. **实现工具更新检查**
12. **实现工具版本管理**

---

## 技术实现

### 工具加载流程

```typescript
// 1. 读取配置
const config = await loadToolsConfig();

// 2. 确定要加载的工具
const toolsToLoad = config.enabledTools;

// 3. 加载工具定义
for (const toolName of toolsToLoad) {
  const toolPath = path.join(TOOLS_DIR, toolName);
  const toolModule = await import(toolPath);
  
  // 4. 注册工具
  toolRegistry.register(toolName, toolModule);
  
  // 5. 执行工具的 load 函数
  if (toolModule.load) {
    await toolModule.load();
  }
}
```

### 工具安装流程

```typescript
async function installTool(toolName: string): Promise<void> {
  // 1. 检查工具是否存在
  const toolMeta = await getTool(toolName);
  if (!toolMeta) {
    throw new Error(`Tool ${toolName} not found`);
  }
  
  // 2. 检查依赖
  for (const dep of toolMeta.dependencies) {
    if (!isDependencyInstalled(dep)) {
      console.warn(`Dependency ${dep} not installed`);
    }
  }
  
  // 3. 复制工具文件到本地
  const sourcePath = path.join(MCP_DIR, toolMeta.category, toolName);
  const destPath = path.join(TOOLS_DIR, toolName);
  
  await fs.cp(sourcePath, destPath, { recursive: true });
  
  // 4. 更新配置
  await addToConfig(toolName, 'installedTools');
}
```

---

## 总结

这个设计允许用户：

1. **按需安装**：只安装需要的工具
2. **灵活启用**：可以随时启用/禁用工具
3. **清晰分类**：按类别浏览和选择工具
4. **依赖管理**：自动检查工具依赖
5. **轻量核心**：核心系统保持精简

---

**下一步**：实现这个工具库系统。
