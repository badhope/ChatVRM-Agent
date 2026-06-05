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
  /**
   * Optional list of filesystem paths the tool created or modified.
   * Used by the execute stage's post-trust rollback to discover
   * side-effect targets that weren't visible in the original
   * `args`. Tools that produce derived paths (e.g. a generated
   * .docx into a folder passed as `args.uploads`) should fill
   * this in. M18 (W18).
   */
  changedFiles?: string[];
}

export interface IToolsPort {
  /**
   * Register a new tool. M20 (W18): by default this refuses to
   * overwrite an existing entry; pass `{ replace: true }` to
   * silently take over. The default-refuse behaviour surfaces
   * double-registration bugs (typos, accidental re-init) instead
   * of letting the new tool shadow the old one.
   */
  register(tool: ToolDefinition, opts?: { replace?: boolean }): void;
  /** Optional: remove a previously-registered tool by name. */
  unregister?(name: string): boolean;
  has(name: string): boolean;
  get(name: string): ToolDefinition;
  execute(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  listAll(): ToolDefinition[];
  /** Optional: same as listAll but included for symmetry with test mocks. */
  list?(): ToolDefinition[];
}