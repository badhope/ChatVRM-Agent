export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: unknown;
  /** JSON Schema for the tool's input (MCP-style alias for `parameters`). */
  inputSchema?: unknown;
  /** Free-form metadata (e.g. origin server, tags). */
  metadata?: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<ToolResult | string>;
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

export interface IToolsPort {
  register(tool: ToolDefinition): void;
  /** Optional: remove a previously-registered tool by name. */
  unregister?(name: string): boolean;
  has(name: string): boolean;
  get(name: string): ToolDefinition;
  execute(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  listAll(): ToolDefinition[];
  /** Optional: same as listAll but included for symmetry with test mocks. */
  list?(): ToolDefinition[];
}