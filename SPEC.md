# SPEC — 本地化个人办公智能体（v3 MVP）

> **状态**：草案 / 待评审
> **目标读者**：开发者 + 用户（产品 owner）
> **范围**：从零起步的 MVP 重构方案，覆盖 3 天落地

---

## 1. 项目概述

### 1.1 一句话定位
跑在你自己电脑上的"办公搭子"：能读你电脑里的文件、能调用你装好的工具、能用你给的语气跟你聊，不会把你的数据送到云端训练。

### 1.2 核心价值
- **本地优先**：默认所有数据落本地，LLM 调用走你自己的 API Key
- **工具可插拔**：用户像"挂插件"一样接入本地脚本（shell 脚本、Python 函数、HTTP endpoint）
- **语气可调**：专业化 / 幽默化 / 自定义 system prompt
- **零配置启动**：装好就能跑，第一次启动引导用户配置至少一个 LLM Key

### 1.3 与市面通用 AI 的差异
| 维度 | 通用 AI 助手（ChatGPT / Copilot） | 本项目 |
|------|----------------------------------|--------|
| 数据位置 | 云端 | 本地优先 |
| 工具扩展 | 厂商决定 | 用户自挂 JSON manifest |
| 风格 | 统一 | 可改 system prompt / 加载人格包 |
| 工作流 | 单轮对话 | 拆解-执行-反馈 三步流水线 |
| 二次开发 | 黑盒 | MIT 协议，代码全开 |

---

## 2. 范围与非目标

### 2.1 MVP 必须做（IN）
- 三层架构骨架（接口定义 + 至少一个实现）
- 对接 2 个 LLM provider：OpenAI 兼容协议 + Ollama（本地模型）
- 4 个内置工具：read_file / write_file / shell / http_fetch
- 工具挂载机制（YAML/JSON manifest）
- CLI + Streamlit 极简前端
- 路径白名单 + shell 命令白名单
- 任务三步流水线：理解 → 执行 → 反馈
- 基础 SSE 流式输出

### 2.2 MVP 不做（OUT）
- 多 agent 协作（crew / graph）
- 知识图谱 / RAG
- MCP server
- 远程部署 / Docker / systemd
- 国际化（先中文）
- 移动端
- 计费 / token 预算
- 记忆系统（仅会话内）

### 2.3 非目标
- 不做"通用 Agent OS"（已经有 LangChain / AutoGen 做了）
- 不做企业级 RBAC
- 不做实时语音

---

## 3. 用户故事与核心场景

### S1：本地文件问答
> 用户：把 `~/work/notes/2026q1.md` 里提到"客户 A"的段落整理成 3 条 bullet。
> 助手：读取文件 → 抽取段落 → 输出 bullet。

### S2：脚本编排
> 用户：用我桌面的 `~/tools/convert.sh %FOLDER%` 帮我把 Downloads 里所有 PNG 转成 JPG。
> 助手：加载自定义工具 → 列出 PNG → 循环调用 → 报告成功率。

### S3：多轮修改
> 用户：给 `app.py` 加一个 `/health` 路由，返回 `{"ok": true, "ts": ...}`。
> 助手：读文件 → 生成 patch → 写入 → 跑 lint → 报告。

### S4：幽默模式
> 用户：（切换人格 "老干部"）我那个 bug 怎么回事？
> 助手：以"老干部"口吻 + 实际诊断结果返回。

### S5：本地模型兜底
> 用户：（无 OpenAI Key）我电脑上有 Ollama 装着 llama3，帮我润色这句话。
> 助手：检测到 Ollama → 调用本地模型 → 返回结果（明确标注"本地模型"）。

---

## 4. 架构设计

### 4.1 整体形态

```
┌──────────────────────────────────────────────────────────────┐
│                       客户端（任选）                            │
│   Streamlit UI  /  CLI  /  curl  /  任意 HTTP client            │
└──────────────────────┬───────────────────────────────────────┘
                       │ HTTP + SSE
┌──────────────────────▼───────────────────────────────────────┐
│                   FastAPI Gateway                              │
│   - 路由分发        - 鉴权（PA_API_TOKEN）                       │
│   - 流式响应        - 限流（120 req/min/IP）                      │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────┐
│                 流水线编排器（Orchestrator）                    │
│   Understand  ──►  Plan  ──►  Execute  ──►  Reflect             │
│   （理解）         （拆解）   （执行）         （反馈）           │
└──────┬──────────────────┬──────────────────┬──────────────────┘
       │                  │                  │
┌──────▼──────┐  ┌────────▼────────┐  ┌──────▼──────┐
│  Layer 1   │  │    Layer 2       │  │   Layer 3   │
│ 本地安全交互 │  │   LLM 调度       │  │  任务执行   │
│             │  │                  │  │             │
│ - 路径白名单 │  │ - 协议适配       │  │ - 工具注册表 │
│ - Shell 沙箱 │  │ - 重试 / 熔断    │  │ - manifest  │
│ - 文件读写   │  │ - 流式解析       │  │ - 调用执行   │
│ - HTTP 拉取  │  │ - 失败回退       │  │ - 结果聚合   │
└─────────────┘  └──────────────────┘  └─────────────┘
       │                  │                  │
       ▼                  ▼                  ▼
   本地 FS          上游 LLM API        内置工具 + 用户工具
```

### 4.2 三层架构详解

#### Layer 1：本地安全交互层（Local I/O Layer）
**职责**：所有"碰本地"的操作都走这里，统一加权限边界。

**接口**：
```python
class LocalIO(Protocol):
    def read_file(self, path: str) -> str: ...
    def write_file(self, path: str, content: str) -> None: ...
    def list_dir(self, path: str) -> list[FileEntry]: ...
    def run_shell(self, command: str, args: list[str]) -> ShellResult: ...
    def http_fetch(self, url: str, method: str, **kw) -> HttpResult: ...
```

**安全约束**：
- `read_file/write_file/list_dir`：path 必须在 `ALLOWED_ROOTS` 白名单内（默认 `~/personal-assistant-workspace/` + `cwd`）
- `run_shell`：command 必须在 `ALLOWED_COMMANDS` 列表内（默认 `ls cat cp mv mkdir echo date grep head tail wc`）
- `http_fetch`：URL scheme 必须是 `http/https`，host 不能是 `localhost/127.0.0.1/::1`（防 SSRF 内网探测）

**实现位置**：`pa/local_io.py`

#### Layer 2：LLM 调度层（Model Gateway）
**职责**：把不同 provider 的差异藏起来，对上层只暴露 `chat(messages, tools, stream)`。

**接口**：
```python
class ModelGateway(Protocol):
    def chat(
        self,
        messages: list[Message],
        *,
        tools: list[ToolDef] | None = None,
        stream: bool = False,
    ) -> ChatResponse | Iterator[ChatChunk]: ...
```

**Provider 实现**：
- `OpenAICompatProvider`：所有走 OpenAI 协议 1.0 的（OpenAI、DeepSeek、SiliconFlow、阿里云百炼、智谱、Moonshot、自部署兼容端点）
- `OllamaProvider`：本地 Ollama（`http://localhost:11434`），自动探测
- 未来可加 `AnthropicProvider`、`GoogleProvider`

**重试 / 熔断**：
- 单次调用：指数退避 3 次（0.5s → 1.5s → 4.5s）
- 熔断：5 分钟内 5 次失败 → 熔断 60s
- 失败回退：若配置了多个 provider，按优先级降级

**实现位置**：`pa/model_gateway/`

#### Layer 3：任务执行层（Tool Runtime）
**职责**：把 LLM 输出的 tool call 真正执行出去。

**接口**：
```python
class ToolRegistry(Protocol):
    def register(self, tool: ToolDef, handler: Callable): ...
    def list(self) -> list[ToolDef]: ...
    def invoke(self, name: str, args: dict) -> ToolResult: ...
```

**内置工具**（4 个 MVP 必须）：
- `read_file(path: str) -> str`
- `write_file(path: str, content: str) -> str`
- `shell(command: str, args: list[str]) -> {stdout, stderr, exit_code}`
- `http_fetch(url: str, method?: str, headers?: dict, body?: str) -> {status, headers, body}`

**用户自定义工具**（manifest 挂载）：
```yaml
# ~/.personal-assistant/tools/convert-image.yaml
name: convert_image
description: 用 convert.sh 把 PNG 转 JPG
params:
  - name: folder
    type: string
    required: true
handler:
  type: shell
  command: ~/tools/convert.sh
  arg_template: "%FOLDER%"
```

注册时机：启动时扫描 `~/.personal-assistant/tools/*.yaml`。

**实现位置**：`pa/tools/`

### 4.3 流水线（Orchestrator）

四步而非六步（精简）：

```
Understand → Plan → Execute → Reflect
```

| 步骤 | 职责 | 失败处理 |
|------|------|---------|
| Understand | 解析用户输入，提炼 intent + 关键实体 | 模糊则反问 |
| Plan | 决定调用哪些工具，输出 step list | 工具不存在 → Reflect 提示 |
| Execute | 逐个执行 step，输出累积结果 | 单步失败 → Reflect 兜底 |
| Reflect | 汇总结果，调用 LLM 写最终回复 | LLM 失败 → 直接返回原始结果 |

LLM 调用点：Understand / Plan / Reflect 各一次；Execute 不调 LLM。

---

## 5. 技术选型

| 层 | 选型 | 理由 |
|----|------|------|
| 运行时 | Python 3.11+ | 异步原生、类型系统强、库生态丰富 |
| Web 框架 | FastAPI | 异步、SSE 一等公民、OpenAPI 自动生成 |
| LLM 客户端 | openai SDK（兼容模式） | 行业标准、覆盖 90% provider |
| 工具加载 | PyYAML | manifest 用 YAML |
| 数据校验 | Pydantic v2 | 与 FastAPI 一体 |
| 配置 | pydantic-settings + .env | 12-factor |
| 日志 | structlog | JSON 输出，易聚合 |
| 测试 | pytest + pytest-asyncio | 业界标准 |
| CLI | Typer | 类型提示友好 |
| 前端（MVP） | Streamlit | 一天可上，省去 React 编译链 |
| 存储 | SQLite（settings） + 本地 FS（数据） | 单机场景无需 DB |
| 锁 | 临时目录 fcntl / msvcrt | 跨平台文件锁 |

**未来可替换**：Streamlit → React + Vite（当 UX 要求上来时），但接口层 `Gateway` 不变。

---

## 6. 数据模型

### 6.1 配置（`~/.personal-assistant/config.toml`）
```toml
[general]
workspace_root = "~/personal-assistant-workspace"
log_level = "info"

[llm]
default_provider = "openai"
api_key_env = "OPENAI_API_KEY"

[[llm.providers]]
name = "openai"
type = "openai_compat"
base_url = "https://api.openai.com/v1"
default_model = "gpt-4o-mini"

[[llm.providers]]
name = "ollama"
type = "ollama"
base_url = "http://localhost:11434"
default_model = "llama3.1:8b"

[security]
allowed_roots = ["~/personal-assistant-workspace", "."]
allowed_commands = ["ls", "cat", "cp", "mv", "mkdir", "echo", "date", "grep", "head", "tail", "wc"]

[auth]
api_token_env = "PA_API_TOKEN"
```

### 6.2 会话（SQLite `~/.personal-assistant/sessions.db`）
```
sessions(id, title, created_at, updated_at)
messages(id, session_id, role, content, tool_calls_json, created_at)
```

### 6.3 工具 manifest（`~/.personal-assistant/tools/*.yaml`）
已见 4.2 节。

---

## 7. API 设计

### 7.1 端点清单（MVP）

| Method | Path | 用途 |
|--------|------|------|
| GET | `/api/health` | 健康检查（免认证） |
| GET | `/api/providers` | 列出已配置 provider |
| POST | `/api/chat` | 单轮对话 |
| POST | `/api/chat/stream` | 流式对话（SSE） |
| POST | `/api/agent/run` | 跑一个 task（理解→执行→反馈） |
| POST | `/api/agent/stream` | 流式 task |
| GET | `/api/tools` | 列出工具 |
| GET | `/api/sessions` | 列出会话 |
| GET | `/api/sessions/{id}` | 会话详情 |
| DELETE | `/api/sessions/{id}` | 删除会话 |
| GET | `/api/config` | 读取配置（脱敏） |
| PUT | `/api/config` | 写入配置 |

### 7.2 SSE 事件协议
```
event: chunk
data: {"content": "我"}

event: chunk
data: {"content": "来"}

event: tool_call
data: {"name": "read_file", "args": {"path": "..."}}

event: tool_result
data: {"name": "read_file", "output": "...", "ok": true}

event: done
data: {"finish_reason": "stop", "usage": {...}}

event: error
data: {"code": "rate_limit", "message": "..."}
```

### 7.3 错误码
- `400 INVALID_INPUT` — 参数错误
- `401 UNAUTHORIZED` — 缺/错 PA_API_TOKEN
- `403 PATH_FORBIDDEN` — 路径不在白名单
- `403 COMMAND_FORBIDDEN` — shell 命令不在白名单
- `404 TOOL_NOT_FOUND` / `404 SESSION_NOT_FOUND`
- `429 RATE_LIMITED`
- `500 UPSTREAM_ERROR` — LLM 调用失败
- `502 TOOL_EXECUTION_ERROR` — 工具执行抛错
- `504 TIMEOUT`

---

## 8. 模块设计

### 8.1 目录结构
```
pa/
├── __init__.py
├── config.py              # 加载 + 校验 config.toml
├── server/
│   ├── __init__.py
│   ├── app.py             # FastAPI 实例 + 路由注册
│   ├── routes/
│   │   ├── health.py
│   │   ├── chat.py
│   │   ├── agent.py
│   │   ├── tools.py
│   │   ├── sessions.py
│   │   └── config.py
│   └── middleware/
│       ├── auth.py
│       └── ratelimit.py
├── local_io/              # Layer 1
│   ├── __init__.py
│   ├── filesystem.py      # read/write/list，带路径校验
│   ├── shell.py           # shell 白名单
│   └── http.py            # http_fetch，带 SSRF 防护
├── model_gateway/         # Layer 2
│   ├── __init__.py
│   ├── base.py            # 抽象类
│   ├── openai_compat.py
│   ├── ollama.py
│   └── registry.py        # provider 注册
├── tools/                 # Layer 3
│   ├── __init__.py
│   ├── registry.py
│   ├── builtin.py         # 4 个内置工具
│   └── manifest.py        # 用户 manifest 加载
├── orchestrator/          # 流水线
│   ├── __init__.py
│   ├── pipeline.py        # Understand→Plan→Execute→Reflect
│   └── prompts.py
├── cli/
│   └── main.py            # Typer CLI
├── web/
│   └── streamlit_app.py   # 极简前端
└── tests/
    ├── test_local_io.py
    ├── test_model_gateway.py
    ├── test_tools.py
    └── test_pipeline.py
```

### 8.2 关键类签名

```python
# local_io/filesystem.py
class FileSystem:
    def __init__(self, allowed_roots: list[Path]): ...
    def _resolve(self, path: str) -> Path: ...  # 抛 PathForbidden
    def read(self, path: str) -> str: ...
    def write(self, path: str, content: str) -> None: ...
    def list(self, path: str) -> list[FileEntry]: ...

# model_gateway/base.py
class ChatRequest(BaseModel):
    messages: list[Message]
    tools: list[ToolDef] | None = None
    temperature: float = 0.3
    max_tokens: int = 2048

class ChatResponse(BaseModel):
    content: str
    tool_calls: list[ToolCall] = []
    usage: Usage
    finish_reason: Literal["stop", "tool_calls", "length", "error"]

class ModelGateway(ABC):
    @abstractmethod
    async def chat(self, req: ChatRequest) -> ChatResponse: ...
    def stream(self, req: ChatRequest) -> AsyncIterator[ChatChunk]: ...

# tools/registry.py
class ToolDef(BaseModel):
    name: str
    description: str
    params: list[ParamDef]

class ToolRegistry:
    def register(self, defn: ToolDef, handler: Callable): ...
    def get_json_schemas(self) -> list[dict]: ...  # for LLM tool_calls
    async def invoke(self, name: str, args: dict) -> ToolResult: ...
```

---

## 9. 安全与权限

### 9.1 攻击面分析

| 攻击 | 缓解 |
|------|------|
| 越权读文件 | `FileSystem._resolve` 校验 `resolved.startswith(allowed_root)` |
| Shell 注入 | 白名单命令 + 参数化（不拼字符串） |
| SSRF | host 黑名单（localhost / 169.254/16 / 10/8 / 172.16/12 / 192.168/16） |
| 密钥泄露 | 仅从 env 读，不入 config.toml；日志脱敏（`api_key=redacted`） |
| Token 泄露 | 仅 `Authorization: Bearer`，不用 `?token=` |
| 限流 | 120 req/min/IP，开 / 关模式均生效 |

### 9.2 日志脱敏
所有进入 `structlog` 的字段，命中 `api_key` / `token` / `password` 子串自动替换为 `***redacted***`。

### 9.3 路径解析
使用 `Path.resolve(strict=False)`，失败时拒绝；显式拒绝包含 NUL byte 的输入。

---

## 10. 性能与可观测性

### 10.1 性能预算（MVP 目标）
- `/api/health` P99 < 50ms
- `/api/chat`（非流）P99 < 2s + LLM 耗时
- `/api/agent/run` P99 < 5s + LLM × 3 耗时
- 单实例并发 ≥ 20（asyncio）

### 10.2 日志格式
```json
{
  "ts": "2026-06-10T13:45:00.123Z",
  "level": "info",
  "event": "tool_invoked",
  "session_id": "abc",
  "tool": "read_file",
  "duration_ms": 12,
  "ok": true
}
```

### 10.3 指标（Post-MVP）
- `pa_requests_total{path, status}`
- `pa_tool_invocations_total{tool, ok}`
- `pa_llm_calls_total{provider, model, ok}`
- `pa_llm_latency_seconds{provider}`（histogram）

---

## 11. 交付里程碑（3 天 MVP）

### Day 1：骨架 + 三层接口
- [ ] `pa/` 目录初始化，pyproject.toml
- [ ] `LocalIO` 三件套接口 + 路径白名单 + shell 白名单
- [ ] `ModelGateway` 抽象 + OpenAI 兼容实现
- [ ] `ToolRegistry` 抽象 + 4 个内置工具
- [ ] `pytest` 跑通 6 个最小单测

### Day 2：编排 + LLM 联调
- [ ] Orchestrator 四步流水线
- [ ] FastAPI 路由：`/health` `/providers` `/chat` `/chat/stream`
- [ ] SSE 流式输出
- [ ] Pydantic config 加载
- [ ] CLI 入口（Typer）：`pa chat "..."`
- [ ] Ollama provider + 自动探测

### Day 3：前端 + 端到端
- [ ] Streamlit 三页：Chat / Tools / Settings
- [ ] 鉴权中间件（PA_API_TOKEN）+ 限流
- [ ] 日志脱敏
- [ ] 用户 manifest 加载流程
- [ ] 端到端用例跑通 3 个
- [ ] README + QUICKSTART

### 验收（DoD）
- `pip install -e .` → `pa serve` → 浏览器能开 Streamlit → 输入任务能完整跑通一次
- 路径白名单生效：尝试读 `/etc/passwd` 收到 403
- Shell 白名单生效：尝试 `rm -rf` 被拒
- 无 OpenAI Key → 自动 fallback 到 Ollama
- 跑 `pytest` 全绿，coverage ≥ 60%

---

## 12. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| LLM 输出格式不稳定，tool_calls JSON 解析失败 | 高 | 中 | 解析失败 fallback 到 Reflect 提示用户重述 |
| 用户挂载的工具 manifest 写错 | 中 | 低 | 启动时严格 schema 校验，错就拒绝启动该工具并日志告警 |
| Ollama 探测误报（端口占用但不是 Ollama） | 低 | 低 | 探测后用 `/api/tags` 二次确认 |
| 路径白名单太严导致用户没法用 | 中 | 中 | 默认 `cwd` + 一个工作目录，文档说明如何加 |
| Streamlit 性能不够 | 中 | 低 | 仅 MVP 用，未来切 React |

---

## 13. 验收清单（复盘用）

- [ ] 代码可 `pip install -e .` 装好
- [ ] `pa serve` 启动后 `/api/health` 返回 200
- [ ] Streamlit 三页能正常渲染
- [ ] 内置 4 个工具能通过 CLI 调用
- [ ] 用户 manifest 加载生效，工具出现在 `/api/tools` 列表
- [ ] 路径白名单 / shell 白名单 单元测试覆盖
- [ ] 日志脱敏单元测试覆盖
- [ ] SSE 流式输出与 OpenAI 兼容客户端联调成功
- [ ] 3 个端到端用例通过
- [ ] README 包含：安装 / 配置 / 启动 / 第一个工具

---

## 14. 开放问题

1. **人格包**：是放到 `~/.personal-assistant/personalities/*.yaml` 还是有 GUI 编辑器？（MVP 暂只支持前者）
2. **记忆**：是否在 MVP 加入短期记忆（最近 N 条消息）？建议加入
3. **多 provider 并发**：是否允许一次任务同时调多个 provider 取最优？MVP 不做
4. **React 切换时机**：什么信号触发切到 React？日活 > 10？反馈 > N 条？
