import inquirer from 'inquirer';
import chalk from 'chalk';
import type { HelpTopic } from './help-data.js';
import { HELP_TREE } from './help-data.js';

// Re-export 类型
export type { HelpTopic };

/** Sentinel value for "go back" action in help navigation */
const GO_BACK_SENTINEL = '__go_back__';

/** Type guard to check if a value is a valid HelpTopic (not the go-back sentinel) */
function isHelpTopic(value: HelpTopic | typeof GO_BACK_SENTINEL): value is HelpTopic {
  return value !== GO_BACK_SENTINEL;
}

async function showHelpLevel(topics: HelpTopic[], title: string): Promise<HelpTopic | null> {
  const choices = topics.map((t) => ({
    name: t.description ? `${t.title}  ${chalk.gray(t.description)}` : t.title,
    value: t as HelpTopic | typeof GO_BACK_SENTINEL,
    short: t.title,
  }));

  choices.push({
    name: chalk.gray('\u2190 返回上级'),
    value: GO_BACK_SENTINEL,
    short: '返回',
  });

  try {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'topic',
        message: chalk.bold.cyan(title),
        choices,
        pageSize: 15,
        loop: false,
      },
    ]);

    const result = (answers as { topic: HelpTopic | typeof GO_BACK_SENTINEL }).topic;
    return isHelpTopic(result) ? result : null;
  } catch {
    return null;
  }
}

function showContent(topic: HelpTopic): void {
  console.log();
  console.log(chalk.bold.cyan(`  ${topic.title}`));
  console.log(chalk.gray('  ' + '\u2500'.repeat(40)));
  console.log();

  if (topic.content) {
    const lines = topic.content.split('\n');
    for (const line of lines) {
      if (line.startsWith('\uD83D\uDCA1')) {
        console.log(chalk.yellow(`  ${line}`));
      } else if (line.startsWith('  \u2022')) {
        console.log(chalk.white(`  ${line}`));
      } else if (line.startsWith('  personal-assistant') || line.startsWith('  ')) {
        const cmdMatch = line.match(/^( {2})(personal-assistant\s+\S+)(.*)/);
        if (cmdMatch) {
          console.log(`  ${chalk.green(cmdMatch[2])}${chalk.gray(cmdMatch[3])}`);
        } else {
          console.log(chalk.white(`  ${line}`));
        }
      } else if (line.match(/^\d+\./)) {
        console.log(chalk.white(`  ${line}`));
      } else {
        console.log(chalk.gray(`  ${line}`));
      }
    }
  }

  console.log();
}

export async function interactiveHelp(): Promise<void> {
  let currentTopics = HELP_TREE;
  let title = '\uD83D\uDCD6 帮助中心 - 选择类别';
  const stack: { topics: HelpTopic[]; title: string }[] = [];

  while (true) {
    const selected = await showHelpLevel(currentTopics, title);

    if (selected === null) {
      if (stack.length > 0) {
        const prev = stack.pop()!;
        currentTopics = prev.topics;
        title = prev.title;
        continue;
      }
      return;
    }

    if (selected.children && selected.children.length > 0) {
      stack.push({ topics: currentTopics, title });
      currentTopics = selected.children;
      title = selected.title;
      continue;
    }

    showContent(selected);

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '接下来',
        choices: [
          { name: '\u2190 返回上级目录', value: 'back' },
          { name: '\u2190 返回帮助首页', value: 'home' },
          { name: '\u2715 退出帮助', value: 'exit' },
        ],
      },
    ]);

    if (action === 'exit') {
      return;
    } else if (action === 'home') {
      currentTopics = HELP_TREE;
      title = '\uD83D\uDCD6 帮助中心 - 选择类别';
      stack.length = 0;
    }
  }
}

export function printQuickHelp(): void {
  console.log();
  console.log(chalk.bold.cyan('  Personal-Assistant Agent 快速帮助'));
  console.log(chalk.gray('  ' + '\u2500'.repeat(30)));
  console.log();
  console.log('  常用命令:');
  console.log(`  ${chalk.green('personal-assistant')}                    交互式主菜单`);
  console.log(`  ${chalk.green('personal-assistant chat ask "问题"')}    快速提问`);
  console.log(`  ${chalk.green('personal-assistant agent run "任务"')}   Agent执行任务`);
  console.log(`  ${chalk.green('personal-assistant help')}              交互式帮助`);
  console.log(`  ${chalk.green('personal-assistant --help')}            命令行帮助`);
  console.log();
  console.log(chalk.gray('  \uD83D\uDCA1 输入 personal-assistant help 进入多级帮助目录'));
  console.log();
}
