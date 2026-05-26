/**
 * Settings Menu - Enhanced UI with prominent language selection
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { i18n, type Language } from '../i18n/index.js';
import { configManager } from '../config/manager.js';
import {
  printFancyTitle,
  printFancyDivider,
  printFancySuccess,
  ICONS,
} from './visual-enhanced.js';
import { showSuccessCelebration } from './error-handler.js';
import { printFancyCard } from './visual-enhanced.js';

// ============================================================
// Settings Menu
// ============================================================

export async function showSettingsMenu(): Promise<void> {
  // Initialize config and i18n
  await configManager.init();
  await i18n.init();

  let shouldExit = false;

  while (!shouldExit) {
    const currentLang = i18n.getLanguage();
    const languageName = i18n.getLanguageName(currentLang);

    console.clear();
    printFancyTitle('⚙️ Settings', 'Personal Assistant Configuration');

    // Show current language status prominently at the top
    printFancyDivider('🌐 Current Language', 'cyan');
    printFancyCard(
      languageName,
      [
        'Click below to change language',
        '',
        `${ICONS.success} Interface will update immediately`,
      ],
      '🌍'
    );
    console.log('');

    // Main settings menu
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: chalk.cyan('What would you like to configure?'),
        choices: [
          // Language Option - Most Prominent
          new inquirer.Separator(chalk.yellow.bold('  ─── 🌐 Language ───')),
          {
            name: `${ICONS.language} Change Language (Current: ${languageName})`,
            value: 'language',
          },
          
          // Other Settings
          new inquirer.Separator(chalk.yellow.bold('  ─── 🤖 AI Settings ───')),
          {
            name: `${ICONS.key} AI Provider & API Keys`,
            value: 'providers',
          },
          {
            name: `${ICONS.chat} Chat Settings`,
            value: 'chat',
          },
          {
            name: `${ICONS.brain} Memory Settings`,
            value: 'memory',
          },
          {
            name: `${ICONS.shield} Sandbox Permissions`,
            value: 'sandbox',
          },

          // Navigation
          new inquirer.Separator(chalk.yellow.bold('  ─── Actions ───')),
          {
            name: `${ICONS.home} Back to Main Menu`,
            value: 'back',
          },
        ],
        pageSize: 15,
      },
    ]);

    switch (answer.choice) {
      case 'language':
        await showLanguageSettings();
        break;
      case 'providers':
        await showProviderSettings();
        break;
      case 'chat':
        await showChatSettings();
        break;
      case 'memory':
        await showMemorySettings();
        break;
      case 'sandbox':
        await showSandboxSettings();
        break;
      case 'back':
        shouldExit = true;
        break;
    }
  }
}

// ============================================================
// Language Settings
// ============================================================

async function showLanguageSettings(): Promise<void> {
  const currentLang = i18n.getLanguage();
  const currentLangName = i18n.getLanguageName(currentLang);
  
  console.clear();
  printFancyTitle('🌐 Language Settings', 'Choose your preferred language');
  console.log('');

  const languages = i18n.getAvailableLanguages();
  
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'language',
      message: chalk.cyan('Select your language'),
      choices: languages.map((lang) => ({
        name: `${lang === currentLang ? chalk.green.bold('✓ ') : '  '}${i18n.getLanguageName(lang)}`,
        value: lang,
      })),
      default: currentLang,
    },
  ]);

  if (answer.language !== currentLang) {
    await i18n.setLanguage(answer.language as Language);
    
    const newLangName = i18n.getLanguageName(answer.language as Language);
    
    showSuccessCelebration('Language changed successfully!', [
      `From: ${currentLangName}`,
      `To: ${newLangName}`,
      'Interface language updated',
    ]);

    // Pause to show success message
    await inquirer.prompt([
      {
        type: 'input',
        name: 'continue',
        message: chalk.cyan('Press Enter to continue...'),
      },
    ]);
  }
}

// ============================================================
// Provider Settings (Placeholders)
// ============================================================

async function showProviderSettings(): Promise<void> {
  console.clear();
  printFancyTitle('🤖 AI Provider Settings', 'Configure your AI providers');
  console.log('');

  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: chalk.cyan('Provider Configuration'),
      choices: [
        { name: 'OpenAI', value: 'openai' },
        { name: 'Anthropic', value: 'anthropic' },
        { name: 'Google Gemini', value: 'google' },
        { name: 'Alibaba Bailian', value: 'aliyun' },
        { name: 'SiliconFlow', value: 'siliconflow' },
        { name: 'Zhipu AI', value: 'zhipu' },
        { name: 'Baidu Qianfan', value: 'baidu' },
        { name: 'DeepSeek', value: 'deepseek' },
        { name: 'Ollama (Local)', value: 'ollama' },
        { name: 'LM Studio (Local)', value: 'lmstudio' },
        new inquirer.Separator(),
        { name: '← Back', value: 'back' },
      ],
    },
  ]);

  if (answer.choice !== 'back') {
    const apiKey = await inquirer.prompt([
      {
        type: 'input',
        name: 'key',
        message: chalk.cyan(`Enter API Key for ${answer.choice}:`),
      },
    ]);

    if (apiKey.key.trim()) {
      await configManager.setApiKey(answer.choice as any, apiKey.key);
      printFancySuccess('API Key saved successfully!');
      
      await inquirer.prompt([
        {
          type: 'input',
          name: 'continue',
          message: chalk.cyan('Press Enter to continue...'),
        },
      ]);
    }
  }
}

// ============================================================
// Chat Settings (Placeholder)
// ============================================================

async function showChatSettings(): Promise<void> {
  console.clear();
  printFancyTitle('💬 Chat Settings', 'Configure chat options');
  console.log('');

  const currentConfig = configManager.getChatConfig();
  
  const answers = await inquirer.prompt([
    {
      type: 'number',
      name: 'temperature',
      message: chalk.cyan('Default Temperature:'),
      default: currentConfig.defaultTemperature,
      validate: (val) => val >= 0 && val <= 2 ? true : 'Temperature must be between 0 and 2',
    },
    {
      type: 'number',
      name: 'maxTokens',
      message: chalk.cyan('Default Max Tokens:'),
      default: currentConfig.defaultMaxTokens,
      validate: (val) => val >= 100 ? true : 'Max tokens must be at least 100',
    },
  ]);

  await configManager.updateChatConfig({
    defaultTemperature: answers.temperature,
    defaultMaxTokens: answers.maxTokens,
  });

  printFancySuccess('Chat settings saved!');

  await inquirer.prompt([
    {
      type: 'input',
      name: 'continue',
      message: chalk.cyan('Press Enter to continue...'),
    },
  ]);
}

// ============================================================
// Memory Settings (Placeholder)
// ============================================================

async function showMemorySettings(): Promise<void> {
  console.clear();
  printFancyTitle('🧠 Memory Settings', 'Configure memory options');
  console.log('');

  const currentConfig = configManager.getMemoryConfig();
  
  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'enabled',
      message: chalk.cyan('Enable Memory:'),
      default: currentConfig.enabled,
    },
    {
      type: 'number',
      name: 'maxMemories',
      message: chalk.cyan('Max Memories to Store:'),
      default: currentConfig.maxMemories,
    },
  ]);

  await configManager.updateMemoryConfig({
    enabled: answers.enabled,
    maxMemories: answers.maxMemories,
  });

  printFancySuccess('Memory settings saved!');

  await inquirer.prompt([
    {
      type: 'input',
      name: 'continue',
      message: chalk.cyan('Press Enter to continue...'),
    },
  ]);
}

// ============================================================
// Sandbox Settings (Placeholder)
// ============================================================

async function showSandboxSettings(): Promise<void> {
  console.clear();
  printFancyTitle('🛡️ Sandbox Settings', 'Configure security settings');
  console.log('');

  const currentConfig = configManager.getSandboxConfig();
  
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'level',
      message: chalk.cyan('Security Level:'),
      choices: [
        { name: 'Minimal (Most Secure)', value: 'minimal' },
        { name: 'Conservative', value: 'conservative' },
        { name: 'Balanced', value: 'balanced' },
        { name: 'Relaxed', value: 'relaxed' },
        { name: 'Extreme (Least Secure)', value: 'extreme' },
      ],
      default: currentConfig.level,
    },
  ]);

  await configManager.setSandboxLevel(answers.level as any);

  printFancySuccess('Sandbox settings saved!');

  await inquirer.prompt([
    {
      type: 'input',
      name: 'continue',
      message: chalk.cyan('Press Enter to continue...'),
    },
  ]);
}
