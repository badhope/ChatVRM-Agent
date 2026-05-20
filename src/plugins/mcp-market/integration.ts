import * as path from 'path';
import { MCPDiscovery, type MCPServiceInfo } from './discovery.js';
import { toolRegistry } from '../../tools/registry.js';
import { getErrorMessage } from '../../utils/error-handling.js';

// ============================================================
// MCP Marketplace - Integration
// ============================================================

export interface IntegrationOptions {
  services?: string[];
  registerTools?: boolean;
  registerAsPlugins?: boolean;
  toolPrefix?: string;
}

export interface IntegrationResult {
  services: string[];
  toolsRegistered: number;
  errors: string[];
}

interface IntegratedTool {
  service: string;
  tool: unknown;
}

export class MCPIntegration {
  private discovery: MCPDiscovery;
  private integrated: Map<string, Set<string>> = new Map();
  private integratedTools: Map<string, IntegratedTool> = new Map();

  constructor(discovery: MCPDiscovery) {
    this.discovery = discovery;
  }

  async integrate(options?: IntegrationOptions): Promise<IntegrationResult> {
    const allServices = await this.discovery.discover();
    const targetNames = options?.services ?? allServices.map((s) => s.name);
    const prefix = options?.toolPrefix ?? 'mcp_';
    const doRegister = options?.registerTools ?? true;
    const result: IntegrationResult = { services: [], toolsRegistered: 0, errors: [] };
    for (const name of targetNames) {
      const svcResult = await this.integrateService(name, {
        ...options, services: [name], toolPrefix: prefix, registerTools: doRegister,
      });
      result.services.push(...svcResult.services);
      result.toolsRegistered += svcResult.toolsRegistered;
      result.errors.push(...svcResult.errors);
    }
    return result;
  }

  async integrateService(serviceName: string, options?: IntegrationOptions): Promise<IntegrationResult> {
    const result: IntegrationResult = { services: [], toolsRegistered: 0, errors: [] };
    const prefix = options?.toolPrefix ?? 'mcp_';
    const doRegister = options?.registerTools ?? true;
    const info = this.discovery.get(serviceName);
    if (!info) { result.errors.push(`Service not found: ${serviceName}`); return result; }
    if (this.integrated.has(serviceName)) { result.services.push(serviceName); return result; }
    try {
      const modulePath = path.resolve(info.path);
      const mod = await import(modulePath);
      const exported = mod.default ?? mod;
      const toolEntries = this.extractToolEntries(exported, info);
      const registeredNames: string[] = [];
      for (const [toolName, toolDef] of toolEntries) {
        const prefixedName = `${prefix}${toolName}`;
        if (doRegister) toolRegistry.register(this.wrapToolDefinition(toolDef, prefixedName));
        registeredNames.push(prefixedName);
        this.integratedTools.set(prefixedName, { service: serviceName, tool: toolDef });
      }
      this.integrated.set(serviceName, new Set(registeredNames));
      result.services.push(serviceName);
      result.toolsRegistered = registeredNames.length;
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      result.errors.push(`Failed to integrate "${serviceName}": ${msg}`);
    }
    return result;
  }

  async unintegrateService(serviceName: string): Promise<void> {
    const registered = this.integrated.get(serviceName);
    if (!registered) return;
    for (const toolName of registered) {
      toolRegistry.unregister(toolName);
      this.integratedTools.delete(toolName);
    }
    this.integrated.delete(serviceName);
  }

  getIntegratedServices(): string[] {
    return Array.from(this.integrated.keys());
  }

  isIntegrated(serviceName: string): boolean {
    return this.integrated.has(serviceName);
  }

  getIntegratedTools(): Map<string, IntegratedTool> {
    return new Map(this.integratedTools);
  }

  private extractToolEntries(exported: unknown, info: MCPServiceInfo): Array<[string, unknown]> {
    const entries: Array<[string, unknown]> = [];
    if (info.pattern === 'builder') {
      for (const toolName of info.toolNames) {
        entries.push([toolName, {
          name: toolName,
          description: `MCP tool: ${toolName} (from ${info.name})`,
          parameters: [],
          execute: async (_args: Record<string, unknown>) => ({
            success: false, output: '', error: `Tool ${toolName} requires MCP server runtime`,
          }),
        }]);
      }
    } else {
      const obj = exported as Record<string, unknown>;
      const toolsObj = (obj?.tools ?? obj) as Record<string, unknown>;
      for (const [key, val] of Object.entries(toolsObj)) {
        if (typeof val === 'object' && val !== null && 'execute' in (val as Record<string, unknown>)) {
          entries.push([key, val]);
        }
      }
    }
    return entries;
  }

  private wrapToolDefinition(toolDef: unknown, prefixedName: string): {
    name: string;
    description: string;
    parameters: { name: string; type: string; description: string; required: boolean }[];
    execute: (args: Record<string, string>) => Promise<{ success: boolean; output: string; error?: string }>;
  } {
    const def = toolDef as Record<string, unknown>;
    const rawParams = (def.parameters ?? {}) as Record<string, { type?: string; description?: string; required?: boolean }>;
    const parameters = Object.entries(rawParams).map(([name, p]) => ({
      name, type: p.type ?? 'string', description: p.description ?? '', required: p.required ?? false,
    }));
    const rawExecute = def.execute as ((args: Record<string, unknown>) => Promise<unknown>) | undefined;
    return {
      name: prefixedName,
      description: (def.description as string) ?? prefixedName,
      parameters,
      execute: async (args: Record<string, string>) => {
        if (!rawExecute) return { success: false, output: '', error: 'No execute function' };
        try {
          const result = await rawExecute(args);
          return { success: true, output: typeof result === 'string' ? result : JSON.stringify(result) };
        } catch (error: unknown) {
          return { success: false, output: '', error: getErrorMessage(error) };
        }
      },
    };
  }
}
