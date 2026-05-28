/**
 * demo.ts - UI 增强功能演示
 *
 * 展示所有炫酷的 UI 功能
 */

import chalk from 'chalk';
import {
  printWelcome,
  printFancyTitle,
  printFancyDivider,
  printFancyProgress,
  printFancyList,
  printSystemInfo,
  ICONS,
} from './visual-enhanced.js';
import { showSuccessCelebration, showFriendlyError, showWarningNotice } from './error-handler.js';
import { showMultiLevelMenu, getMainMenuGroups, runGuidedFlow } from './navigation.js';

/**
 * 运行完整的 UI 演示
 */
export async function runUIDemo(): Promise<void> {
  console.clear();

  // 1. 炫酷欢迎界面
  printWelcome();

  // 2. 系统信息仪表板
  printSystemInfo();

  // 3. 演示炫酷列表
  printFancyDivider('📋 功能演示', 'cyan');

  const listItems = [
    {
      title: '炫酷图标支持',
      description: '超过 50+ 精美的 emoji 图标',
      icon: '✨',
      status: 'done' as const,
      tags: ['UI', '视觉'],
    },
    {
      title: '智能错误处理',
      description: '自动识别错误类型并提供解决方案',
      icon: '🔧',
      status: 'done' as const,
      tags: ['错误', '用户体验'],
    },
    {
      title: '多级导航系统',
      description: '面包屑导航、历史记录、返回/前进',
      icon: '🧭',
      status: 'info' as const,
      tags: ['导航', '交互'],
    },
    {
      title: '傻瓜式引导',
      description: '步骤引导，新手友好',
      icon: '🎓',
      status: 'pending' as const,
      tags: ['引导', '新手'],
    },
  ];

  printFancyList(listItems);

  // 4. 演示进度条
  printFancyDivider('📊 进度条演示', 'green');

  console.log('');
  for (let i = 0; i <= 100; i += 10) {
    await new Promise(resolve => setTimeout(resolve, 100));
    printFancyProgress(i, 100, {
      label: '加载中',
      style: 'bar',
      color: 'green',
    });
  }
  console.log('\n');

  // 5. 演示成功庆祝
  showSuccessCelebration('UI 增强功能加载完成!', [
    '炫酷图标已就绪',
    '错误处理系统已启用',
    '导航系统已初始化',
    '引导流程已准备',
  ]);

  // 6. 演示错误提示
  printFancyDivider('❌ 错误提示演示', 'magenta');

  showFriendlyError(new Error('401 Unauthorized - Invalid API key'), {
    action: '连接 AI 平台',
    provider: 'OpenAI',
  });

  // 7. 演示警告提示
  showWarningNotice(
    '检测到网络连接不稳定',
    ['可能导致请求超时', '建议检查网络连接'],
    ['切换到本地模型', '稍后重试', '检查网络配置']
  );

  // 8. 演示菜单系统
  printFancyDivider('🎮 菜单演示', 'cyan');

  const choice = await showMultiLevelMenu(getMainMenuGroups(), {
    title: '🎯 演示菜单',
    showHome: true,
    showBack: false,
    showBreadcrumb: true,
  });

  if (choice === 'tutorial') {
    // 9. 演示傻瓜式引导
    await runGuidedFlow('新手教程', [
      {
        title: '欢迎',
        description: '这是一个傻瓜式引导流程，将帮助您快速上手!',
        type: 'info',
      },
      {
        title: '选择您的使用场景',
        description: '请选择您主要想用来做什么',
        type: 'select',
        options: [
          { label: '写代码', value: 'coding', description: 'AI 辅助编程' },
          { label: '写文章', value: 'writing', description: 'AI 写作助手' },
          { label: '学习', value: 'learning', description: 'AI 学习伙伴' },
          { label: '其他', value: 'other', description: '其他使用场景' },
        ],
      },
      {
        title: '输入您的名字',
        description: '让我更了解您',
        type: 'input',
        defaultValue: '用户',
      },
      {
        title: '确认配置',
        description: '确认以上信息正确',
        type: 'confirm',
        defaultValue: true,
      },
    ]);
  }

  // 10. 结束演示
  printFancyTitle('🎉 演示完成', '感谢您体验 Personal Assistant UI 增强功能!');

  console.log(chalk.cyan(`
  ${ICONS.star} 主要特性:
    • 炫酷的图标和动画效果
    • 友好的错误提示和解决方案
    • 多级导航和面包屑
    • 傻瓜式引导流程
    • 各种进度条和仪表板

  ${ICONS.rocket} 开始使用吧!
  `));
}

// 只有直接运行此文件时才执行演示
if (import.meta.url === `file://${process.argv[1]}`) {
  runUIDemo().catch(console.error);
}
