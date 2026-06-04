import type { IToolsPort, ToolDefinition, ToolResult } from '../ports/tools.port.js';

export class ToolsRegistry implements IToolsPort {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition): void {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('Tool name must be a non-empty string');
    }
    if (typeof tool.handler !== 'function') {
      throw new Error(`Tool "${tool.name}" must have a handler function`);
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

  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Tool "${name}" not registered` };
    }

    try {
      const result = await tool.handler(args);
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
