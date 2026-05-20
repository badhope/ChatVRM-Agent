import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { configManager } from '../../config/manager.js';
import { PROVIDER_INFO, PROVIDER_TYPE_LIST, type ProviderType } from '../../types.js';
import { printHeader, printSection, printSuccess, printInfo } from '../../ui/logo.js';
import { showMainMenu } from '../../ui/menu.js';
import { waitForEnter } from '../../utils/io.js';

async function isProviderConfigured(type: ProviderType): Promise<boolean> {
  const info = PROVIDER_INFO[type];
  if (!info.requiresApiKey) return true;
  return !!configManager.getApiKey(type);
}

async function showModelSuggestion() {
  printHeader();
  printSection('模型推荐');

  const { task } = await inquirer.prompt([{
    type: 'input',
    name: 'task',
    message: '描述你的任务（如：编程、写作、分析等）：',
    validate: (input: string) => input.trim() !== '' || '请输入任务描述'
  }]);

  const taskProfiles = [
    { keywords: ['代码', '编程', '程序', '函数', '算法', 'debug', 'code', 'react', 'python', 'javascript'], weight: 15, preferredCapabilities: ['chat', 'tools', 'thinking'] },
    { keywords: ['分析', '审查', 'review', 'audit', '检查', '优化'], weight: 12, preferredCapabilities: ['chat', 'thinking'] },
    { keywords: ['写作', '文章', '文档', 'write', 'essay', '报告'], weight: 10, preferredCapabilities: ['chat'] },
    { keywords: ['翻译', 'translate'], weight: 8, preferredCapabilities: ['chat'] },
    { keywords: ['对话', '聊天', 'chat', '问题', '解释'], weight: 6, preferredCapabilities: ['chat'] }
  ];

  const taskLower = task.toLowerCase();
  let bestMatch: { profile: typeof taskProfiles[0]; score: number } | null = null;

  taskProfiles.forEach(profile => {
    let score = 0;
    profile.keywords.forEach(keyword => {
      if (taskLower.includes(keyword)) score += profile.weight;
    });
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { profile, score };
    }
  });

  interface ModelScore { provider: ProviderType; providerName: string; model: typeof PROVIDER_INFO[ProviderType]['models'][0]; score: number; }
  const candidates: ModelScore[] = [];

  PROVIDER_TYPE_LIST.forEach(type => {
    if (!isProviderConfigured(type)) return;
    const info = PROVIDER_INFO[type];

    info.models.forEach(model => {
      let score = 50;
      if (bestMatch) {
        score += bestMatch.score;
        bestMatch.profile.preferredCapabilities.forEach(cap => {
          if (model.capabilities[cap as keyof typeof model.capabilities] as boolean) score += 5;
        });
      }
      const avgPrice = (model.pricing.inputPerMillion + model.pricing.outputPerMillion) / 2;
      score += Math.max(0, 20 - avgPrice * 10);
      candidates.push({ provider: type, providerName: info.displayName, model, score });
    });
  });

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 3);

  printHeader();
  printSection(`任务分析: ${task}`);

  console.log(chalk.bold('\n  🎯 推荐模型:\n'));

  top.forEach((item, index) => {
    const rank = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
    console.log(`  ${rank} ${chalk.bold.cyan(item.providerName)} / ${chalk.bold(item.model.name)}`);
    console.log(`     📊 评分: ${chalk.yellow(item.score.toFixed(1))}`);
    console.log(`     💰 输入: $${chalk.green(item.model.pricing.inputPerMillion)}/M | 输出: $${chalk.green(item.model.pricing.outputPerMillion)}/M`);
    console.log(`     📏 上下文: ${chalk.cyan((item.model.contextWindow / 1000).toFixed(0))}K tokens`);
    console.log(`     🔧 能力: ${Object.entries(item.model.capabilities).filter(([_k, v]) => v).map(([k]) => k).join(', ')}`);
    console.log();
  });

  if (top.length > 0) {
    printSuccess(`最佳选择: ${top[0].providerName} / ${top[0].model.name}`);
  }

  console.log('\n');
  await waitForEnter();
}

export const aiSuggestCommand = new Command('suggest')
  .description('模型推荐')
  .action(async () => {
    await configManager.init();
    await showModelSuggestion();
  });

export { showModelSuggestion };
