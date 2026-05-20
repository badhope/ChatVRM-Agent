import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import { configManager } from '../config/manager.js';
import { printSuccess, printError, printInfo } from '../ui/logo.js';
import { callLLM } from '../agent/llm-caller.js';
import { getErrorMessage } from '../utils/error-handling.js';

export const explainCommand = new Command('explain')
  .description('解释代码（文件、函数、概念）')
  .argument('<target>', '要解释的文件路径、代码片段或概念')
  .option('-l, --language <language>', '编程语言')
  .option('-d, --detail <level>', '详细程度 (brief/normal/detailed)', 'normal')
  .option('-m, --model <model>', '指定模型')
  .action(async (target, options) => {
    await configManager.init();

    let code = '';
    let context = '';

    // 判断是文件路径还是代码片段
    try {
      const stat = await fs.stat(target);
      if (stat.isFile()) {
        code = await fs.readFile(target, 'utf-8');
        context = `文件: ${target}`;
      }
    } catch {
      // 不是文件，当作代码片段或概念
      code = target;
      context = options.language ? `语言: ${options.language}` : '代码片段';
    }

    if (!code.trim()) {
      printError('没有可解释的内容');
      return;
    }

    // 截断过长的代码
    if (code.length > 10000) {
      code = code.slice(0, 10000) + '\n// ... [代码过长，已截断]';
    }

    const detailPrompts: Record<string, string> = {
      brief: '用1-2句话简洁解释',
      normal: '详细解释代码的功能、逻辑和关键点',
      detailed: '逐行解释代码，包括每个函数/变量的作用、设计模式、潜在问题和改进建议',
    };

    const prompt = `${detailPrompts[options.detail || 'normal']}以下代码：

${context}
\`\`\`
${code}
\`\`\`

请用中文解释。`;

    printInfo('正在分析代码...');

    try {
      const response = await callLLM([{ role: 'user', content: prompt }], {
        model: options.model,
      });
      console.log();
      console.log(response || '(无回复)');
    } catch (error: unknown) {
      printError(`解释失败: ${getErrorMessage(error)}`);
    }
  });
