import { MCPDiscovery, type MCPServiceInfo } from './discovery.js';
import {
  MCPIntegration,
  type IntegrationResult,
} from './integration.js';

// ============================================================
// MCP Marketplace - Manager (high-level API)
// ============================================================

export interface MCPSearchResult {
  service: MCPServiceInfo;
  relevanceScore: number;
  matchedTools: string[];
}

export class MCPManager {
  private discovery: MCPDiscovery;
  private integration: MCPIntegration;

  constructor(
    discovery?: MCPDiscovery,
    integration?: MCPIntegration,
  ) {
    this.discovery = discovery ?? new MCPDiscovery();
    this.integration = integration ?? new MCPIntegration(this.discovery);
  }

  // -- Discovery --

  async search(
    query: string,
    options?: { category?: string; limit?: number },
  ): Promise<MCPSearchResult[]> {
    await this.discovery.discover();
    const lower = query.toLowerCase();
    const all = this.discovery.getAll();

    const scored: MCPSearchResult[] = all
      .filter((s) => {
        if (options?.category && s.category !== options.category) return false;
        return true;
      })
      .map((s) => {
        let score = 0;
        const matchedTools: string[] = [];

        if (s.name.toLowerCase().includes(lower)) score += 3;
        if (s.description.toLowerCase().includes(lower)) score += 1;

        for (const t of s.toolNames) {
          if (t.toLowerCase().includes(lower)) {
            score += 2;
            matchedTools.push(t);
          }
        }

        return { service: s, relevanceScore: score, matchedTools };
      })
      .filter((r) => r.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    if (options?.limit && options.limit > 0) {
      return scored.slice(0, options.limit);
    }
    return scored;
  }

  async list(options?: {
    category?: string;
    verbose?: boolean;
  }): Promise<MCPServiceInfo[]> {
    const all = await this.discovery.discover();
    if (!options?.category) return all;
    return all.filter((s) => s.category === options.category);
  }

  async info(serviceName: string): Promise<MCPServiceInfo | null> {
    await this.discovery.discover();
    return this.discovery.get(serviceName) ?? null;
  }

  // -- Integration --

  async enable(serviceName: string): Promise<IntegrationResult> {
    return this.integration.integrateService(serviceName);
  }

  async disable(serviceName: string): Promise<void> {
    return this.integration.unintegrateService(serviceName);
  }

  async enableCategory(category: string): Promise<IntegrationResult> {
    const services = this.discovery.getByCategory(category);
    const names = services.map((s) => s.name);
    return this.integration.integrate({ services: names });
  }

  async enableAll(): Promise<IntegrationResult> {
    return this.integration.integrate();
  }

  async disableAll(): Promise<void> {
    const integrated = this.integration.getIntegratedServices();
    for (const name of integrated) {
      await this.integration.unintegrateService(name);
    }
  }

  // -- Status --

  async status(): Promise<{
    total: number;
    enabled: number;
    categories: Record<string, { total: number; enabled: number }>;
    tools: number;
  }> {
    const all = await this.discovery.discover();
    const enabledNames = new Set(this.integration.getIntegratedServices());

    const categories: Record<string, { total: number; enabled: number }> = {};
    for (const s of all) {
      if (!categories[s.category]) {
        categories[s.category] = { total: 0, enabled: 0 };
      }
      categories[s.category].total++;
      if (enabledNames.has(s.name)) {
        categories[s.category].enabled++;
      }
    }

    const toolsMap = this.integration.getIntegratedTools();

    return {
      total: all.length,
      enabled: enabledNames.size,
      categories,
      tools: toolsMap.size,
    };
  }
}

export const mcpManager = new MCPManager();
