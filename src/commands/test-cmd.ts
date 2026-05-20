import { Command } from 'commander';
import { configManager } from '../config/manager.js';
import { printSuccess, printError, printInfo, printWarning } from '../ui/logo.js';

export const testCommand = new Command('test')
  .description('测试自动化（运行/生成/修复）');

testCommand
  .command('run')
  .description('运行项目测试')
  .option('-f, --framework <framework>', '测试框架 (vitest/jest/mocha/pytest)')
  .option('--fix', '自动修复失败的测试')
  .action(async (options) => {
    await configManager.init();
    printInfo('正在检测测试框架...');

    const { detectTestFramework, runTests, fixFailingTests } = await import('../agent/test-automation.js');
    const framework = options.framework || await detectTestFramework(process.cwd());

    if (framework === 'none') {
      printWarning('未检测到测试框架');
      printInfo('支持的框架: vitest, jest, mocha, pytest, playwright');
      return;
    }

    printInfo(`使用测试框架: ${framework}`);
    printInfo('正在运行测试...\n');

    const result = await runTests(process.cwd(), framework);

    console.log();
    const status = result.failed === 0 ? '✓' : '✗';
    const color = result.failed === 0 ? '\x1b[32m' : '\x1b[31m';
    console.log(`${color}${status} 测试结果: ${result.passed}/${result.total} 通过, ${result.failed} 失败, ${result.skipped} 跳过 (${(result.duration / 1000).toFixed(1)}s)\x1b[0m`);

    if (result.failures.length > 0) {
      console.log('\n失败列表:');
      for (const f of result.failures) {
        console.log(`  ✗ ${f.name}`);
        if (f.error) console.log(`    ${f.error.slice(0, 200)}`);
      }

      if (options.fix) {
        printInfo('\n正在自动修复失败的测试...');
        const fixes = await fixFailingTests(process.cwd(), result);
        if (fixes.length > 0) {
          printSuccess(`已修复 ${fixes.length} 个测试文件`);
          printInfo('请重新运行测试验证修复');
        } else {
          printWarning('无法自动修复这些测试');
        }
      }
    }
  });

testCommand
  .command('detect')
  .description('检测项目测试框架')
  .action(async () => {
    await configManager.init();
    const { detectTestFramework } = await import('../agent/test-automation.js');
    const framework = await detectTestFramework(process.cwd());
    printInfo(`检测到的测试框架: ${framework || '无'}`);
  });
