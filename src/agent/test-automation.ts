import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { callLLM } from './llm-caller.js';
import { getErrorMessage } from '../utils/error-handling.js';

const execFileAsync = promisify(execFile);

export interface TestResult {
  file: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
}

export interface TestRunResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failures: TestResult[];
}

/**
 * 检测项目使用的测试框架
 */
export async function detectTestFramework(projectDir: string): Promise<string> {
  const pkgPath = path.join(projectDir, 'package.json');
  try {
    const content = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(content);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps['vitest']) return 'vitest';
    if (deps['jest']) return 'jest';
    if (deps['mocha']) return 'mocha';
    if (deps['@playwright/test']) return 'playwright';
    if (deps['pytest'] || deps['pytest-asyncio']) return 'pytest';
    if (deps['unittest'] || deps['pytest']) return 'python';

    // 检查测试文件
    const hasTestDir = await fs.access(path.join(projectDir, 'test')).then(() => true).catch(() => false);
    const hasSpecDir = await fs.access(path.join(projectDir, 'spec')).then(() => true).catch(() => false);
    const hasPytest = await fs.access(path.join(projectDir, 'conftest.py')).then(() => true).catch(() => false);

    if (hasPytest) return 'pytest';
    if (hasTestDir || hasSpecDir) return 'unknown';

    return 'none';
  } catch {
    return 'none';
  }
}

/**
 * 运行测试
 */
export async function runTests(projectDir: string, framework?: string): Promise<TestRunResult> {
  const detected = framework || await detectTestFramework(projectDir);

  const commands: Record<string, string[]> = {
    'vitest': ['npx', 'vitest', 'run', '--reporter', 'json', '--outputFile', '/tmp/devflow-test-results.json'],
    'jest': ['npx', 'jest', '--json', '--outputFile', '/tmp/devflow-test-results.json'],
    'mocha': ['npx', 'mocha', '--reporter', 'json', '--reporter-options', 'output=/tmp/devflow-test-results.json'],
    'pytest': ['python', '-m', 'pytest', '--tb=short', '-v'],
    'playwright': ['npx', 'playwright', 'test', '--reporter', 'json'],
  };

  const cmd = commands[detected];
  if (!cmd) {
    return { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0, failures: [] };
  }

  const startTime = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(cmd[0], cmd.slice(1), {
      cwd: projectDir,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120000,
    });
    const duration = Date.now() - startTime;

    return parseTestOutput(detected, stdout, stderr, duration);
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    // 测试失败时 stdout 仍然有结果
    const errObj = error as { stdout?: string; stderr?: string };
    return parseTestOutput(detected, errObj.stdout || '', errObj.stderr || '', duration);
  }
}

/**
 * 解析测试输出
 */
function parseTestOutput(framework: string, stdout: string, stderr: string, duration: number): TestRunResult {
  const result: TestRunResult = {
    total: 0, passed: 0, failed: 0, skipped: 0, duration, failures: []
  };

  try {
    if (framework === 'vitest' || framework === 'jest') {
      // 尝试读取 JSON 输出
      const jsonMatch = stdout.match(/\{[\s\S]*"testResults"[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        result.total = data.numTotalTests || 0;
        result.passed = data.numPassedTests || 0;
        result.failed = data.numFailedTests || 0;
        result.skipped = data.numPendingTests || 0;

        // 提取失败信息
        for (const tr of data.testResults || []) {
          for (const assertion of tr.assertionResults || []) {
            if (assertion.status === 'failed') {
              result.failures.push({
                file: tr.name || '',
                name: assertion.title || '',
                status: 'failed',
                duration: 0,
                error: assertion.failureMessages?.join('\n') || ''
              });
            }
          }
        }
        return result;
      }
    }

    // 通用解析：从输出中提取数字
    const passMatch = stdout.match(/(\d+)\s*(pass|success|✓)/i);
    const failMatch = stdout.match(/(\d+)\s*(fail|error|✗)/i);
    const totalMatch = stdout.match(/(\d+)\s*(test|spec)/i);

    if (passMatch) result.passed = parseInt(passMatch[1]);
    if (failMatch) result.failed = parseInt(failMatch[1]);
    if (totalMatch) result.total = parseInt(totalMatch[1]);
    result.total = Math.max(result.total, result.passed + result.failed);

    // 提取失败文件名
    const failLines = stdout.split('\n').filter(l =>
      l.includes('✗') || l.includes('FAIL') || l.includes('failed')
    );
    for (const line of failLines.slice(0, 10)) {
      result.failures.push({
        file: '',
        name: line.trim().slice(0, 100),
        status: 'failed',
        duration: 0,
        error: ''
      });
    }
  } catch {
    // 解析失败，返回原始信息
  }

  return result;
}

/**
 * 自动修复失败的测试
 */
export async function fixFailingTests(
  projectDir: string,
  testResult: TestRunResult
): Promise<string[]> {
  if (testResult.failures.length === 0) return [];

  const fixes: string[] = [];

  for (const failure of testResult.failures.slice(0, 5)) {  // 最多修复 5 个
    try {
      // 读取测试文件
      const content = await fs.readFile(failure.file, 'utf-8');

      // 使用 LLM 分析失败原因并生成修复
      const prompt = `以下测试失败了，请分析原因并生成修复代码：

测试文件: ${failure.file}
测试名称: ${failure.name}
错误信息: ${failure.error}

原始代码:
\`\`\`
${content.slice(0, 3000)}
\`\`\`

请只输出修复后的完整代码，不要解释。`;

      const response = await callLLM([{ role: 'user', content: prompt }]);
      if (response) {
        await fs.writeFile(failure.file, response, 'utf-8');
        fixes.push(failure.file);
      }
    } catch {
      // 跳过无法修复的测试
    }
  }

  return fixes;
}
