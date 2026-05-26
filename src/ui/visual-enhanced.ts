/**
 * visual-enhanced.ts - 增强的可视化效果模块
 *
 * 提供炫酷的图标、动画、进度条、仪表板等可视化效果
 */

import chalk from 'chalk';
import os from 'os';
import { stripAnsi } from './display-utils.js';

// ============================================================
// Icon Library
// ============================================================

export const ICONS = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  question: '❓',
  star: '⭐',
  heart: '❤️',
  fire: '🔥',
  rocket: '🚀',
  sparkle: '✨',
  confetti: '🎉',

  // Actions
  play: '▶️',
  pause: '⏸️',
  stop: '⏹️',
  forward: '➡️',
  back: '⬅️',
  up: '⬆️',
  down: '⬇️',
  refresh: '🔄',
  download: '📥',
  upload: '📤',
  save: '💾',
  edit: '✏️',
  delete: '🗑️',
  copy: '📋',
  paste: '📎',

  // Files
  file: '📄',
  folder: '📁',
  image: '🖼️',
  code: '💻',
  pdf: '📑',
  zip: '📦',
  music: '🎵',
  video: '🎬',

  // AI
  brain: '🧠',
  robot: '🤖',
  thinking: '💭',
  chat: '💬',
  magic: '✨',
  lightbulb: '💡',

  // Tools
  wrench: '🔧',
  hammer: '🔨',
  gear: '⚙️',
  magnifier: '🔍',
  lock: '🔒',
  unlock: '🔓',
  key: '🔑',
  shield: '🛡️',

  // Navigation
  home: '🏠',
  menu: '📋',
  settings: '⚙️',
  help: '❓',
  search: '🔍',
  filter: '🔎',
  sort: '📊',
  language: '🌐',

  // Fun
  party: '🎉',
  cake: '🎂',
  gift: '🎁',
  trophy: '🏆',
  medal: '🥇',
  thumbsup: '👍',
  thumbsdown: '👎',
  clap: '👏',
};

// ==================== 炫酷动画效果 ====================

// 加载动画帧
export const LOADING_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
export const SPINNER_FRAMES = ['|', '/', '-', '\\'];
export const DOT_FRAMES = ['', '.', '..', '...'];
export const PROGRESS_FRAMES = ['▁', '▃', '▄', '▅', '▆', '▇', '█', '▇', '▆', '▅', '▄', '▃'];

// ==================== 颜色主题 ====================
type ChalkColor = 'green' | 'cyan' | 'yellow' | 'magenta' | 'red' | 'gray';

export const THEMES = {
  default: { primary: 'cyan' as ChalkColor, secondary: 'gray' as ChalkColor, success: 'green' as ChalkColor, warning: 'yellow' as ChalkColor, error: 'red' as ChalkColor },
  ocean: { primary: 'cyan' as ChalkColor, secondary: 'cyan' as ChalkColor, success: 'green' as ChalkColor, warning: 'yellow' as ChalkColor, error: 'red' as ChalkColor },
  forest: { primary: 'green' as ChalkColor, secondary: 'gray' as ChalkColor, success: 'cyan' as ChalkColor, warning: 'yellow' as ChalkColor, error: 'red' as ChalkColor },
  sunset: { primary: 'magenta' as ChalkColor, secondary: 'yellow' as ChalkColor, success: 'green' as ChalkColor, warning: 'yellow' as ChalkColor, error: 'red' as ChalkColor },
};

// ==================== 炫酷显示函数 ====================

/**
 * 炫酷标题显示（带装饰边框和渐变效果）
 */
export function printFancyTitle(title: string, subtitle?: string): void {
  const width = Math.min(stripAnsi(title).length + 20, 80);
  const line = '━'.repeat(width);

  console.log(chalk.cyan(`  ╭${line}╮`));
  console.log(chalk.cyan(`  │`), chalk.bold.cyan(title.padStart((width + stripAnsi(title).length) / 2).padEnd(width)), chalk.cyan(`│`));
  if (subtitle) {
    console.log(chalk.cyan(`  │`), chalk.gray(subtitle.padStart((width + stripAnsi(subtitle).length) / 2).padEnd(width)), chalk.cyan(`│`));
  }
  console.log(chalk.cyan(`  ╰${line}╯\n`));
}

/**
 * 炫酷分隔线（带装饰）
 */
export function printFancyDivider(label?: string, color: 'cyan' | 'green' | 'yellow' | 'magenta' = 'cyan'): void {
  const terminalWidth = process.stdout.columns || 80;
  const labelWidth = label ? stripAnsi(label).length + 4 : 0;
  const lineWidth = terminalWidth - labelWidth - 4;
  const leftWidth = Math.floor(lineWidth / 2);
  const rightWidth = lineWidth - leftWidth;

  const leftLine = '═'.repeat(Math.max(0, leftWidth));
  const rightLine = '═'.repeat(Math.max(0, rightWidth));

  // 安全地访问 chalk 颜色
  const colorFn = chalk[color as keyof typeof chalk] as (text: string) => string;
  const boldColorFn = (chalk as any)[color].bold as (text: string) => string;

  let output = colorFn(`  ═${leftLine}`);
  if (label) {
    output += boldColorFn(` ⟪ ${label} ⟫ `);
  }
  output += colorFn(`${rightLine}═`);

  console.log(output);
}

/**
 * 炫酷成功提示（带庆祝效果）
 */
export function printFancySuccess(message: string, details?: string): void {
  console.log(chalk.green.bold(`\n  ✅ ${ICONS.success} ${message}`));
  if (details) {
    console.log(chalk.green(`     ${details}\n`));
  }
}

/**
 * 炫酷错误提示（带建议）
 */
export function printFancyError(message: string, suggestion?: string): void {
  console.log(chalk.red.bold(`\n  ❌ ${ICONS.error} ${message}`));
  if (suggestion) {
    console.log(chalk.yellow(`     💡 建议: ${suggestion}\n`));
  }
}

/**
 * 炫酷信息提示
 */
export function printFancyInfo(message: string): void {
  console.log(chalk.cyan.bold(`\n  ℹ️ ${ICONS.info} ${message}\n`));
}

/**
 * 炫酷警告提示
 */
export function printFancyWarning(message: string): void {
  console.log(chalk.yellow.bold(`\n  ⚠️ ${ICONS.warning} ${message}\n`));
}

/**
 * 炫酷卡片显示
 */
export function printFancyCard(title: string, content: string[], icon?: string): void {
  const iconStr = icon ? `${icon} ` : '';

  console.log(chalk.cyan(`\n  ┌─────────────────────────────────────────────────┐`));
  console.log(chalk.cyan(`  │ `), chalk.bold.cyan(`${iconStr}${title}`), chalk.cyan(` `.repeat(Math.max(0, 48 - stripAnsi(title).length - (icon ? 2 : 0))), `│`));
  console.log(chalk.cyan(`  ├─────────────────────────────────────────────────┤`));

  content.forEach(line => {
    const padding = Math.max(0, 48 - stripAnsi(line).length);
    console.log(chalk.cyan(`  │ `), chalk.white(line), chalk.cyan(` `.repeat(padding), `│`));
  });

  console.log(chalk.cyan(`  └─────────────────────────────────────────────────┘\n`));
}

/**
 * 炫酷进度条（多风格）
 */
export interface FancyProgressOptions {
  style?: 'bar' | 'dots' | 'wave' | 'blocks';
  width?: number;
  label?: string;
  color?: 'green' | 'cyan' | 'yellow' | 'magenta';
  showPercent?: boolean;
  showCount?: boolean;
}

export function printFancyProgress(
  current: number,
  total: number,
  options: FancyProgressOptions = {}
): void {
  const {
    style = 'bar',
    width = 50,
    label = '',
    color = 'green',
    showPercent = true,
    showCount = true,
  } = options;

  const ratio = total > 0 ? Math.min(current / total, 1) : 0;
  const percent = Math.round(ratio * 100);
  const completed = Math.round(ratio * width);
  const remaining = width - completed;

  let progress = '';
  switch (style) {
    case 'bar':
      progress = chalk[color]('█'.repeat(completed)) + chalk.gray('░'.repeat(remaining));
      break;
    case 'blocks':
      const blockChars = ['▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];
      let blocks = '';
      for (let i = 0; i < completed; i++) {
        blocks += blockChars[Math.floor(Math.random() * blockChars.length)];
      }
      progress = chalk[color](blocks) + chalk.gray('░'.repeat(remaining));
      break;
    case 'wave':
      const waveChars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
      let wave = '';
      for (let i = 0; i < width; i++) {
        if (i < completed) {
          wave += waveChars[(i + Math.floor(Date.now() / 100)) % waveChars.length];
        } else {
          wave += '░';
        }
      }
      progress = chalk[color](wave);
      break;
    case 'dots':
      const dots = '●'.repeat(completed) + '○'.repeat(remaining);
      progress = chalk[color](dots);
      break;
  }

  let output = `  `;
  if (label) {
    output += chalk.cyan(label) + ' ';
  }
  output += `[${progress}]`;

  if (showPercent) {
    output += chalk.bold(` ${percent}%`);
  }
  if (showCount) {
    output += chalk.gray(` (${current}/${total})`);
  }

  console.log(output);
}

/**
 * 炫酷统计卡片（像仪表盘一样）
 */
export interface StatCard {
  label: string;
  value: string | number;
  icon?: string;
  color?: 'green' | 'cyan' | 'yellow' | 'magenta' | 'red';
  trend?: 'up' | 'down' | 'neutral';
}

export function printDashboard(stats: StatCard[]): void {
  console.log('\n  ' + chalk.cyan.bold('📊 数据仪表板'));
  console.log(chalk.gray('  ' + '─'.repeat(60)));

  stats.forEach(stat => {
    const color = stat.color || 'cyan';
    const icon = stat.icon || '📈';
    let trendIcon = '';
    if (stat.trend === 'up') {
      trendIcon = chalk.green('↑');
    } else if (stat.trend === 'down') {
      trendIcon = chalk.red('↓');
    }

    console.log(
      `  ${icon} ${chalk.bold.white(stat.label)}: ${chalk[color].bold(stat.value)} ${trendIcon}`
    );
  });

  console.log(chalk.gray('  ' + '─'.repeat(60)) + '\n');
}

/**
 * 炫酷列表项（带状态图标）
 */
export interface FancyListItem {
  title: string;
  description?: string;
  icon?: string;
  status?: 'done' | 'pending' | 'error' | 'warning' | 'info';
  tags?: string[];
}

export function printFancyList(items: FancyListItem[]): void {
  items.forEach((item, index) => {
    let icon = item.icon || '•';
    let titleColor = 'white';
    let descColor = 'gray';

    switch (item.status) {
      case 'done':
        icon = ICONS.success;
        titleColor = 'green';
        break;
      case 'pending':
        icon = '○';
        titleColor = 'yellow';
        break;
      case 'error':
        icon = ICONS.error;
        titleColor = 'red';
        break;
      case 'warning':
        icon = ICONS.warning;
        titleColor = 'yellow';
        break;
      case 'info':
        icon = ICONS.info;
        titleColor = 'cyan';
        break;
    }

    // 安全地访问 chalk 颜色
    const boldTitleFn = (chalk as any).bold[titleColor] as (text: string) => string;
    const descFn = (chalk as any)[descColor] as (text: string) => string;

    console.log(`  ${icon} ${boldTitleFn(item.title)}`);

    if (item.description) {
      console.log(`    ${descFn(item.description)}`);
    }

    if (item.tags && item.tags.length > 0) {
      const tags = item.tags.map(tag => chalk.bgCyan.black(` ${tag} `)).join(' ');
      console.log(`    ${tags}`);
    }

    if (index < items.length - 1) {
      console.log('');
    }
  });
}

/**
 * 炫酷面包屑导航
 */
export function printBreadcrumb(paths: string[]): void {
  const breadcrumb = paths.map((p, i) => {
    if (i === paths.length - 1) {
      return chalk.bold.cyan(p);
    }
    return chalk.gray(p);
  }).join(chalk.gray(' > '));

  console.log(chalk.gray(`\n  📍 ${breadcrumb}\n`));
}

/**
 * 炫酷欢迎消息（带 ASCII 艺术）
 */
export function printWelcome(): void {
  const asciiArt = `
  ██████╗ ███████╗██████╗ ███████╗██████╗  ██████╗ ███╗   ██╗ █████╗ ██╗     
  ██╔══██╗██╔════╝██╔══██╗██╔════╝██╔══██╗██╔═══██╗████╗  ██║██╔══██╗██║     
  ██████╔╝█████╗  ██████╔╝███████╗██████╔╝██║   ██║██╔██╗ ██║███████║██║     
  ██╔═══╝ ██╔══╝  ██╔══██╗╚════██║██╔══██╗██║   ██║██║╚██╗██║██╔══██║██║     
  ██║     ███████╗██║  ██║███████║██║  ██║╚██████╔╝██║ ╚████║██║  ██║███████╗
  ╚═╝     ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝
  `;

  console.log(chalk.cyan(asciiArt));

  printFancyTitle('Personal Assistant Agent', '您的智能 AI 助手');

  const stats: StatCard[] = [
    { label: 'AI 平台', value: '10+', icon: '🌐', color: 'cyan' },
    { label: '可用工具', value: '20+', icon: '🛠️', color: 'green' },
    { label: '模型数量', value: '100+', icon: '🤖', color: 'magenta' },
    { label: '系统状态', value: '在线', icon: '✅', color: 'green' },
  ];

  printDashboard(stats);
}

/**
 * 炫酷帮助卡片网格
 */
export interface HelpCard {
  title: string;
  icon: string;
  items: string[];
}

export function printHelpGrid(cards: HelpCard[]): void {
  console.log('\n  ' + chalk.cyan.bold('📚 快速帮助'));
  console.log(chalk.gray('  ' + '─'.repeat(60)));

  cards.forEach(card => {
    console.log(`\n  ${card.icon} ${chalk.bold.white(card.title)}`);
    card.items.forEach(item => {
      console.log(`    • ${chalk.gray(item)}`);
    });
  });

  console.log(chalk.gray('\n  ' + '─'.repeat(60)) + '\n');
}

/**
 * 炫酷系统信息展示
 */
export function printSystemInfo(): void {
  const cpus = os.cpus();
  const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
  const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(1);
  const usedMem = (os.totalmem() / 1024 / 1024 / 1024 - os.freemem() / 1024 / 1024 / 1024).toFixed(1);

  const stats: StatCard[] = [
    { label: '操作系统', value: `${os.type()} ${os.release()}`, icon: '💻', color: 'cyan' },
    { label: 'CPU', value: `${cpus.length} 核`, icon: '⚡', color: 'yellow' },
    { label: '内存使用', value: `${usedMem}GB / ${totalMem}GB`, icon: '🧠', color: 'magenta' },
    { label: '可用内存', value: `${freeMem}GB`, icon: '📊', color: 'green' },
    { label: 'Node.js', value: process.version, icon: '🚀', color: 'cyan' },
  ];

  printDashboard(stats);
}
