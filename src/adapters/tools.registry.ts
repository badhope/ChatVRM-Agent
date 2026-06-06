import type { IToolsPort, ToolDefinition, ToolResult } from '../ports/tools.port.js';

export class ToolsRegistry implements IToolsPort {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition, opts: { replace?: boolean } = {}): void {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('Tool name must be a non-empty string');
    }
    if (typeof tool.handler !== 'function') {
      throw new Error(`Tool "${tool.name}" must have a handler function`);
    }
    // M20 (W18): default to refuse-on-overwrite. The previous
    // implementation silently `Map.set` over an existing entry,
    // which meant a typo (e.g. `webFetch` vs `webfetch`) would
    // register a duplicate that nothing in the agent loop would
    // ever see — the second tool would shadow the first, but
    // the `tools.listAll()` ordering would make the bug look
    // like "the first tool isn't being invoked" with no error
    // to track down. We require an explicit `replace: true` to
    // overwrite; the standard `tools-setup.ts` registers use
    // `replace: true` because re-running the setup (e.g. on a
    // test re-init) is intended to be idempotent.
    if (this.tools.has(tool.name) && !opts.replace) {
      throw new Error(
        `Tool "${tool.name}" is already registered. Pass { replace: true } to overwrite.`,
      );
    }
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): ToolDefinition {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" not registered. Available: ${this.listAll().map((t) => t.name).join(', ') || 'none'}`);
    }
    return tool;
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    opts?: { signal?: AbortSignal },
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Tool "${name}" not registered` };
    }

    // L6 (W19): early-exit if the parent signal is already
    // aborted. The pre-W19 code did nothing on this path, so a
    // client that disconnected right before `execute` was called
    // still paid the cost of `tool.handler(args)` starting up
    // (network DNS, MCP handshake, etc) before being cancelled.
    if (opts?.signal?.aborted) {
      return { success: false, error: 'aborted' };
    }

    try {
      const result = await tool.handler(args, opts);
      if (typeof result === 'string') {
        return { success: true, output: result };
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  listAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  count(): number {
    return this.tools.size;
  }
}
