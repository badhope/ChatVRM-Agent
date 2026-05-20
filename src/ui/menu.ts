import chalk from 'chalk';
import inquirer from 'inquirer';

export interface MenuItem {
  label: string;
  value: string;
  description?: string;
  icon?: string;
}

export interface MenuGroup {
  title?: string;
  items: MenuItem[];
}

export interface GroupedMenuOptions {
  title?: string;
  showBack?: boolean;
  backLabel?: string;
  searchHint?: string;
}

/** Separator type for inquirer choices */
interface SeparatorChoice {
  type: 'separator';
  line: string;
}

/** Normal choice type for inquirer */
interface NormalChoice {
  name: string;
  value: string;
  short: string;
}

type Choice = SeparatorChoice | NormalChoice;

/** Create a separator choice safely */
function createSeparator(text: string): SeparatorChoice {
  return { type: 'separator', line: text };
}

export async function showGroupedMenu(
  groups: MenuGroup[],
  options: GroupedMenuOptions = {}
): Promise<string | null> {
  const {
    title = '菜单',
    showBack = false,
    backLabel = '← 返回上级',
  } = options;

  const choices: Choice[] = [];
  let globalIndex = 0; // 全局连续编号

  groups.forEach(group => {
    if (group.title) {
      choices.push(createSeparator(chalk.bold.yellow(`  ── ${group.title} ──`)));
    }

    group.items.forEach((item) => {
      const icon = item.icon ? `${item.icon} ` : '';
      const desc = item.description ? chalk.gray(` - ${item.description}`) : '';
      const num = globalIndex < 9 ? chalk.green(`${globalIndex + 1}.`) : chalk.dim(`${globalIndex + 1}.`);
      choices.push({
        name: `${num} ${icon}${item.label}${desc}`,
        value: item.value,
        short: item.label,
      });
      globalIndex++;
    });

    choices.push(createSeparator(''));
  });

  if (showBack) {
    choices.push({
      name: chalk.gray(`← ${backLabel}`),
      value: '__back__',
      short: backLabel,
    });
  }

  try {
    // inquirer accepts both Separator objects and normal choices
    const answers = await inquirer.prompt([{
      type: 'list',
      name: 'choice',
      message: chalk.bold.cyan(title),
      choices: choices as Array<{ name: string; value: string; short?: string } | { type: 'separator' }>,
      pageSize: 20,
      loop: false,
    }]);

    const result = (answers as { choice: string }).choice;
    if (result === '__back__') return null;
    return result;
  } catch {
    return null;
  }
}

export async function showProviderMenu(): Promise<string | null> {
  const groups: MenuGroup[] = [
    {
      title: '☁️ 海外平台',
      items: [
        { label: 'OpenAI', value: 'openai', description: 'GPT-5.5/5.4 系列', icon: '🤖' },
        { label: 'Anthropic Claude', value: 'anthropic', description: 'Claude 4.7/4.6 系列', icon: '🧠' },
        { label: 'Google Gemini', value: 'google', description: 'Gemini 3.1/2.5 系列', icon: '🔮' },
      ]
    },
    {
      title: '🇨🇳 国内平台',
      items: [
        { label: '阿里云百炼', value: 'aliyun', description: 'Qwen 3.6/3.5 系列', icon: '☁️' },
        { label: '硅基流动', value: 'siliconflow', description: 'DeepSeek-V4/Kimi', icon: '⚡' },
        { label: '智谱AI', value: 'zhipu', description: 'GLM-5.1/5 系列', icon: '📊' },
        { label: '百度千帆', value: 'baidu', description: 'ERNIE 5.1/5.0 系列', icon: '🔍' },
        { label: 'DeepSeek', value: 'deepseek', description: 'DeepSeek V4 系列', icon: '🚀' },
      ]
    },
    {
      title: '🏠 本地部署',
      items: [
        { label: 'Ollama', value: 'ollama', description: '本地模型运行', icon: '💻' },
        { label: 'LM Studio', value: 'lmstudio', description: '本地模型GUI', icon: '🖥️' },
      ]
    }
  ];

  return showGroupedMenu(groups, {
    title: '🎯 选择 AI 平台',
    showBack: true,
  });
}

export async function showMainMenu(): Promise<string | null> {
  const groups: MenuGroup[] = [
    {
      title: '🤖 AI 对话',
      items: [
        { label: '聊天对话', value: 'interactive', description: '进入交互式AI对话', icon: '💬' },
        { label: '快速提问', value: 'quick-ask', description: '单次快速提问', icon: '⚡' },
        { label: '搜索模型', value: 'suggest', description: '根据任务获取模型推荐', icon: '🔍' },
      ]
    },
    {
      title: '🤖 Agent',
      items: [
        { label: '执行任务', value: 'agent-run', description: '让Agent自动执行任务', icon: '🎯' },
      ]
    },
    {
      title: '📋 代码审查',
      items: [
        { label: '审查文件', value: 'review-file', description: '审查单个文件', icon: '📄' },
        { label: '审查目录', value: 'review-dir', description: '审查整个目录', icon: '📁' },
      ]
    },
    {
      title: '🔧 工具箱',
      items: [
        { label: '工具列表', value: 'tools-list', description: '查看可用工具', icon: '🛠️' },
        { label: '执行工具', value: 'tools-run', description: '执行指定工具', icon: '▶️' },
      ]
    },
    {
      title: '📁 文件管理',
      items: [
        { label: '读取文件', value: 'file-read', description: '读取文件内容', icon: '📖' },
        { label: '写入文件', value: 'file-write', description: '写入文件内容', icon: '✏️' },
        { label: '目录树', value: 'file-tree', description: '查看目录结构', icon: '🌳' },
      ]
    },
    {
      title: '🧠 记忆系统',
      items: [
        { label: '查看记忆', value: 'memory-view', description: '查看所有记忆', icon: '💭' },
        { label: '搜索记忆', value: 'memory-search', description: '搜索记忆内容', icon: '🔎' },
      ]
    },
    {
      title: '⚙️ 配置',
      items: [
        { label: '查看配置', value: 'config-view', description: '查看当前配置', icon: '📋' },
        { label: '设置密钥', value: 'config-key', description: '设置API密钥', icon: '🔑' },
        { label: '沙盒权限', value: 'config-sandbox', description: '查看/设置沙盒权限', icon: '🛡️' },
      ]
    },
    {
      title: 'ℹ️ 信息',
      items: [
        { label: '平台列表', value: 'list', description: '浏览支持的AI平台和模型', icon: '🌐' },
        { label: '配置状态', value: 'status', description: '检查API密钥配置状态', icon: '📊' },
        { label: '模型列表', value: 'models', description: '按价格排序查看所有模型', icon: '📈' },
      ]
    },
    {
      title: '📖 帮助',
      items: [
        { label: '交互式帮助', value: 'help', description: '多级目录引导式帮助', icon: '❓' },
      ]
    }
  ];

  return showGroupedMenu(groups, {
    title: '📋 DevFlow Agent 主菜单',
    showBack: false,
  });
}

export interface MenuConfig {
  title: string;
  items: MenuItem[];
  showBack?: boolean;
  backLabel?: string;
}

export async function showInteractiveMenu(config: MenuConfig): Promise<string | null> {
  const groups: MenuGroup[] = [{
    title: undefined,
    items: config.items
  }];

  return showGroupedMenu(groups, {
    title: config.title,
    showBack: config.showBack,
    backLabel: config.backLabel
  });
}
