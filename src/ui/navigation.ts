/**
 * navigation.ts - 增强的导航系统
 *
 * 提供多级菜单、面包屑导航、返回/前进历史、傻瓜式引导等功能
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import { printBreadcrumb, printFancyDivider, ICONS } from './visual-enhanced.js';

// ==================== 导航历史记录 ====================
interface NavHistoryItem {
  title: string;
  value: string;
  timestamp: number;
}

export class NavigationHistory {
  private history: NavHistoryItem[] = [];
  private currentIndex = -1;
  private readonly maxHistory = 50;

  push(title: string, value: string): void {
    // 清除当前位置之后的历史
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    this.history.push({ title, value, timestamp: Date.now() });
    this.currentIndex = this.history.length - 1;

    // 限制历史记录长度
    if (this.history.length > this.maxHistory) {
      this.history.shift();
      this.currentIndex--;
    }
  }

  back(): NavHistoryItem | null {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return this.history[this.currentIndex];
    }
    return null;
  }

  forward(): NavHistoryItem | null {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      return this.history[this.currentIndex];
    }
    return null;
  }

  canGoBack(): boolean {
    return this.currentIndex > 0;
  }

  canGoForward(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  getCurrent(): NavHistoryItem | null {
    return this.history[this.currentIndex] || null;
  }

  getBreadcrumb(): string[] {
    return this.history.slice(0, this.currentIndex + 1).map(h => h.title);
  }

  clear(): void {
    this.history = [];
    this.currentIndex = -1;
  }
}

// ==================== 多级菜单系统 ====================
export interface MenuItem {
  value: string;
  label: string;
  description?: string;
  icon?: string;
  disabled?: boolean;
  children?: MenuGroup;
}

export interface MenuGroup {
  title?: string;
  items: MenuItem[];
}

export interface NavigationOptions {
  title?: string;
  showBack?: boolean;
  showHome?: boolean;
  showHistory?: boolean;
  showBreadcrumb?: boolean;
  enableSearch?: boolean;
}

// 全局导航历史实例
const navHistory = new NavigationHistory();

/**
 * 显示多级菜单
 */
export async function showMultiLevelMenu(
  groups: MenuGroup[],
  options: NavigationOptions = {}
): Promise<string | null> {
  const {
    title = '菜单',
    showBack = true,
    showHome = true,
    showHistory = false,
    showBreadcrumb = true,
  } = options;

  // 显示面包屑导航
  if (showBreadcrumb) {
    const breadcrumb = navHistory.getBreadcrumb();
    if (breadcrumb.length > 0) {
      printBreadcrumb(breadcrumb);
    }
  }

  // 构建菜单项
  const choices: Array<{ name: string; value: string; short?: string; disabled?: boolean } | { type: 'separator'; line?: string }> = [];

  // 添加导航选项
  const navChoices: Array<{ name: string; value: string; short?: string }> = [];

  if (showHome) {
    navChoices.push({
      name: `${ICONS.home} 返回主页`,
      value: '__home__',
      short: '主页',
    });
  }

  if (showBack && navHistory.canGoBack()) {
    const prev = navHistory.back();
    if (prev) {
      navHistory.forward(); // 恢复位置
      navChoices.push({
        name: `${ICONS.back} 返回上级`,
        value: '__back__',
        short: '返回',
      });
    }
  }

  if (showHistory && navHistory.canGoForward()) {
    navChoices.push({
      name: `${ICONS.forward} 前进`,
      value: '__forward__',
      short: '前进',
    });
  }

  if (navChoices.length > 0) {
    choices.push(new inquirer.Separator(chalk.yellow('  ─── 导航 ───')));
    choices.push(...navChoices);
  }

  // 添加菜单组
  groups.forEach(group => {
    if (group.title) {
      choices.push(new inquirer.Separator(chalk.yellow(`  ─── ${group.title} ───`)));
    }

    group.items.forEach(item => {
      const icon = item.icon ? `${item.icon} ` : '';
      const desc = item.description ? chalk.gray(` - ${item.description}`) : '';

      choices.push({
        name: `${icon}${item.label}${desc}`,
        value: item.value,
        short: item.label,
        disabled: item.disabled,
      });
    });
  });

  // 显示分隔线
  printFancyDivider(title, 'cyan');

  try {
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: chalk.cyan.bold('请选择:'),
        choices,
        pageSize: 20,
        loop: false,
      },
    ]);

    const choice = answer.choice as string;

    // 处理导航命令
    switch (choice) {
      case '__back__':
        return '__back__';
      case '__home__':
        navHistory.clear();
        return '__home__';
      case '__forward__':
        return '__forward__';
      default:
        // 查找选中的项并添加到历史记录
        for (const group of groups) {
          const found = group.items.find(i => i.value === choice);
          if (found) {
            navHistory.push(found.label, found.value);
          }
        }
        return choice;
    }
  } catch {
    return null;
  }
}

// ==================== 傻瓜式引导界面 ====================
export interface GuidedStep {
  title: string;
  description: string;
  type: 'info' | 'input' | 'confirm' | 'select';
  options?: { label: string; value: string; description?: string }[];
  defaultValue?: unknown;
  validate?: (input: string) => boolean | string;
}

export interface GuidedFlowResult {
  success: boolean;
  cancelled: boolean;
  data: Record<string, unknown>;
}

/**
 * 傻瓜式引导流程
 */
export async function runGuidedFlow(
  flowTitle: string,
  steps: GuidedStep[]
): Promise<GuidedFlowResult> {
  const result: GuidedFlowResult = {
    success: false,
    cancelled: false,
    data: {},
  };

  printFancyDivider(`🚀 ${flowTitle}`, 'magenta');
  console.log(chalk.gray(`  共 ${steps.length} 步，按 Ctrl+C 取消\n`));

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // 显示步骤进度
    console.log(chalk.cyan.bold(`\n  步骤 ${i + 1}/${steps.length}: ${step.title}`));
    console.log(chalk.gray(`  ${step.description}\n`));

    try {
      switch (step.type) {
        case 'info':
          // 只是显示信息，等待用户确认
          await inquirer.prompt([
            {
              type: 'confirm',
              name: 'continue',
              message: chalk.yellow('了解了，继续下一步?'),
              default: true,
            },
          ]);
          break;

        case 'input': {
          const inputAnswer = await inquirer.prompt([
            {
              type: 'input',
              name: 'value',
              message: chalk.cyan('请输入:'),
              default: step.defaultValue as string,
              validate: step.validate,
            },
          ]);
          result.data[`step_${i}`] = inputAnswer.value;
          break;
        }

        case 'confirm': {
          const confirmAnswer = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'value',
              message: chalk.cyan('确认?'),
              default: step.defaultValue as boolean,
            },
          ]);
          result.data[`step_${i}`] = confirmAnswer.value;
          break;
        }

        case 'select':
          if (step.options) {
            const selectAnswer = await inquirer.prompt([
              {
                type: 'list',
                name: 'value',
                message: chalk.cyan('请选择:'),
                choices: step.options.map(opt => ({
                  name: opt.description ? `${opt.label} - ${chalk.gray(opt.description)}` : opt.label,
                  value: opt.value,
                })),
              },
            ]);
            result.data[`step_${i}`] = selectAnswer.value;
          }
          break;
      }
    } catch {
      result.cancelled = true;
      console.log(chalk.yellow('\n  已取消引导流程\n'));
      return result;
    }
  }

  result.success = true;

  console.log(chalk.green.bold(`\n  ${ICONS.success} 引导完成!\n`));

  return result;
}

// ==================== 快捷命令帮助 ====================
export interface QuickCommand {
  key: string;
  description: string;
  icon: string;
  action: () => Promise<void>;
}

export function showQuickCommandsHelp(commands: QuickCommand[]): void {
  console.log(chalk.gray('\n  快捷键:'));
  commands.forEach(cmd => {
    console.log(chalk.cyan(`    ${cmd.icon} [${cmd.key}] ${cmd.description}`));
  });
  console.log('');
}

// ==================== 导出导航历史实例 ====================
export function getNavigationHistory(): NavigationHistory {
  return navHistory;
}

// ==================== 示例主菜单 ====================
export function getMainMenuGroups(): MenuGroup[] {
  return [
    {
      title: '🤖 AI 功能',
      items: [
        {
          value: 'chat',
          label: '智能对话',
          description: '与 AI 进行自然对话',
          icon: '💬',
        },
        {
          value: 'quick_ask',
          label: '快速提问',
          description: '单次快速提问',
          icon: '⚡',
        },
        {
          value: 'agent',
          label: 'AI 助手',
          description: '让 AI 自动完成任务',
          icon: '🎯',
        },
      ],
    },
    {
      title: '📁 文件操作',
      items: [
        {
          value: 'file_read',
          label: '读取文件',
          description: '查看文件内容',
          icon: '📖',
        },
        {
          value: 'file_write',
          label: '写入文件',
          description: '创建或编辑文件',
          icon: '✏️',
        },
        {
          value: 'file_explorer',
          label: '文件浏览',
          description: '浏览和管理文件',
          icon: '🌳',
        },
      ],
    },
    {
      title: '⚙️ 系统设置',
      items: [
        {
          value: 'config',
          label: '配置管理',
          description: '查看和修改配置',
          icon: '🔧',
        },
        {
          value: 'providers',
          label: 'AI 平台',
          description: '管理 AI 平台和密钥',
          icon: '🌐',
        },
        {
          value: 'about',
          label: '关于',
          description: '查看版本和信息',
          icon: 'ℹ️',
        },
      ],
    },
    {
      title: '❓ 帮助',
      items: [
        {
          value: 'help',
          label: '帮助文档',
          description: '查看使用帮助',
          icon: '📚',
        },
        {
          value: 'tutorial',
          label: '新手教程',
          description: '傻瓜式引导教程',
          icon: '🎓',
        },
      ],
    },
  ];
}
