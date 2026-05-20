// ============================================================
// Plugin System - Core Types
// ============================================================

/**
 * Plugin manifest - describes a plugin's metadata and entry point.
 * Placed at the root of a plugin directory as `manifest.json`.
 */
export interface PluginManifest {
  /** Unique plugin identifier (kebab-case) */
  name: string;
  /** Semantic version */
  version: string;
  /** Human-readable description */
  description: string;
  /** Plugin author */
  author?: string;
  /** License identifier */
  license?: string;
  /** Entry point relative to plugin directory (default: index.js) */
  main?: string;
  /** Searchable keywords */
  keywords?: string[];
  /** Peer plugin dependencies (name -> semver range) */
  dependencies?: Record<string, string>;
  /** Dev-only peer dependencies */
  devDependencies?: Record<string, string>;
  /** Whether the plugin is enabled by default (default: true) */
  enabled?: boolean;
}

// ============================================================
// Tool and Command Definitions
// ============================================================

/**
 * Definition of a tool that can be registered by a plugin.
 */
export interface ToolDefinition {
  /** Unique tool name (kebab-case) */
  name: string;
  /** Human-readable description of what the tool does */
  description: string;
  /** JSON Schema for the tool's input parameters */
  parameters?: ToolParameters;
  /** The tool's execution function */
  execute: ToolExecuteFn;
  /** Whether the tool modifies state (default: true) */
  modifiesState?: boolean;
  /** Whether the tool requires user confirmation before execution */
  requiresConfirmation?: boolean;
  /** Timeout in milliseconds for tool execution */
  timeout?: number;
}

/**
 * JSON Schema for tool parameters.
 */
export interface ToolParameters {
  /** Parameter schema type */
  type: 'object';
  /** Required parameter names */
  required?: string[];
  /** Property definitions */
  properties: Record<string, ToolParameterProperty>;
  /** Additional properties allowed */
  additionalProperties?: boolean;
}

/**
 * A single property in the tool parameters schema.
 */
export interface ToolParameterProperty {
  /** Property type */
  type: string | string[];
  /** Property description */
  description?: string;
  /** Enum values if applicable */
  enum?: string[];
  /** Default value */
  default?: unknown;
  /** Items schema for array types */
  items?: ToolParameterProperty;
}

/**
 * Tool execution function signature.
 */
export type ToolExecuteFn = (
  args: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<ToolResult> | ToolResult;

/**
 * Context provided to a tool during execution.
 */
export interface ToolExecutionContext {
  /** The agent's current working directory */
  workingDirectory: string;
  /** Logger scoped to the tool name */
  logger: PluginLogger;
  /** Access to the configuration manager */
  configManager: ConfigManager;
}

/**
 * Result returned by a tool execution.
 */
export interface ToolResult {
  /** Whether the tool execution succeeded */
  success: boolean;
  /** Output data from the tool */
  output?: unknown;
  /** Error message if execution failed */
  error?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Definition of a CLI command that can be registered by a plugin.
 * Compatible with Commander.js Command interface.
 */
export interface CommandDefinition {
  /** Command name */
  name: string | (() => string);
  /** Command description */
  description?: string;
  /** Command alias */
  alias?: string;
  /** Command options */
  options?: CommandOption[];
  /** Command arguments */
  arguments?: CommandArgument[];
  /** Command action handler */
  action?: (...args: unknown[]) => void | Promise<void>;
  /** Subcommands */
  commands?: CommandDefinition[];
  /** Internal Commander.js reference (for compatibility) */
  _name?: string;
  /** Add subcommand method (for Commander.js compatibility) */
  addCommand?: (command: CommandDefinition) => void;
}

/**
 * A CLI command option definition.
 */
export interface CommandOption {
  /** Option flags (e.g., '-f, --force') */
  flags: string;
  /** Option description */
  description?: string;
  /** Default value */
  defaultValue?: unknown;
}

/**
 * A CLI command argument definition.
 */
export interface CommandArgument {
  /** Argument name */
  name: string;
  /** Whether the argument is required */
  required: boolean;
}

/**
 * Configuration manager interface.
 */
export interface ConfigManager {
  /** Get a configuration value by key path */
  get<T = unknown>(key: string): T | undefined;
  /** Set a configuration value */
  set(key: string, value: unknown): void;
  /** Get the entire configuration object */
  getAll(): Record<string, unknown>;
  /** Reload configuration from disk */
  reload(): Promise<void>;
}

// ============================================================
// Plugin Context and Logger
// ============================================================

/**
 * Logger scoped to a plugin name.
 */
export interface PluginLogger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

/**
 * Context object passed to a plugin during activation.
 * Provides access to all registration APIs and configuration.
 */
export interface PluginContext {
  /** Plugin's own manifest */
  manifest: PluginManifest;
  /** Register a new tool with the tool registry */
  registerTool(definition: ToolDefinition): void;
  /** Register a new CLI command with Commander */
  registerCommand(command: CommandDefinition): void;
  /** Get plugin-specific configuration */
  getConfig(): Record<string, unknown>;
  /** Update plugin-specific configuration */
  setConfig(config: Record<string, unknown>): void;
  /** Access to the global config manager */
  configManager: ConfigManager;
  /** Logger scoped to plugin name */
  logger: PluginLogger;
  /** Read-only access to the tool registry */
  toolRegistry: Map<string, ToolDefinition>;
}

/** Plugin activation function */
export type PluginActivateFn = (context: PluginContext) => void | Promise<void>;

/** Plugin deactivation function */
export type PluginDeactivateFn = () => void | Promise<void>;

/**
 * A loaded plugin instance.
 * Plugins must export a default object conforming to this interface.
 */
export interface Plugin {
  manifest: PluginManifest;
  activate: PluginActivateFn;
  deactivate?: PluginDeactivateFn;
}

// ============================================================
// Lifecycle Hooks
// ============================================================

/**
 * Available lifecycle hooks that plugins can subscribe to.
 */
export type PluginHook =
  | 'beforeRun'
  | 'afterRun'
  | 'beforeStep'
  | 'afterStep'
  | 'beforeToolExecution'
  | 'afterToolExecution'
  | 'onError'
  | 'onConfigChange';

/**
 * Intent information extracted from user input.
 */
export interface IntentInfo {
  /** The type of intent detected */
  type: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Extracted entities or parameters */
  entities?: Record<string, unknown>;
  /** Raw intent text */
  raw?: string;
}

/**
 * A single step in the execution plan.
 */
export interface ExecutionStep {
  /** Step identifier */
  id: string;
  /** Step type (tool, prompt, etc.) */
  type: string;
  /** Step description */
  description: string;
  /** Tool name if this is a tool step */
  toolName?: string;
  /** Tool arguments if this is a tool step */
  toolArgs?: Record<string, unknown>;
  /** Whether this step is optional */
  optional?: boolean;
  /** Step status */
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
}

/**
 * Execution plan generated by the agent.
 */
export interface ExecutionPlan {
  /** Plan identifier */
  id: string;
  /** Plan description */
  description: string;
  /** Steps in the plan */
  steps: ExecutionStep[];
  /** Plan metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of a step execution.
 */
export interface StepResult {
  /** Step identifier */
  stepId: string;
  /** Whether the step succeeded */
  success: boolean;
  /** Output from the step */
  output?: unknown;
  /** Error message if step failed */
  error?: string;
  /** Execution duration in milliseconds */
  duration?: number;
}

/**
 * Result of the entire agent run.
 */
export interface AgentResult {
  /** Whether the run succeeded */
  success: boolean;
  /** Final output or response */
  output?: unknown;
  /** Error if the run failed */
  error?: string;
  /** Results from individual steps */
  stepResults?: StepResult[];
  /** Execution metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================
// Hook Contexts
// ============================================================

/**
 * Context for beforeRun / afterRun hooks.
 */
export interface RunContext {
  /** The original user input */
  input: string;
  /** Extracted intent information */
  intent?: IntentInfo;
  /** Generated execution plan */
  plan?: ExecutionPlan;
  /** Execution steps */
  steps?: ExecutionStep[];
  /** Final result of the run */
  result?: AgentResult;
  /** Error if the run failed */
  error?: Error;
}

/**
 * Context for beforeStep / afterStep hooks.
 */
export interface StepContext {
  /** The step being executed */
  step: ExecutionStep;
  /** Step index in the plan */
  index: number;
  /** Result of step execution */
  result?: StepResult;
  /** Error if step failed */
  error?: Error;
}

/**
 * Context for beforeToolExecution / afterToolExecution hooks.
 */
export interface ToolExecutionHookContext {
  /** Name of the tool being executed */
  toolName: string;
  /** Tool arguments */
  args: Record<string, unknown>;
  /** Result of tool execution */
  result?: ToolResult;
  /** Error if execution failed */
  error?: Error;
  /** Execution duration in milliseconds */
  duration?: number;
}

/**
 * Context for onError hooks.
 */
export interface ErrorContext {
  /** The error that occurred */
  error: Error;
  /** Context description where the error occurred */
  context?: string;
}

/**
 * Context for onConfigChange hooks.
 */
export interface ConfigChangeContext {
  /** Configuration key that changed */
  key: string;
  /** Old value */
  oldValue?: unknown;
  /** New value */
  newValue?: unknown;
  /** Source of the change */
  source?: string;
}

// ============================================================
// Hook Handler
// ============================================================

/**
 * A registered hook handler with metadata.
 */
export interface HookHandler {
  /** Name of the plugin that registered this handler */
  pluginName: string;
  /** The handler function */
  handler: (...args: unknown[]) => void | Promise<void>;
  /** Execution priority (lower = earlier, default: 100) */
  priority?: number;
}

// ============================================================
// Plugin State
// ============================================================

/**
 * Runtime state of a plugin.
 */
export interface PluginState {
  manifest: PluginManifest;
  state: 'loaded' | 'activated' | 'deactivated' | 'error';
  error?: string;
  activatedAt?: number;
}

// ============================================================
// Plugin Definition (for registry)
// ============================================================

/**
 * Complete plugin definition including all metadata and capabilities.
 */
export interface PluginDefinition {
  /** Plugin manifest */
  manifest: PluginManifest;
  /** Activation function */
  activate: PluginActivateFn;
  /** Deactivation function */
  deactivate?: PluginDeactivateFn;
  /** Hooks to register on activation */
  hooks?: PluginHookDefinition[];
  /** Tools to register on activation */
  tools?: ToolDefinition[];
  /** Commands to register on activation */
  commands?: CommandDefinition[];
}

/**
 * Definition of a hook registration.
 */
export interface PluginHookDefinition {
  /** Hook to subscribe to */
  hook: PluginHook;
  /** Handler function */
  handler: (...args: unknown[]) => void | Promise<void>;
  /** Priority (lower = earlier) */
  priority?: number;
}
