import { Router } from 'express';
import type { ToolsRegistry } from '../../src/adapters/tools.registry.js';
import type { LLMAdapter } from '../../src/adapters/llm.adapter.js';
import type { StorageAdapter } from '../../src/adapters/storage.adapter.js';
import type { MemoryAdapter } from '../../src/adapters/memory.adapter.js';
import type { ShellExecutor } from '../../src/adapters/shell.adapter.js';
import { incrementToolCall } from './dashboard.routes.js';

interface ToolDeps {
  tools: ToolsRegistry;
  llm: LLMAdapter;
  storage: StorageAdapter;
  memory: MemoryAdapter;
  shell: ShellExecutor;
}

const TOOL_SCHEMAS: Record<string, Array<{ name: string; type: string; description: string; required: boolean }>> = {
  writeFile: [{ name: 'filePath', type: 'string', description: '目标文件路径', required: true }, { name: 'content', type: 'string', description: '写入内容', required: false }, { name: 'previousOutput', type: 'string', description: '前一步输出作为内容（fallback）', required: false }],
  readFile: [{ name: 'filePath', type: 'string', description: '要读取的文件路径', required: true }],
  shell: [{ name: 'command', type: 'string', description: 'shell 命令', required: true }, { name: 'timeout', type: 'number', description: '超时（毫秒），默认 60000', required: false }],
  search: [{ name: 'pattern', type: 'string', description: '搜索关键词', required: true }],
  remember: [{ name: 'input', type: 'string', description: '输入', required: true }, { name: 'output', type: 'string', description: '输出', required: true }, { name: 'tags', type: 'string[]', description: '标签', required: false }],
  analyze: [{ name: 'text', type: 'string', description: '待分析文本', required: true }, { name: 'instruction', type: 'string', description: '分析指令', required: false }],
  respond: [{ name: 'prompt', type: 'string', description: '用户提示', required: true }, { name: 'context', type: 'string', description: '上下文', required: false }],
};

export function toolsRoutes(deps: ToolDeps): Router {
  const r = Router();

  r.get('/', (_req, res) => {
    const list = deps.tools.listAll().map((t) => ({
      name: t.name,
      description: t.description,
      schema: TOOL_SCHEMAS[t.name] ?? [],
    }));
    res.json(list);
  });

  r.post('/execute', async (req, res) => {
    const { tool, args } = req.body as { tool: string; args: Record<string, unknown> };
    if (!tool) {
      res.status(400).json({ error: 'tool is required' });
      return;
    }
    if (!deps.tools.has(tool)) {
      res.status(404).json({ error: `tool "${tool}" not registered` });
      return;
    }
    const startedAt = Date.now();
    try {
      const result = await deps.tools.execute(tool, args ?? {});
      incrementToolCall();
      res.json({
        ...result,
        tool,
        durationMs: Date.now() - startedAt,
        startedAt: new Date(startedAt).toISOString(),
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
        tool,
        durationMs: Date.now() - startedAt,
      });
    }
  });

  return r;
}
