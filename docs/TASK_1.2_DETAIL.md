# 任务 1.2: 实现 MCP 工具库 - 详细执行计划

## 📋 任务概述

实现完整的 MCP (Model Context Protocol) 工具库系统，包括：
- 创建 mcp/ 目录结构和工具定义规范
- 实现核心工具
- 构建工具注册和加载机制
- 完善工具安全检查和权限控制
- 更新 src/tools/library.ts 以加载 MCP 工具

**验收标准**:
- MCP 目录结构完整
- 至少实现 10 个常用工具
- 工具能够被 Agent 正确调用和执行
- 安全检查机制有效

---

## 📅 详细执行步骤

### 阶段 1: 创建 MCP 目录结构和基础设施

#### 1.1 创建 mcp/ 基础目录结构
```
mcp/
├── index.ts              # 工具库索引
├── development/          # 开发工具分类
├── devops/              # DevOps 工具分类
├── security/            # 安全工具分类
├── data/                # 数据工具分类
├── ai/                  # AI 工具分类
├── web/                 # Web 工具分类
├── productivity/        # 生产力工具分类
├── analysis/            # 分析工具分类
└── utilities/           # 实用工具分类
```

#### 1.2 创建工具定义规范文件
- `mcp/types.ts` - 定义 MCP 工具的 TypeScript 类型
- `mcp/README.md` - 工具开发文档和规范

#### 1.3 创建工具加载器
- `src/tools/loader.ts` - 负责从 mcp/ 和 tools/ 目录加载工具
- 实现按需加载机制
- 实现工具依赖解析

#### 1.4 创建工具配置管理
- `src/config/tools.ts` - 管理已安装/启用/禁用的工具
- 配置文件存储在 `~/.personal-assistant/tools-config.json`

---

### 阶段 2: 实现核心 MCP 工具

#### 2.1 文件系统工具 (utilities/filesystem)
- **copy_file** - 复制文件
- **move_file** - 移动文件
- **rename_file** - 重命名文件
- **make_dir** - 创建目录
- **chmod_file** - 修改文件权限
- **file_exists** - 检查文件是否存在

#### 2.2 Git 工具 (devops/git)
- **git_status** - 查看 git 状态
- **git_add** - 添加文件到暂存区
- **git_commit** - 提交变更
- **git_push** - 推送到远程仓库
- **git_pull** - 拉取最新变更
- **git_branch** - 分支管理
- **git_log** - 查看提交历史
- **git_diff** - 查看差异

#### 2.3 代码分析工具 (development/code-analysis)
- **find_symbol** - 查找代码符号（基于我们新实现的 ts-morph 解析器）
- **get_function_info** - 获取函数详细信息
- **get_class_info** - 获取类详细信息
- **search_code** - 代码搜索
- **count_lines** - 统计代码行数

#### 2.4 实用工具 (utilities/general)
- **get_current_time** - 获取当前时间
- **generate_uuid** - 生成 UUID
- **base64_encode** - Base64 编码
- **base64_decode** - Base64 解码
- **calculate_hash** - 计算哈希值 (MD5, SHA-1, SHA-256)

#### 2.5 文本处理工具 (productivity/text)
- **replace_text** - 文本替换
- **split_text** - 文本分割
- **join_text** - 文本连接
- **convert_case** - 大小写转换
- **trim_text** - 文本修剪
- **regex_match** - 正则匹配

#### 2.6 JSON 工具 (data/json)
- **parse_json** - 解析 JSON
- **stringify_json** - 序列化 JSON
- **format_json** - 格式化 JSON
- **validate_json** - 验证 JSON
- **json_path_query** - JSONPath 查询

#### 2.7 HTTP 工具 (web/http)
- **http_get** - HTTP GET 请求
- **http_post** - HTTP POST 请求
- **http_put** - HTTP PUT 请求
- **http_delete** - HTTP DELETE 请求
- **http_patch** - HTTP PATCH 请求
- **download_file** - 下载文件

#### 2.8 进程管理工具 (utilities/process)
- **exec_command** - 执行 shell 命令（已存在，增强）
- **get_process_list** - 获取进程列表
- **kill_process** - 终止进程
- **get_env_var** - 获取环境变量
- **set_env_var** - 设置环境变量

#### 2.9 系统信息工具 (utilities/system)
- **get_system_info** - 获取系统信息（已存在，增强）
- **get_disk_usage** - 获取磁盘使用情况
- **get_memory_usage** - 获取内存使用情况
- **get_cpu_usage** - 获取 CPU 使用情况

#### 2.10 知识检索工具 (ai/knowledge)
- **search_memory** - 搜索记忆库
- **get_relevant_context** - 获取相关上下文
- **add_knowledge** - 添加知识
- **list_knowledge** - 列出知识条目

---

### 阶段 3: 完善工具系统集成

#### 3.1 更新工具注册表
- 修改 `src/tools/registry.ts`
- 支持从 MCP 工具加载器动态注册工具
- 实现工具启用/禁用机制

#### 3.2 更新工具库
- 完善 `src/tools/library.ts`
- 实现工具安装/卸载/搜索的完整功能
- 添加工具版本管理

#### 3.3 实现工具安全检查
- 完善 `src/tools/security.ts`
- 实现工具权限控制
- 实现危险操作确认机制
- 实现操作审计日志

#### 3.4 更新 CLI 命令
- 完善 `src/commands/tools/` 下的命令
- 实现 `tools enable/disable` 命令
- 实现 `tools update` 命令
- 添加工具使用示例

---

### 阶段 4: 测试和文档

#### 4.1 编写单元测试
- 为每个 MCP 工具编写单元测试
- 测试工具加载器
- 测试工具安全机制

#### 4.2 集成测试
- 测试完整的工具调用流程
- 测试 Agent 与工具的集成

#### 4.3 编写文档
- 工具使用文档
- 工具开发指南
- API 文档

---

## ✅ 检查清单

### 阶段 1: 基础设施
- [ ] mcp/ 目录结构创建完成
- [ ] mcp/types.ts 类型定义完成
- [ ] src/tools/loader.ts 工具加载器完成
- [ ] src/config/tools.ts 配置管理完成

### 阶段 2: 核心工具实现
- [ ] utilities/filesystem - 文件系统工具 (6个)
- [ ] devops/git - Git 工具 (8个)
- [ ] development/code-analysis - 代码分析工具 (5个)
- [ ] utilities/general - 实用工具 (5个)
- [ ] productivity/text - 文本处理工具 (6个)
- [ ] data/json - JSON 工具 (5个)
- [ ] web/http - HTTP 工具 (6个)
- [ ] utilities/process - 进程管理工具 (5个)
- [ ] utilities/system - 系统信息工具 (4个)
- [ ] ai/knowledge - 知识检索工具 (4个)

### 阶段 3: 系统集成
- [ ] 工具注册表更新完成
- [ ] 工具库完善完成
- [ ] 安全检查机制完成
- [ ] CLI 命令完善完成

### 阶段 4: 测试文档
- [ ] 单元测试完成
- [ ] 集成测试完成
- [ ] 文档编写完成

---

## 📊 预估工作量

| 阶段 | 任务 | 预估时间 |
|------|------|----------|
| 阶段 1 | 基础设施 | 2-3 小时 |
| 阶段 2 | 核心工具实现 | 6-8 小时 |
| 阶段 3 | 系统集成 | 3-4 小时 |
| 阶段 4 | 测试文档 | 2-3 小时 |
| **总计** | - | **13-18 小时** |
