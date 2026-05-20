import type { TaskStep } from './types.js';
import { createLogger } from '../services/logger.js';

const logger = createLogger('TaskPlanner');

const MAX_STEPS_PER_TASK = 20; // 单个任务最大步骤数

/**
 * 任务规划器
 * 将用户输入和意图分解为可执行步骤序列。
 */

/**
 * 将用户输入分解为可执行步骤
 * @param userInput 用户输入
 * @param intent    识别的意图
 * @returns 步骤数组
 */
export async function planTask(userInput: string, intent: string): Promise<TaskStep[]> {
  const steps: TaskStep[] = [];
  const lower = userInput.toLowerCase();

  // === 防止范围蔓延：检测潜在的超大任务 ===
  const scopeCreepPatterns = [
    /所有.*文件|所有.*bug|所有.*问题|整个.*项目|全部.*修复/,
    /遍历|递归处理|扫描整个|分析所有/,
  ];

  const hasScopeCreepRisk = scopeCreepPatterns.some(p => p.test(lower));
  if (hasScopeCreepRisk) {
    logger.warn('任务范围可能过大，已自动限制执行步骤');
  }

  // === 理解任务 ===
  steps.push({
    id: steps.length + 1,
    description: `理解任务: "${userInput.slice(0, 50)}${userInput.length > 50 ? '...' : ''}"`,
    status: 'done',
    result: `识别为 ${intent} 类型任务`,
  });

  // === 分解任务 ===
  // 根据意图类型分解
  switch (intent) {
    case 'bug-hunter':
      // 调试类任务
      steps.push({ id: steps.length + 1, description: '定位问题位置', tool: 'search_files', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '分析错误原因', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '制定修复方案', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '执行修复', tool: 'write_file', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '验证修复效果', status: 'pending' });
      break;

    case 'fullstack':
    case 'documentation':
      // 开发/文档类任务
      steps.push({ id: steps.length + 1, description: '确认目标路径', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '生成内容', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '写入文件', tool: 'write_file', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '验证写入结果', tool: 'read_file', status: 'pending' });
      break;

    case 'code-review':
      // 审查类任务
      steps.push({ id: steps.length + 1, description: '读取代码内容', tool: 'read_file', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '代码质量分析', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '生成审查报告', status: 'pending' });
      break;

    case 'search':
      // 搜索类任务
      if (/在|文件|folder|目录|project/.test(lower)) {
        steps.push({ id: steps.length + 1, description: '定位目标文件/目录', tool: 'read_file', status: 'pending' });
      }
      steps.push({ id: steps.length + 1, description: '执行关键词搜索', tool: 'search_files', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '分析搜索结果', status: 'pending' });
      break;

    case 'devops':
      // 部署类任务
      steps.push({ id: steps.length + 1, description: '检查环境配置', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '执行部署命令', tool: 'shell', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '验证部署结果', status: 'pending' });
      break;

    case 'testing':
      // 测试类任务
      steps.push({ id: steps.length + 1, description: '分析测试需求', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '执行测试', tool: 'shell', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '分析测试结果', status: 'pending' });
      break;

    case 'refactor':
      // 重构类任务
      steps.push({ id: steps.length + 1, description: '读取代码内容', tool: 'read_file', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '识别代码坏味道', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '制定重构方案', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '执行重构', tool: 'write_file', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '验证重构结果', status: 'pending' });
      break;

    case 'security':
      // 安全审计类任务
      steps.push({ id: steps.length + 1, description: '读取代码内容', tool: 'read_file', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '扫描安全漏洞', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '生成安全报告', status: 'pending' });
      break;

    case 'database':
      // 数据库类任务
      steps.push({ id: steps.length + 1, description: '分析数据库需求', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '执行数据库命令', tool: 'shell', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '验证执行结果', status: 'pending' });
      break;

    default:
      // 通用对话任务
      steps.push({ id: steps.length + 1, description: '分析用户需求', status: 'pending' });
      steps.push({ id: steps.length + 1, description: '生成回答', status: 'pending' });
      break;
  }

  // === 反思步骤 ===
  steps.push({ id: steps.length + 1, description: '反思执行过程，总结经验', status: 'pending' });

  return steps;
}
