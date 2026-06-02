import chalk from 'chalk';

export function printHeader() {
  console.log('');
  console.log(chalk.cyan.bold('┌──────────────────────────────────────────────────┐'));
  console.log(chalk.cyan.bold('│         Personal-Assistant Agent CLI v2.0        │'));
  console.log(chalk.cyan.bold('│     AI-powered personal assistant with pipeline   │'));
  console.log(chalk.cyan.bold('└──────────────────────────────────────────────────┘'));
  console.log('');
}

export function printSuccess(msg: string) {
  console.log(`${chalk.green('✓')} ${msg}`);
}

export function printError(msg: string) {
  console.log(`${chalk.red('✗')} ${msg}`);
}

export function printWarning(msg: string) {
  console.log(`${chalk.yellow('⚠')} ${msg}`);
}

export function printInfo(msg: string) {
  console.log(`${chalk.blue('ℹ')} ${msg}`);
}

export function printStep(msg: string) {
  console.log(`  ${chalk.dim('→')} ${msg}`);
}