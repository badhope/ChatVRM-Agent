import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../services/logger.js';

const logger = createLogger('ToolLibrary');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 从项目根目录的 mcp 目录加载工具定义
// __dirname = 项目根目录/dist/src/tools, 需要上3层才能到项目根目录
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const MCP_DIR = path.join(PROJECT_ROOT, 'mcp');

export interface ToolMetadata {
  name: string;
  version: string;
  description: string;
  category: string;
  author?: string;
  tools: string[];
  dependencies: string[];
  size: string;
  path: string;
}

export interface ToolIndex {
  version: string;
  lastUpdated: string;
  totalTools: number;
  categories: string[];
  tools: Record<string, ToolMetadata>;
}

interface ToolDefinition {
  name?: string;
  version?: string;
  description?: string;
  category?: string;
  author?: string;
  tools?: string[];
  dependencies?: string[];
  size?: string;
  load?: () => Promise<void> | void;
}

export class ToolLibrary {
  private static instance: ToolLibrary;
  private index: ToolIndex | null = null;

  private constructor() {}

  static getInstance(): ToolLibrary {
    if (!ToolLibrary.instance) {
      ToolLibrary.instance = new ToolLibrary();
    }
    return ToolLibrary.instance;
  }

  async loadIndex(): Promise<ToolIndex> {
    if (this.index) {
      return this.index;
    }

    const tools: Record<string, ToolMetadata> = {};
    const categories = new Set<string>();

    try {
      const entries = await fs.readdir(MCP_DIR, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name === 'node_modules') {
          continue;
        }

        const toolPath = path.join(MCP_DIR, entry.name, 'index.ts');
        const toolDefPath = path.join(MCP_DIR, entry.name, 'tool.json');

        try {
          const stats = await fs.stat(toolPath);
          let toolDef: ToolDefinition | null = null;

          if (await this.fileExists(toolDefPath)) {
            const content = await fs.readFile(toolDefPath, 'utf-8');
            toolDef = JSON.parse(content);
          } else {
            try {
              const module = await import(`file://${toolPath}`);
              toolDef = module.default || module;
            } catch (e: unknown) {
              toolDef = await this.parseToolFromSource(entry.name, toolPath);
              if (!toolDef) {
                logger.warn(`无法加载工具 ${entry.name}: ${e instanceof Error ? e.message : String(e)}`);
                continue;
              }
            }
          }

          if (toolDef) {
            const category = this.categorizeTool(entry.name);
            categories.add(category);

            const toolsInTool = toolDef.tools || [entry.name];

            tools[entry.name] = {
              name: toolDef.name || entry.name,
              version: toolDef.version || '1.0.0',
              description: toolDef.description || `工具包: ${entry.name}`,
              category,
              author: toolDef.author,
              tools: toolsInTool,
              dependencies: toolDef.dependencies || [],
              size: toolDef.size || 'unknown',
              path: toolPath
            };
          }
        } catch (e: unknown) {
          logger.warn(`跳过工具 ${entry.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } catch (error) {
      logger.error({ error }, '加载工具库索引失败');
    }

    this.index = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      totalTools: Object.keys(tools).length,
      categories: Array.from(categories).sort(),
      tools
    };

    return this.index;
  }

  private categorizeTool(name: string): string {
    const categoryMap: Record<string, string[]> = {
      'development': [
        'code-generator', 'code-review', 'code-rag', 'coding-workflow',
        'testing-toolkit', 'test-generator', 'debugging-workflow', 'refactoring-workflow',
        'dependency-analyzer', 'api-dev', 'core-dev-kit', 'backend-dev-kit', 'frontend-dev-kit',
        'fullstack-dev', 'qa-dev-kit', 'typescript', 'react'
      ],
      'devops': [
        'docker', 'kubernetes', 'aws', 'aws-dev', 'gitlab', 'github', 'gitee', 'bitbucket',
        'vercel', 'cloudflare', 'ci-cd', 'system-admin', 'terminal'
      ],
      'security': [
        'security-auditor', 'secrets', 'auth'
      ],
      'data': [
        'database', 'mongodb', 'redis', 'csv', 'json', 'yaml'
      ],
      'ai': [
        'agent-autonomous', 'agent-coordinator', 'agent-devkit', 'agent-memory',
        'agent-reflection', 'agent-persistence', 'agent-unified-toolkit'
      ],
      'web': [
        'web-search', 'web-crawler', 'browser-automation', 'puppeteer', 'proxy'
      ],
      'productivity': [
        'markdown', 'documentation', 'template', 'library-manager', 'libraries',
        'compression', 'encoding', 'diff'
      ],
      'analysis': [
        'performance-optimizer', 'monitoring', 'observability-mq', 'message-bus',
        'consistency-manager', 'search', 'search-tools', 'search-pdf-advanced'
      ],
      'utilities': [
        'datetime', 'math', 'regex', 'random', 'colors', 'filesystem', 'network',
        'ssh', 'sentry', 'aliyun', 'clarify', 'thinking'
      ],
      'design': [
        'ui-design-kit'
      ]
    };

    for (const [category, names] of Object.entries(categoryMap)) {
      if (names.includes(name)) {
        return category;
      }
    }

    return 'other';
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async parseToolFromSource(name: string, filePath: string): Promise<ToolDefinition | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      const nameMatch = content.match(/name:\s*['"]([^'"]+)['"]/);
      const versionMatch = content.match(/version:\s*['"]([^'"]+)['"]/);
      const descMatch = content.match(/description:\s*['"]([^'"]+)['"]/);
      const authorMatch = content.match(/author:\s*['"]([^'"]+)['"]/);

      const toolNames: string[] = [];
      const addToolRegex = /\.addTool\(\{[\s\S]*?name:\s*['"]([^'"]+)['"]/g;
      let match;
      while ((match = addToolRegex.exec(content)) !== null) {
        toolNames.push(match[1]);
      }

      return {
        name: nameMatch?.[1] || name,
        version: versionMatch?.[1] || '1.0.0',
        description: descMatch?.[1] || `工具包: ${name}`,
        author: authorMatch?.[1],
        tools: toolNames.length > 0 ? toolNames : [name],
        dependencies: [],
        size: 'unknown'
      };
    } catch {
      return null;
    }
  }

  async getTool(toolName: string): Promise<ToolMetadata | null> {
    const index = await this.loadIndex();
    return index.tools[toolName] || null;
  }

  async getToolsByCategory(category: string): Promise<ToolMetadata[]> {
    const index = await this.loadIndex();
    return Object.values(index.tools).filter(t => t.category === category);
  }

  async searchTools(keyword: string): Promise<ToolMetadata[]> {
    const index = await this.loadIndex();
    const lowerKeyword = keyword.toLowerCase();

    return Object.values(index.tools).filter(tool => {
      const toolList = Array.isArray(tool.tools) ? tool.tools : [];
      return (
        tool.name.toLowerCase().includes(lowerKeyword) ||
        tool.description.toLowerCase().includes(lowerKeyword) ||
        tool.category.toLowerCase().includes(lowerKeyword) ||
        toolList.some(t => t.toLowerCase().includes(lowerKeyword))
      );
    });
  }

  async getCategories(): Promise<string[]> {
    const index = await this.loadIndex();
    return index.categories;
  }

  async getAllTools(): Promise<ToolMetadata[]> {
    const index = await this.loadIndex();
    return Object.values(index.tools);
  }

  async getIndex(): Promise<ToolIndex> {
    return this.loadIndex();
  }

  clearCache(): void {
    this.index = null;
  }
}

export const toolLibrary = ToolLibrary.getInstance();

export default toolLibrary;
