import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import {
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  Plus,
  RefreshCw,
  ArrowRight,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

const branches = [
  { name: 'main', isDefault: true, ahead: 0, behind: 0 },
  { name: 'feature/auth-refactor', isDefault: false, ahead: 3, behind: 1 },
  { name: 'fix/memory-leak', isDefault: false, ahead: 1, behind: 0 },
  { name: 'develop', isDefault: false, ahead: 5, behind: 2 },
];

const commits = [
  { hash: 'a1b2c3d', message: 'Refactor auth module', author: 'Agent', time: '2h ago', branch: 'feature/auth-refactor' },
  { hash: 'e4f5g6h', message: 'Fix memory leak in cache', author: 'Agent', time: '5h ago', branch: 'fix/memory-leak' },
  { hash: 'i7j8k9l', message: 'Add unit tests for utils', author: 'User', time: '1d ago', branch: 'develop' },
  { hash: 'm0n1o2p', message: 'Update dependencies', author: 'Agent', time: '2d ago', branch: 'main' },
  { hash: 'q3r4s5t', message: 'Initial project setup', author: 'User', time: '3d ago', branch: 'main' },
];

const currentBranch = branches.find((b) => b.name === 'feature/auth-refactor') ?? branches[0];

export default function GitPage() {
  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      {/* Branch selector */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GitBranch size={16} className="text-primary" />
            <span className="text-sm font-semibold text-text">Branches</span>
          </div>
          <Button size="sm" icon={<Plus size={14} />}>New Branch</Button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {branches.map((branch) => (
            <div
              key={branch.name}
              className="flex items-center gap-2 rounded-lg border border-border bg-bg-secondary px-3 py-1.5 cursor-pointer hover:border-primary/50 transition-colors"
            >
              <GitBranch size={12} className="text-text-muted" />
              <span className="text-xs font-medium text-text">{branch.name}</span>
              {branch.isDefault && <Badge variant="info">default</Badge>}
              {branch.ahead > 0 && <Badge variant="success">+{branch.ahead}</Badge>}
            </div>
          ))}
        </div>
      </Card>

      {/* Status summary bar */}
      <div className="flex items-center gap-4 px-1">
        <div className="flex items-center gap-1.5">
          <ArrowUp size={14} className="text-success" />
          <span className="text-sm text-text-secondary">{currentBranch.ahead} commits ahead</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowDown size={14} className="text-warning" />
          <span className="text-sm text-text-secondary">{currentBranch.behind} commits behind</span>
        </div>
        <Badge variant="info">{currentBranch.name}</Badge>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { key: 'commits', label: 'Commits', icon: <GitCommit size={14} /> },
          { key: 'pulls', label: 'Pull Requests', icon: <GitPullRequest size={14} /> },
          { key: 'merges', label: 'Merges', icon: <GitMerge size={14} /> },
        ]}
      />

      {/* Commit list + diff viewer - stack on mobile */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
        {/* Commit history */}
        <Card className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text">Recent Commits</h3>
            <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />}>Refresh</Button>
          </div>
          <div className="space-y-2">
            {commits.map((commit) => (
              <div
                key={commit.hash}
                className="flex items-start gap-3 rounded-lg px-3 py-2.5 bg-bg-secondary cursor-pointer hover:bg-bg-tertiary transition-colors"
              >
                <GitCommit size={14} className="text-text-muted mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text font-medium">{commit.message}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="text-xs text-text-muted">{commit.hash}</span>
                    <span className="text-xs text-text-muted">by {commit.author}</span>
                    <span className="text-xs text-text-muted">{commit.time}</span>
                  </div>
                </div>
                <Badge className="hidden sm:inline-flex">{commit.branch}</Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Diff viewer */}
        <Card className="md:w-96 shrink-0 overflow-y-auto">
          <h3 className="text-sm font-semibold text-text mb-3">Diff Viewer</h3>
          <div className="rounded-lg bg-gray-950 border border-gray-800 p-4 font-mono text-xs leading-relaxed">
            <div className="flex items-center gap-2 mb-3 text-gray-500">
              <span>src/auth/login.ts</span>
              <ArrowRight size={12} />
              <span className="text-green-400">+42</span>
              <span className="text-red-400">-18</span>
            </div>
            <p className="text-gray-500">// Select a commit to view diff...</p>
            <p className="mt-1 text-red-400">- const oldAuth = require('./old-auth');</p>
            <p className="text-green-400">{'+ import { newAuth } from \'./new-auth\';'}</p>
            <p className="mt-1">  </p>
            <p className="text-green-400">{'+ export async function login(credentials) {'}</p>
            <p className="text-green-400">+   return newAuth.authenticate(credentials);</p>
            <p className="text-green-400">{'+ }'}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
