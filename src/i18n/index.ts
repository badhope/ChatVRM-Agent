/**
 * i18n - Internationalization System
 * Handles translations and language switching
 */

import { configManager } from '../config/manager.js';

// ============================================================
// Language Type
// ============================================================

export type Language = 'en' | 'zh';

// ============================================================
// English Translations
// ============================================================

const enTranslations: Record<string, string> = {
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.ok': 'OK',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.back': 'Back',
  'common.next': 'Next',
  'common.previous': 'Previous',
  'common.finish': 'Finish',
  'common.loading': 'Loading...',
  'common.success': 'Success',
  'common.error': 'Error',
  'common.warning': 'Warning',
  'common.info': 'Information',
  'common.search': 'Search',
  'common.filter': 'Filter',
  'common.settings': 'Settings',
  'common.help': 'Help',
  'common.about': 'About',
  'common.exit': 'Exit',
  'common.language': 'Language',

  'menu.title': 'Personal Assistant',
  'menu.aiChat': 'AI Chat',
  'menu.quickAsk': 'Quick Question',
  'menu.agent': 'AI Agent',
  'menu.codeReview': 'Code Review',
  'menu.tools': 'Tools',
  'menu.fileManager': 'File Manager',
  'menu.memory': 'Memory',
  'menu.config': 'Settings',
  'menu.info': 'Information',
  'menu.help': 'Help',
  'menu.tutorials': 'Tutorials',

  'settings.title': 'Settings',
  'settings.language': '🌐 Language',
  'settings.languageDesc': 'Change interface language',
  'settings.languageSelect': 'Select Language',
  'settings.aiProvider': '🤖 AI Provider',
  'settings.apiKey': '🔑 API Keys',
  'settings.chat': '💬 Chat Settings',
  'settings.memory': '🧠 Memory Settings',
  'settings.sandbox': '🛡️ Sandbox',
  'settings.theme': '🎨 Theme',

  'language.en': '🇺🇸 English',
  'language.zh': '🇨🇳 中文',

  'welcome.title': 'Welcome to Personal Assistant!',
  'welcome.subtitle': 'Your intelligent AI helper',
  'welcome.quickStart': 'Quick Start',
  'welcome.tutorials': 'Tutorials',
  'welcome.whatCanIDo': 'What can I do?',
  'welcome.tips': 'Tips',

  'chat.title': 'AI Chat',
  'chat.welcomeMessage': 'Hello! How can I help you today?',
  'chat.inputPlaceholder': 'Type your message...',
  'chat.send': 'Send',
  'chat.thinking': 'Thinking...',
  'chat.typing': 'Typing...',
  'chat.history': 'Chat History',
  'chat.clearHistory': 'Clear History',
  'chat.newChat': 'New Chat',

  'agent.title': 'AI Agent',
  'agent.thinking': 'Let me think about how to help you...',
  'agent.planning': 'Planning the steps...',
  'agent.executing': 'Executing the task...',
  'agent.complete': 'Task complete!',

  'tools.title': 'Available Tools',
  'tools.readFile': '📖 Read File',
  'tools.writeFile': '✏️ Write File',
  'tools.listDir': '📂 List Directory',
  'tools.fileTree': '🌳 File Tree',
  'tools.fileInfo': '📋 File Info',
  'tools.searchFiles': '🔍 Search Files',
  'tools.deleteFile': '🗑️ Delete File',
  'tools.shell': '💻 Shell Command',
  'tools.sysInfo': '💻 System Info',

  'errors.title': 'Error Occurred',
  'errors.network': 'Network Error',
  'errors.networkDesc': 'Please check your internet connection',
  'errors.auth': 'Authentication Error',
  'errors.authDesc': 'Please check your API key',
  'errors.permission': 'Permission Denied',
  'errors.permissionDesc': 'You don\'t have permission to do that',
  'errors.fileNotFound': 'File Not Found',
  'errors.fileNotFoundDesc': 'Please check the file path',
  'errors.config': 'Configuration Error',
  'errors.configDesc': 'Please check your settings',
  'errors.api': 'API Error',
  'errors.apiDesc': 'The AI service returned an error',
  'errors.unknown': 'Unknown Error',
  'errors.unknownDesc': 'Something went wrong',
  'errors.suggestion': 'Suggestion',
  'errors.tryAgain': 'Try Again',
  'errors.goBack': 'Go Back',
  'errors.contactSupport': 'Contact Support',

  'success.title': 'Success!',
  'success.saved': 'Configuration saved successfully',
  'success.updated': 'Updated successfully',
  'success.deleted': 'Deleted successfully',
  'success.created': 'Created successfully',
  'success.copied': 'Copied successfully',
};

// ============================================================
// Chinese Translations
// ============================================================

const zhTranslations: Record<string, string> = {
  'common.yes': '是',
  'common.no': '否',
  'common.ok': '确定',
  'common.cancel': '取消',
  'common.save': '保存',
  'common.back': '返回',
  'common.next': '下一步',
  'common.previous': '上一步',
  'common.finish': '完成',
  'common.loading': '加载中...',
  'common.success': '成功',
  'common.error': '错误',
  'common.warning': '警告',
  'common.info': '信息',
  'common.search': '搜索',
  'common.filter': '筛选',
  'common.settings': '设置',
  'common.help': '帮助',
  'common.about': '关于',
  'common.exit': '退出',
  'common.language': '语言',

  'menu.title': 'Personal Assistant',
  'menu.aiChat': 'AI 对话',
  'menu.quickAsk': '快速提问',
  'menu.agent': 'AI 助手',
  'menu.codeReview': '代码审查',
  'menu.tools': '工具',
  'menu.fileManager': '文件管理',
  'menu.memory': '记忆',
  'menu.config': '设置',
  'menu.info': '信息',
  'menu.help': '帮助',
  'menu.tutorials': '教程',

  'settings.title': '设置',
  'settings.language': '🌐 语言设置',
  'settings.languageDesc': '更改界面语言',
  'settings.languageSelect': '选择语言',
  'settings.aiProvider': '🤖 AI 提供商',
  'settings.apiKey': '🔑 API 密钥',
  'settings.chat': '💬 聊天设置',
  'settings.memory': '🧠 记忆设置',
  'settings.sandbox': '🛡️ 沙箱',
  'settings.theme': '🎨 主题',

  'language.en': '🇺🇸 English',
  'language.zh': '🇨🇳 中文',

  'welcome.title': '欢迎使用 Personal Assistant！',
  'welcome.subtitle': '您的智能 AI 助手',
  'welcome.quickStart': '快速开始',
  'welcome.tutorials': '教程',
  'welcome.whatCanIDo': '我能做什么？',
  'welcome.tips': '小贴士',

  'chat.title': 'AI 对话',
  'chat.welcomeMessage': '您好！今天我能帮您做什么？',
  'chat.inputPlaceholder': '输入您的消息...',
  'chat.send': '发送',
  'chat.thinking': '思考中...',
  'chat.typing': '输入中...',
  'chat.history': '聊天历史',
  'chat.clearHistory': '清空历史',
  'chat.newChat': '新对话',

  'agent.title': 'AI 助手',
  'agent.thinking': '让我想想如何帮助您...',
  'agent.planning': '正在规划步骤...',
  'agent.executing': '正在执行任务...',
  'agent.complete': '任务完成！',

  'tools.title': '可用工具',
  'tools.readFile': '📖 读取文件',
  'tools.writeFile': '✏️ 写入文件',
  'tools.listDir': '📂 列出目录',
  'tools.fileTree': '🌳 文件树',
  'tools.fileInfo': '📋 文件信息',
  'tools.searchFiles': '🔍 搜索文件',
  'tools.deleteFile': '🗑️ 删除文件',
  'tools.shell': '💻 Shell 命令',
  'tools.sysInfo': '💻 系统信息',

  'errors.title': '发生错误',
  'errors.network': '网络错误',
  'errors.networkDesc': '请检查您的网络连接',
  'errors.auth': '认证错误',
  'errors.authDesc': '请检查您的 API 密钥',
  'errors.permission': '权限不足',
  'errors.permissionDesc': '您没有权限执行此操作',
  'errors.fileNotFound': '文件未找到',
  'errors.fileNotFoundDesc': '请检查文件路径',
  'errors.config': '配置错误',
  'errors.configDesc': '请检查您的设置',
  'errors.api': 'API 错误',
  'errors.apiDesc': 'AI 服务返回了错误',
  'errors.unknown': '未知错误',
  'errors.unknownDesc': '出了点问题',
  'errors.suggestion': '建议',
  'errors.tryAgain': '重试',
  'errors.goBack': '返回',
  'errors.contactSupport': '联系支持',

  'success.title': '成功！',
  'success.saved': '配置保存成功',
  'success.updated': '更新成功',
  'success.deleted': '删除成功',
  'success.created': '创建成功',
  'success.copied': '复制成功',
};

// ============================================================
// Translation Store
// ============================================================

const translations: Record<Language, Record<string, string>> = {
  en: enTranslations,
  zh: zhTranslations,
};

// ============================================================
// i18n Class
// ============================================================

class I18n {
  private currentLanguage: Language = 'en';
  private initialized = false;

  /**
   * Initialize i18n with config
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    
    try {
      await configManager.init();
      this.currentLanguage = configManager.getLanguage();
    } catch {
      this.currentLanguage = 'en';
    }
    
    this.initialized = true;
  }

  /**
   * Get current language
   */
  getLanguage(): Language {
    return this.currentLanguage;
  }

  /**
   * Set current language and save to config
   */
  async setLanguage(language: Language): Promise<void> {
    this.currentLanguage = language;
    await configManager.setLanguage(language);
  }

  /**
   * Get all available languages
   */
  getAvailableLanguages(): Language[] {
    return ['en', 'zh'];
  }

  /**
   * Get translation by key
   */
  t(key: string, params?: Record<string, string | number>): string {
    let result = translations[this.currentLanguage][key];
    
    if (!result) {
      result = translations.en[key];
    }
    
    if (!result) {
      return key;
    }

    if (params) {
      return result.replace(/\{(\w+)\}/g, (match, param) => {
        return params[param]?.toString() || match;
      });
    }

    return result;
  }

  /**
   * Get language display name
   */
  getLanguageName(language: Language): string {
    if (language === 'en') {
      return '🇺🇸 English';
    }
    return '🇨🇳 中文';
  }
}

// Export singleton instance
export const i18n = new I18n();
export { translations };
