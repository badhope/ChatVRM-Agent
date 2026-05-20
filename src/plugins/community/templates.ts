// ============================================================
// Community Features - Plugin Templates Marketplace
// ============================================================

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface PluginTemplate {
  name: string;
  description: string;
  category: string;
  tags: string[];
  files: Record<string, string>;
  variables: TemplateVariable[];
}

export interface TemplateVariable {
  name: string;
  description: string;
  default: string;
  required: boolean;
  pattern?: RegExp;
}

export interface TemplateInstance {
  templateName: string;
  variables: Record<string, string>;
  outputDir: string;
  files: Record<string, string>;
}

function resolveHome(p: string): string {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

function defaultConfigDir(): string {
  return path.join(os.homedir(), '.devflow');
}

const kebabPattern = /^[a-z][a-z0-9-]*$/;

export const BUILT_IN_TEMPLATES: PluginTemplate[] = [
  {
    name: 'basic-tool', description: 'Simple plugin that registers a single tool for the agent',
    category: 'tool', tags: ['tool', 'starter', 'beginner'],
    variables: [
      { name: 'pluginName', description: 'Plugin name in kebab-case', default: 'my-tool', required: true, pattern: kebabPattern },
      { name: 'toolName', description: 'Tool name shown to the agent', default: 'do_thing', required: true },
      { name: 'description', description: 'What the tool does', default: 'Performs a useful action', required: true },
    ],
    files: {
      'manifest.json': `{"name":"{{pluginName}}","version":"0.1.0","description":"{{description}}","main":"index.js","keywords":["devflow","tool"]}`,
      'index.js': `export default {\n  manifest: { name: '{{pluginName}}', version: '0.1.0', description: '{{description}}' },\n  async activate(ctx) {\n    ctx.registerTool({\n      name: '{{toolName}}', description: '{{description}}',\n      parameters: { type: 'object', properties: { input: { type: 'string', description: 'Input value' } }, required: ['input'] },\n      async execute(args) { return { output: 'Processed: ' + args.input }; }\n    });\n    ctx.logger.info('{{pluginName}} activated');\n  }\n};`,
      'README.md': `# {{pluginName}}\n\n{{description}}\n\n## Usage\n\nRegisters the \`{{toolName}}\` tool.\n`,
    },
  },
  {
    name: 'multi-tool', description: 'Plugin that registers multiple related tools',
    category: 'tool', tags: ['tool', 'multi', 'advanced'],
    variables: [
      { name: 'pluginName', description: 'Plugin name in kebab-case', default: 'my-toolkit', required: true, pattern: kebabPattern },
      { name: 'description', description: 'Toolkit description', default: 'A collection of related tools', required: true },
    ],
    files: {
      'manifest.json': `{"name":"{{pluginName}}","version":"0.1.0","description":"{{description}}","main":"index.js","keywords":["devflow","tools"]}`,
      'index.js': `const tools = [\n  { name: 'search', description: 'Search local files', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, async execute(a) { return { results: ['file1.ts'] }; } },\n  { name: 'transform', description: 'Transform data', parameters: { type: 'object', properties: { data: { type: 'string' } }, required: ['data'] }, async execute(a) { return { result: a.data.toUpperCase() }; } },\n];\nexport default {\n  manifest: { name: '{{pluginName}}', version: '0.1.0', description: '{{description}}' },\n  async activate(ctx) { tools.forEach(t => ctx.registerTool(t)); ctx.logger.info('{{pluginName}}: ' + tools.length + ' tools registered'); }\n};`,
    },
  },
  {
    name: 'provider', description: 'LLM provider plugin for connecting to a custom model endpoint',
    category: 'provider', tags: ['provider', 'llm', 'ai'],
    variables: [
      { name: 'pluginName', description: 'Provider name in kebab-case', default: 'custom-provider', required: true, pattern: kebabPattern },
      { name: 'endpoint', description: 'Base URL for the model API', default: 'https://api.example.com/v1', required: true },
      { name: 'modelName', description: 'Model identifier', default: 'custom-model', required: true },
    ],
    files: {
      'manifest.json': `{"name":"{{pluginName}}","version":"0.1.0","description":"LLM provider for {{modelName}}","main":"index.js","keywords":["devflow","provider"]}`,
      'index.js': `export default {\n  manifest: { name: '{{pluginName}}', version: '0.1.0', description: 'LLM provider for {{modelName}}' },\n  async activate(ctx) {\n    ctx.registerTool({\n      name: 'chat_{{pluginName}}', description: 'Send a prompt to {{modelName}}',\n      parameters: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] },\n      async execute(args) {\n        const resp = await fetch('{{endpoint}}/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },\n          body: JSON.stringify({ model: '{{modelName}}', messages: [{ role: 'user', content: args.prompt }] }) });\n        return { response: (await resp.json()).choices?.[0]?.message?.content ?? '' };\n      }\n    });\n  }\n};`,
    },
  },
  {
    name: 'workflow', description: 'Workflow automation plugin with configurable pipeline steps',
    category: 'workflow', tags: ['workflow', 'automation', 'pipeline'],
    variables: [
      { name: 'pluginName', description: 'Workflow name in kebab-case', default: 'my-workflow', required: true, pattern: kebabPattern },
      { name: 'description', description: 'Workflow description', default: 'Automated multi-step workflow', required: true },
    ],
    files: {
      'manifest.json': `{"name":"{{pluginName}}","version":"0.1.0","description":"{{description}}","main":"index.js","keywords":["devflow","workflow"]}`,
      'index.js': `const steps = [\n  { name: 'validate', run: async (ctx) => ctx.logger.info('Validating...') },\n  { name: 'process', run: async (ctx) => ctx.logger.info('Processing...') },\n  { name: 'report', run: async (ctx) => ctx.logger.info('Reporting...') },\n];\nexport default {\n  manifest: { name: '{{pluginName}}', version: '0.1.0', description: '{{description}}' },\n  async activate(ctx) {\n    ctx.registerTool({ name: 'run_{{pluginName}}', description: '{{description}}', parameters: { type: 'object', properties: {} },\n      async execute() { for (const s of steps) await s.run(ctx); return { completed: steps.map(s => s.name) }; } });\n  }\n};`,
    },
  },
  {
    name: 'ui-extension', description: 'UI customization plugin for extending the DevFlow interface',
    category: 'ui', tags: ['ui', 'theme', 'extension'],
    variables: [
      { name: 'pluginName', description: 'Extension name in kebab-case', default: 'my-theme', required: true, pattern: kebabPattern },
      { name: 'description', description: 'UI extension description', default: 'Custom UI theme and display tweaks', required: true },
    ],
    files: {
      'manifest.json': `{"name":"{{pluginName}}","version":"0.1.0","description":"{{description}}","main":"index.js","keywords":["devflow","ui","theme"]}`,
      'index.js': `export default {\n  manifest: { name: '{{pluginName}}', version: '0.1.0', description: '{{description}}' },\n  async activate(ctx) {\n    ctx.setConfig({ theme: { primary: '#6366f1', secondary: '#8b5cf6', accent: '#06b6d4', background: '#0f172a' } });\n    ctx.logger.info('{{pluginName}} theme applied');\n  },\n  async deactivate() { console.log('{{pluginName}} deactivated'); }\n};`,
    },
  },
];

export class TemplateManager {
  private templates: Map<string, PluginTemplate> = new Map();
  private customTemplatesDir: string;

  constructor(configDir?: string) {
    const dir = configDir ? resolveHome(configDir) : defaultConfigDir();
    this.customTemplatesDir = path.join(dir, 'templates');
    for (const tpl of BUILT_IN_TEMPLATES) this.templates.set(tpl.name, tpl);
  }

  registerTemplate(template: PluginTemplate): void { this.templates.set(template.name, template); }
  unregisterTemplate(name: string): boolean { return this.templates.delete(name); }
  getTemplate(name: string): PluginTemplate | undefined { return this.templates.get(name); }

  listTemplates(options?: { category?: string }): PluginTemplate[] {
    const all = Array.from(this.templates.values());
    return options?.category ? all.filter((t) => t.category === options.category) : all;
  }

  getCategories(): string[] {
    const cats = new Set<string>();
    for (const tpl of this.templates.values()) cats.add(tpl.category);
    return Array.from(cats).sort();
  }

  resolveVariables(content: string, variables: Record<string, string>): string {
    return content.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '');
  }

  preview(name: string, variables?: Record<string, string>): Record<string, string> {
    const tpl = this.templates.get(name);
    if (!tpl) throw new Error(`Template "${name}" not found`);
    const vars = { ...variables };
    for (const v of tpl.variables) { if (!(v.name in vars)) vars[v.name] = v.default; }
    const resolved: Record<string, string> = {};
    for (const [filename, content] of Object.entries(tpl.files)) resolved[filename] = this.resolveVariables(content, vars);
    return resolved;
  }

  validateVariables(name: string, variables: Record<string, string>): { valid: boolean; errors: string[] } {
    const tpl = this.templates.get(name);
    if (!tpl) return { valid: false, errors: [`Template "${name}" not found`] };
    const errors: string[] = [];
    for (const v of tpl.variables) {
      if (v.required && !variables[v.name] && !v.default) errors.push(`Required variable "${v.name}" is missing`);
      if (v.pattern && variables[v.name] && !v.pattern.test(variables[v.name])) errors.push(`Variable "${v.name}" does not match pattern`);
    }
    return { valid: errors.length === 0, errors };
  }

  async instantiate(name: string, outputDir: string, variables: Record<string, string>): Promise<TemplateInstance> {
    const validation = this.validateVariables(name, variables);
    if (!validation.valid) throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
    const resolved = this.preview(name, variables);
    await fs.mkdir(outputDir, { recursive: true });
    for (const [filename, content] of Object.entries(resolved)) {
      await fs.writeFile(path.join(outputDir, filename), content, 'utf-8');
    }
    return { templateName: name, variables, outputDir, files: resolved };
  }

  async loadCustomTemplates(): Promise<number> {
    try {
      await fs.mkdir(this.customTemplatesDir, { recursive: true });
      const entries = await fs.readdir(this.customTemplatesDir, { withFileTypes: true });
      let count = 0;
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        try {
          const raw = await fs.readFile(path.join(this.customTemplatesDir, entry.name), 'utf-8');
          const tpl = JSON.parse(raw) as PluginTemplate;
          if (tpl.name && tpl.files) { this.templates.set(tpl.name, tpl); count++; }
        } catch (error) {
          // Skip invalid template files
        }
      }
      return count;
    } catch (error) {
      return 0;
    }
  }

  async saveCustomTemplate(template: PluginTemplate): Promise<void> {
    await fs.mkdir(this.customTemplatesDir, { recursive: true });
    await fs.writeFile(path.join(this.customTemplatesDir, `${template.name}.json`), JSON.stringify(template, null, 2), 'utf-8');
    this.templates.set(template.name, template);
  }
}

export const templateManager = new TemplateManager();
