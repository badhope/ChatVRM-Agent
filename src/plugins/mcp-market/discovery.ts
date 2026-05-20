import * as fs from 'fs/promises';
import * as path from 'path';
import type { Dirent } from 'fs';

// ============================================================
// MCP Marketplace - Service Discovery
// ============================================================

export interface MCPServiceInfo {
  name: string;
  version: string;
  description: string;
  category: string;
  author?: string;
  toolCount: number;
  toolNames: string[];
  path: string;
  pattern: 'builder' | 'plain-object';
  dependencies: string[];
  size?: string;
}

export interface DiscoveryOptions {
  mcpDir?: string;
  categories?: string[];
  refreshCache?: boolean;
}

const CATEGORY_MAP: Record<string, string[]> = {
  development: [
    'code-generator', 'code-review', 'code-rag', 'coding-workflow',
    'testing-toolkit', 'test-generator', 'debugging-workflow', 'refactoring-workflow',
    'dependency-analyzer', 'api-dev', 'core-dev-kit', 'backend-dev-kit', 'frontend-dev-kit',
    'fullstack-dev', 'qa-dev-kit', 'typescript', 'react',
  ],
  devops: [
    'docker', 'kubernetes', 'aws', 'aws-dev', 'gitlab', 'github', 'gitee', 'bitbucket',
    'vercel', 'cloudflare', 'ci-cd', 'system-admin', 'terminal',
  ],
  security: ['security-auditor', 'secrets', 'auth'],
  data: ['database', 'mongodb', 'redis', 'csv', 'json', 'yaml'],
  ai: ['agent-autonomous', 'agent-coordinator', 'agent-devkit', 'agent-memory',
    'agent-reflection', 'agent-persistence', 'agent-unified-toolkit'],
  web: ['web-search', 'web-crawler', 'browser-automation', 'puppeteer', 'proxy'],
  productivity: ['markdown', 'documentation', 'template', 'library-manager', 'libraries',
    'compression', 'encoding', 'diff'],
  analysis: ['performance-optimizer', 'monitoring', 'observability-mq', 'message-bus',
    'consistency-manager', 'search', 'search-tools', 'search-pdf-advanced'],
  utilities: ['datetime', 'math', 'regex', 'random', 'colors', 'filesystem', 'network',
    'ssh', 'sentry', 'aliyun', 'clarify', 'thinking'],
  design: ['ui-design-kit'],
};

function categorize(name: string): string {
  for (const [category, names] of Object.entries(CATEGORY_MAP)) {
    if (names.includes(name)) return category;
  }
  return 'other';
}

export class MCPDiscovery {
  private services: Map<string, MCPServiceInfo> = new Map();
  private scanned = false;

  async discover(options?: DiscoveryOptions): Promise<MCPServiceInfo[]> {
    if (this.scanned && !options?.refreshCache) {
      return this.filterByCategory(this.getAll(), options?.categories);
    }
    const mcpDir = path.resolve(options?.mcpDir ?? './mcp');
    this.services.clear();
    let entries: Dirent[];
    try {
      entries = await fs.readdir(mcpDir, { withFileTypes: true });
    } catch {
      return [];
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'node_modules') continue;
      const indexPath = path.join(mcpDir, entry.name, 'index.ts');
      let content: string;
      try {
        content = await fs.readFile(indexPath, 'utf-8');
      } catch {
        continue;
      }
      const info = this.parseServiceInfo(entry.name, indexPath, content);
      if (info) this.services.set(entry.name, info);
    }
    this.scanned = true;
    return this.filterByCategory(this.getAll(), options?.categories);
  }

  get(name: string): MCPServiceInfo | undefined {
    return this.services.get(name);
  }

  search(query: string): MCPServiceInfo[] {
    const lower = query.toLowerCase();
    return this.getAll().filter(
      (s) =>
        s.name.toLowerCase().includes(lower) ||
        s.description.toLowerCase().includes(lower) ||
        s.toolNames.some((t) => t.toLowerCase().includes(lower)),
    );
  }

  getByCategory(category: string): MCPServiceInfo[] {
    return this.getAll().filter((s) => s.category === category);
  }

  getCategories(): string[] {
    return Array.from(new Set(this.getAll().map((s) => s.category))).sort();
  }

  getAll(): MCPServiceInfo[] {
    return Array.from(this.services.values());
  }

  getDependencies(name: string): string[] {
    const info = this.services.get(name);
    if (!info) return [];
    const resolved = new Set<string>();
    const queue = [...info.dependencies];
    while (queue.length > 0) {
      const dep = queue.shift()!;
      if (resolved.has(dep)) continue;
      resolved.add(dep);
      const depInfo = this.services.get(dep);
      if (depInfo) {
        for (const d of depInfo.dependencies) {
          if (!resolved.has(d)) queue.push(d);
        }
      }
    }
    return Array.from(resolved);
  }

  getServicesWithTool(toolName: string): MCPServiceInfo[] {
    const lower = toolName.toLowerCase();
    return this.getAll().filter((s) =>
      s.toolNames.some((t) => t.toLowerCase() === lower),
    );
  }

  private parseServiceInfo(dirName: string, filePath: string, content: string): MCPServiceInfo | null {
    const isBuilder = content.includes('createMCPServer');
    const pattern: 'builder' | 'plain-object' = isBuilder ? 'builder' : 'plain-object';
    const nameMatch = content.match(/name:\s*['"]([^'"]+)['"]/);
    const versionMatch = content.match(/version:\s*['"]([^'"]+)['"]/);
    const descMatch = content.match(/description:\s*['"]([^'"]+)['"]/);
    const authorMatch = content.match(/author:\s*['"]([^'"]+)['"]/);
    const toolNames = this.extractToolNames(content, pattern);
    return {
      name: nameMatch?.[1] ?? dirName,
      version: versionMatch?.[1] ?? '1.0.0',
      description: descMatch?.[1] ?? `MCP service: ${dirName}`,
      category: categorize(dirName),
      author: authorMatch?.[1],
      toolCount: toolNames.length || 1,
      toolNames: toolNames.length > 0 ? toolNames : [dirName],
      path: filePath,
      pattern,
      dependencies: [],
    };
  }

  private extractToolNames(content: string, pattern: 'builder' | 'plain-object'): string[] {
    if (pattern === 'builder') {
      const names: string[] = [];
      const regex = /\.addTool\(\{[\s\S]*?name:\s*['"]([^'"]+)['"]/g;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(content)) !== null) names.push(m[1]);
      return names;
    }
    const names: string[] = [];
    const block = content.match(/export\s+const\s+tools\s*=\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/s);
    if (block) {
      const keyRegex = /^\s*(\w+)\s*:\s*\{/gm;
      let m: RegExpExecArray | null;
      while ((m = keyRegex.exec(block[1])) !== null) names.push(m[1]);
    }
    return names;
  }

  private filterByCategory(services: MCPServiceInfo[], categories?: string[]): MCPServiceInfo[] {
    if (!categories || categories.length === 0) return services;
    const set = new Set(categories);
    return services.filter((s) => set.has(s.category));
  }
}

export const mcpDiscovery = new MCPDiscovery();
