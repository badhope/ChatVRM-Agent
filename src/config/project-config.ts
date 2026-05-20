import fs from 'fs/promises';
import path from 'path';

export interface ProjectConfig {
  /** 项目级自定义指令（注入到系统提示词） */
  instructions?: string;
  /** 项目描述 */
  description?: string;
  /** 技术栈 */
  techStack?: string[];
  /** 代码风格偏好 */
  codeStyle?: {
    indent?: 'spaces' | 'tabs';
    indentSize?: number;
    quoteStyle?: 'single' | 'double';
    semi?: boolean;
    trailingComma?: 'all' | 'es5' | 'none';
  };
  /** 工具权限 */
  toolPermissions?: {
    allowedTools?: string[];
    deniedTools?: string[];
    autoApproveTools?: string[];
  };
  /** 忽略的文件/目录 */
  ignorePatterns?: string[];
  /** 测试命令 */
  testCommand?: string;
  /** 构建命令 */
  buildCommand?: string;
  /** 自定义环境变量 */
  env?: Record<string, string>;
}

const CONFIG_FILES = [
  'DEVFLOW.md',      // 主配置文件（Markdown格式，易读）
  '.devflowrc',      // JSON/YAML配置
  '.devflow/config.json', // 目录级配置
];

export class ProjectConfigLoader {
  private cache: Map<string, ProjectConfig> = new Map();

  async load(projectDir: string): Promise<ProjectConfig> {
    if (this.cache.has(projectDir)) {
      return this.cache.get(projectDir)!;
    }

    const config: ProjectConfig = {};

    // 按优先级加载配置文件
    for (const filename of CONFIG_FILES) {
      const filePath = path.join(projectDir, filename);
      try {
        const content = await fs.readFile(filePath, 'utf-8');

        if (filename.endsWith('.md')) {
          // Markdown 格式：整个文件内容作为 instructions
          config.instructions = content.trim();
        } else if (filename.endsWith('.json')) {
          // JSON 格式
          const json = JSON.parse(content);
          Object.assign(config, json);
          if (json.instructions) {
            config.instructions = json.instructions;
          }
        } else {
          // .devflowrc 格式（YAML-like，简单 key=value）
          for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
              const key = trimmed.slice(0, eqIdx).trim();
              const value = trimmed.slice(eqIdx + 1).trim();
              switch (key) {
                case 'instructions': config.instructions = value; break;
                case 'description': config.description = value; break;
                case 'testCommand': config.testCommand = value; break;
                case 'buildCommand': config.buildCommand = value; break;
                case 'ignorePatterns': config.ignorePatterns = value.split(',').map(s => s.trim()); break;
              }
            }
          }
        }
      } catch {
        // 文件不存在，跳过
      }
    }

    // 如果没有 instructions 但有 description，生成默认 instructions
    if (!config.instructions && config.description) {
      config.instructions = `项目: ${config.description}\n技术栈: ${config.techStack?.join(', ') || '未指定'}`;
    }

    this.cache.set(projectDir, config);
    return config;
  }

  /**
   * 获取项目指令（用于注入系统提示词）
   */
  async getProjectInstructions(projectDir: string): Promise<string> {
    const config = await this.load(projectDir);
    let instructions = '';

    if (config.instructions) {
      instructions += `\n--- 项目指令 ---\n${config.instructions}\n`;
    }
    if (config.codeStyle) {
      const style = config.codeStyle;
      instructions += '\n--- 代码风格 ---\n';
      if (style.indent) instructions += `- 缩进: ${style.indent === 'tabs' ? 'Tab' : `${style.indentSize || 2}空格`}\n`;
      if (style.quoteStyle) instructions += `- 引号: ${style.quoteStyle === 'single' ? '单引号' : '双引号'}\n`;
      if (style.semi !== undefined) instructions += `- 分号: ${style.semi ? '使用' : '不使用'}\n`;
    }
    if (config.testCommand) {
      instructions += `\n测试命令: ${config.testCommand}\n`;
    }
    if (config.buildCommand) {
      instructions += `构建命令: ${config.buildCommand}\n`;
    }

    return instructions;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const projectConfigLoader = new ProjectConfigLoader();
