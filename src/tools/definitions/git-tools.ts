import { exec } from 'child_process';
import { promisify } from 'util';
import type { ToolDefinition, ToolResult } from '../registry.js';
import { getErrorMessage } from '../../utils/error-handling.js';

const execAsync = promisify(exec);

export const gitSmartCommitTool: ToolDefinition = {
  name: 'git_smart_commit',
  description: 'AI驱动的智能Git提交（自动分析变更并生成提交信息）',
  parameters: [
    { name: 'auto_add', type: 'string', description: '是否自动git add (true/false)', required: false },
  ],
  execute: async (args): Promise<ToolResult> => {
    try {
      const autoAdd = args.auto_add !== 'false';

      const { stdout: diff } = await execAsync('git diff --cached', { encoding: 'utf-8' }).catch(() => ({ stdout: '' }));

      if (!diff && autoAdd) {
        await execAsync('git add -A');
        const { stdout: newDiff } = await execAsync('git diff --cached', { encoding: 'utf-8' });
        if (!newDiff) {
          return { success: false, output: '', error: '没有暂存的更改' };
        }
      }

      const { stdout: status } = await execAsync('git status --short', { encoding: 'utf-8' });

      const commitType = analyzeCommitType(status);
      const scope = extractScope(status);
      const description = generateCommitDescription(status);

      const message = `${commitType}${scope ? `(${scope})` : ''}: ${description}`;

      const { stdout: commitResult } = await execAsync(`git commit -m "${message}"`, { encoding: 'utf-8' });

      return {
        success: true,
        output: `✅ 提交成功！\n\n📝 提交信息: ${message}\n\n📊 变更统计:\n${status}`,
      };
    } catch (error) {
      return { success: false, output: '', error: `Git提交失败: ${getErrorMessage(error)}` };
    }
  },
};

function analyzeCommitType(status: string): string {
  const patterns = [
    { type: 'feat', pattern: /\.(ts|tsx|js|jsx)$/ },
    { type: 'fix', pattern: /bug|fix|error/i },
    { type: 'docs', pattern: /\.md$|README|doc/i },
    { type: 'style', pattern: /\.css$|\.scss$|\.less$/ },
    { type: 'refactor', pattern: /refactor|reorganize/i },
    { type: 'test', pattern: /\.test\.|\.spec\.|test/i },
    { type: 'chore', pattern: /package\.json|\.gitignore|config/i },
  ];

  for (const { type, pattern } of patterns) {
    if (pattern.test(status)) {
      return type;
    }
  }

  return 'chore';
}

function extractScope(status: string): string {
  const match = status.match(/src\/(\w+)/);
  return match ? match[1] : '';
}

function generateCommitDescription(status: string): string {
  const added = (status.match(/^A\s/mg) || []).length;
  const modified = (status.match(/^M\s/mg) || []).length;
  const deleted = (status.match(/^D\s/mg) || []).length;

  const parts: string[] = [];
  if (added > 0) parts.push(`添加${added}个文件`);
  if (modified > 0) parts.push(`修改${modified}个文件`);
  if (deleted > 0) parts.push(`删除${deleted}个文件`);

  return parts.join(', ') || '更新项目文件';
}

export const gitBranchTool: ToolDefinition = {
  name: 'git_branch',
  description: 'Git分支管理工具',
  parameters: [
    { name: 'operation', type: 'string', description: '操作: list|create|delete|switch', required: true },
    { name: 'branch_name', type: 'string', description: '分支名称（create/delete/switch时需要）', required: false },
  ],
  execute: async (args): Promise<ToolResult> => {
    try {
      const operation = args.operation.toLowerCase();

      switch (operation) {
        case 'list': {
          const { stdout } = await execAsync('git branch -a', { encoding: 'utf-8' });
          const branches = stdout.split('\n').map(b => b.trim()).filter(Boolean);
          const current = branches.find(b => b.startsWith('*'))?.replace('* ', '') || 'unknown';

          return {
            success: true,
            output: `📋 当前分支: ${current}\n\n🌿 所有分支:\n${branches.map(b => `  ${b.startsWith('*') ? '👉' : '  '} ${b.replace('* ', '')}`).join('\n')}`,
          };
        }

        case 'create': {
          if (!args.branch_name) {
            return { success: false, output: '', error: '创建分支需要提供 branch_name 参数' };
          }
          await execAsync(`git checkout -b ${args.branch_name}`, { encoding: 'utf-8' });
          return { success: true, output: `✅ 已创建并切换到新分支: ${args.branch_name}` };
        }

        case 'delete': {
          if (!args.branch_name) {
            return { success: false, output: '', error: '删除分支需要提供 branch_name 参数' };
          }
          await execAsync(`git branch -d ${args.branch_name}`, { encoding: 'utf-8' });
          return { success: true, output: `✅ 已删除分支: ${args.branch_name}` };
        }

        case 'switch': {
          if (!args.branch_name) {
            return { success: false, output: '', error: '切换分支需要提供 branch_name 参数' };
          }
          await execAsync(`git checkout ${args.branch_name}`, { encoding: 'utf-8' });
          return { success: true, output: `✅ 已切换到分支: ${args.branch_name}` };
        }

        default:
          return { success: false, output: '', error: `未知操作: ${operation}` };
      }
    } catch (error) {
      return { success: false, output: '', error: `分支操作失败: ${getErrorMessage(error)}` };
    }
  },
};

export const gitHistoryTool: ToolDefinition = {
  name: 'git_history',
  description: 'Git提交历史分析',
  parameters: [
    { name: 'limit', type: 'string', description: '显示的提交数量（默认10）', required: false },
    { name: 'format', type: 'string', description: '输出格式: short|detailed', required: false },
  ],
  execute: async (args): Promise<ToolResult> => {
    try {
      const limit = parseInt(args.limit || '10', 10);
      const format = args.format || 'short';

      const { stdout } = await execAsync(`git log --oneline -${limit}`, { encoding: 'utf-8' });
      const commits = stdout.split('\n').filter(Boolean);

      if (format === 'detailed') {
        const { stdout: detailed } = await execAsync(`git log -${limit} --format="%h|%s|%an|%ad" --date=short`, { encoding: 'utf-8' });
        const detailedCommits = detailed.split('\n').filter(Boolean);

        const output = detailedCommits.map(commit => {
          const [hash, message, author, date] = commit.split('|');
          return `🔹 **${hash}** | ${date} | ${author}\n   ${message}`;
        }).join('\n\n');

        return {
          success: true,
          output: `📜 最近 ${limit} 次提交历史:\n\n${output}`,
        };
      }

      const output = commits.map((commit, index) => {
        const emoji = index === 0 ? '🆕' : '📝';
        return `${emoji} ${commit}`;
      }).join('\n');

      return {
        success: true,
        output: `📜 最近 ${limit} 次提交:\n\n${output}`,
      };
    } catch (error) {
      return { success: false, output: '', error: `获取历史失败: ${getErrorMessage(error)}` };
    }
  },
};
