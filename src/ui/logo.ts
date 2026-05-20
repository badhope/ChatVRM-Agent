import chalk from 'chalk';
import ora from 'ora';

export const LOGO = `
${chalk.cyan('    ╔══════════════════════════════════════════════════════════╗')}
${chalk.cyan('    ║')}  ${chalk.yellow('██████╗ ███████╗██╗   ██╗███████╗██╗      ██████╗ ██╗   ██╗')}  ${chalk.cyan('║')}
${chalk.cyan('    ║')}  ${chalk.yellow('██╔══██╗██╔════╝██║   ██║██╔════╝██║     ██╔═══██╗╚██╗ ██╔╝')}  ${chalk.cyan('║')}
${chalk.cyan('    ║')}  ${chalk.yellow('██║  ██║█████╗  ██║   ██║█████╗  ██║     ██║   ██║ ╚████╔╝ ')}  ${chalk.cyan('║')}
${chalk.cyan('    ║')}  ${chalk.yellow('██║  ██║██╔══╝  ╚██╗ ██╔╝██╔══╝  ██║     ██║   ██║  ╚██╔╝  ')}  ${chalk.cyan('║')}
${chalk.cyan('    ║')}  ${chalk.yellow('██████╔╝███████╗ ╚████╔╝ ██║     ███████╗╚██████╔╝   ██║   ')}  ${chalk.cyan('║')}
${chalk.cyan('    ║')}  ${chalk.yellow('╚═════╝ ╚══════╝  ╚═══╝  ╚═╝     ╚══════╝ ╚═════╝    ╚═╝   ')}  ${chalk.cyan('║')}
${chalk.cyan('    ╚══════════════════════════════════════════════════════════╝')}
`;

export const SUBTITLE = chalk.gray('    可靠 · 诚实 · 可控的 AI 开发助手\n');

export const DIVIDER = chalk.cyan('    ──────────────────────────────────────────────────────────────\n');

export function printHeader(): void {
  console.clear();
  console.log(LOGO);
  console.log(SUBTITLE);
  console.log(DIVIDER);
}

export function printSection(title: string): void {
  console.log(chalk.bold.cyan(`\n  ▶ ${title}`));
  console.log(chalk.gray(`  ${'─'.repeat(title.length + 3)}\n`));
}

export function printSuccess(message: string): void {
  console.log(chalk.green(`  ✓ ${message}`));
}

export function printError(message: string): void {
  console.log(chalk.red(`  ✗ ${message}`));
}

export function printWarning(message: string): void {
  console.log(chalk.yellow(`  ⚠ ${message}`));
}

export function printInfo(message: string): void {
  console.log(chalk.blue(`  ℹ ${message}`));
}

/** 创建 spinner（非 TTY 返回 null） */
export function createSpinner(text: string): ReturnType<typeof ora> | null {
  return process.stdin.isTTY ? ora(text).start() : null;
}
