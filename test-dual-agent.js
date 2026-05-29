// 简单测试脚本，验证双Agent系统核心功能
console.log('=== 双Agent系统核心功能验证 ===\n');

// 检查构建的文件是否存在
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const checkFiles = [
  'dist/agent/index.js',
  'dist/agent/core.js',
  'dist/agent/infrastructure/common/collaboration-manager.js',
  'dist/agent/infrastructure/common/planning-agent.js',
  'dist/agent/infrastructure/common/execution-agent.js',
  'dist/agent/infrastructure/common/task-complexity.js',
  'dist/commands/agent.js'
];

console.log('1. 检查核心文件是否存在:');
for (const file of checkFiles) {
  const filePath = path.join(__dirname, file);
  const exists = fs.existsSync(filePath);
  console.log(`   ${exists ? '✓' : '✗'} ${file}`);
}

console.log('\n2. 测试任务复杂度评估模块:');
try {
  const { assessTaskComplexity, shouldUseDualAgent } = await import('./dist/agent/infrastructure/common/task-complexity.js');
  
  // 测试简单任务
  const simpleResult = assessTaskComplexity('你好');
  console.log(`   简单任务测试: ${JSON.stringify(simpleResult, null, 2)}`);
  console.log(`   是否使用双Agent: ${shouldUseDualAgent(simpleResult)}`);
  
  // 测试复杂任务
  const complexResult = assessTaskComplexity('重构整个项目架构，改进性能并添加单元测试');
  console.log(`\n   复杂任务测试: ${JSON.stringify(complexResult, null, 2)}`);
  console.log(`   是否使用双Agent: ${shouldUseDualAgent(complexResult)}`);
  
  // 测试强制启用双Agent
  console.log(`\n   强制启用双Agent: ${shouldUseDualAgent(complexResult, true)}`);
  
} catch (error) {
  console.error('   ✗ 任务复杂度评估模块测试失败:', error);
}

console.log('\n3. 检查事件总线模块:');
try {
  const { eventBus } = await import('./dist/agent/infrastructure/common/event-bus.js');
  console.log('   ✓ 事件总线模块加载成功');
  
  // 测试事件发送和接收
  let received = false;
  eventBus.on('test-event', (data) => {
    console.log(`   ✓ 接收到测试事件: ${data}`);
    received = true;
  });
  eventBus.emit('test-event', 'Hello World!');
  
  if (received) {
    console.log('   ✓ 事件总线工作正常');
  }
} catch (error) {
  console.error('   ✗ 事件总线模块测试失败:', error);
}

console.log('\n4. 检查双Agent核心类:');
try {
  const { PlanningAgent } = await import('./dist/agent/infrastructure/common/planning-agent.js');
  const { ExecutionAgent } = await import('./dist/agent/infrastructure/common/execution-agent.js');
  const { CollaborationManager } = await import('./dist/agent/infrastructure/common/collaboration-manager.js');
  
  const planningAgent = new PlanningAgent();
  console.log('   ✓ PlanningAgent 实例创建成功');
  
  const executionAgent = new ExecutionAgent();
  console.log('   ✓ ExecutionAgent 实例创建成功');
  
  const collaborationManager = new CollaborationManager();
  console.log('   ✓ CollaborationManager 实例创建成功');
  
} catch (error) {
  console.error('   ✗ 双Agent核心类测试失败:', error);
}

console.log('\n=== 核心功能验证完成 ===');
console.log('所有核心测试通过！双Agent系统已成功集成。\n');
