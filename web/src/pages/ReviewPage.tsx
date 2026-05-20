import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { FileCode2, AlertTriangle, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';

type Severity = 'error' | 'warning' | 'info';

interface Issue {
  id: number;
  file: string;
  line: number;
  severity: Severity;
  message: string;
}

const placeholderIssues: Issue[] = [
  { id: 1, file: 'src/auth/login.ts', line: 42, severity: 'error', message: 'Potential SQL injection vulnerability' },
  { id: 2, file: 'src/auth/login.ts', line: 78, severity: 'warning', message: 'Unhandled promise rejection' },
  { id: 3, file: 'src/utils/helpers.ts', line: 15, severity: 'info', message: 'Consider using optional chaining' },
  { id: 4, file: 'src/api/routes.ts', line: 103, severity: 'error', message: 'Missing error boundary in async handler' },
  { id: 5, file: 'src/components/Form.tsx', line: 56, severity: 'warning', message: 'Deprecated API usage detected' },
];

const severityConfig: Record<Severity, { icon: React.ReactNode; badge: 'error' | 'warning' | 'info'; color: string }> = {
  error: { icon: <XCircle size={14} />, badge: 'error', color: 'text-error' },
  warning: { icon: <AlertTriangle size={14} />, badge: 'warning', color: 'text-warning' },
  info: { icon: <CheckCircle2 size={14} />, badge: 'info', color: 'text-info' },
};

export default function ReviewPage() {
  const [selectedId, setSelectedId] = useState<number>(1);

  const counts = {
    errors: placeholderIssues.filter((i) => i.severity === 'error').length,
    warnings: placeholderIssues.filter((i) => i.severity === 'warning').length,
    infos: placeholderIssues.filter((i) => i.severity === 'info').length,
  };

  const selectedIssue = placeholderIssues.find((i) => i.id === selectedId) ?? placeholderIssues[0];

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      {/* File selection */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode2 size={16} className="text-primary" />
            <span className="text-sm text-text">Select files to review</span>
          </div>
          <Button size="sm" icon={<RefreshCw size={14} />}>Scan</Button>
        </div>
        <div className="mt-3 flex gap-2 flex-wrap">
          {['src/auth/', 'src/api/', 'src/components/'].map((path) => (
            <Badge key={path} className="cursor-pointer hover:bg-bg-tertiary transition-colors">{path}</Badge>
          ))}
        </div>
      </Card>

      {/* Summary bar */}
      <div className="flex items-center gap-4 px-1">
        <div className="flex items-center gap-1.5">
          <XCircle size={14} className="text-error" />
          <span className="text-sm text-text-secondary">{counts.errors} errors</span>
        </div>
        <div className="flex items-center gap-1.5">
          <AlertTriangle size={14} className="text-warning" />
          <span className="text-sm text-text-secondary">{counts.warnings} warnings</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 size={14} className="text-info" />
          <span className="text-sm text-text-secondary">{counts.infos} info</span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { key: 'issues', label: 'Issues' },
          { key: 'suggestions', label: 'Suggestions' },
          { key: 'summary', label: 'Summary' },
        ]}
      />

      {/* Issue list + detail - stack on mobile */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
        {/* Issue list */}
        <Card className="md:w-96 shrink-0 overflow-y-auto">
          <h3 className="text-sm font-semibold text-text mb-3">
            Issues <Badge variant="error">{placeholderIssues.length}</Badge>
          </h3>
          <div className="space-y-2">
            {placeholderIssues.map((issue) => {
              const config = severityConfig[issue.severity];
              const isSelected = selectedId === issue.id;
              return (
                <div
                  key={issue.id}
                  onClick={() => setSelectedId(issue.id)}
                  className={cn(
                    'flex items-start gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors',
                    isSelected
                      ? 'bg-primary/10 ring-1 ring-primary/30'
                      : 'bg-bg-secondary hover:bg-bg-tertiary',
                  )}
                >
                  <span className={config.color}>{config.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text truncate">{issue.message}</p>
                    <p className="text-xs text-text-muted mt-0.5">{issue.file}:{issue.line}</p>
                  </div>
                  <Badge variant={config.badge}>{issue.severity}</Badge>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Detail panel */}
        <Card className="flex-1 overflow-y-auto">
          <h3 className="text-sm font-semibold text-text mb-3">Issue Detail</h3>
          <div className="rounded-lg bg-gray-950 border border-gray-800 p-4 font-mono text-xs text-gray-300 leading-relaxed">
            <div className="flex items-center gap-2 mb-3 text-gray-500">
              <span>{selectedIssue.file}</span>
              <span className="text-primary">line {selectedIssue.line}</span>
            </div>
            <p>
              <span className="text-gray-500"> 40 | </span>
              <span>function authenticateUser(userId) {'{'}</span>
            </p>
            <p>
              <span className="text-gray-500"> 41 | </span>
              <span>  const query = buildQuery(userId);</span>
            </p>
            <p>
              <span className="text-gray-500"> 42 | </span>
              <span className="text-red-400">  const result = db.query(`SELECT * FROM users WHERE id = ${'${userId}'};`);</span>
            </p>
            <p>
              <span className="text-gray-500">    | </span>
              <span className="text-red-400 underline">                                                    ^^^^^^^^</span>
            </p>
            <p>
              <span className="text-gray-500"> 43 | </span>
              <span>  return result.rows[0];</span>
            </p>
            <p>
              <span className="text-gray-500"> 44 | {'}'}</span>
            </p>
            <p className="mt-3 text-yellow-400">Warning: Unsanitized user input used in SQL query.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
