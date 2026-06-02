export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: unknown;
  handler: (args: Record<string, unknown>) => Promise<ToolResult | string>;
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

export interface IToolsPort {
  register(tool: ToolDefinition): void;
  has(name: string): boolean;
  get(name: string): ToolDefinition;
  execute(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  listAll(): ToolDefinition[];
}