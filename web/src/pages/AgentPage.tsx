import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Play, CheckCircle2, Circle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

const placeholderSteps = [
  { id: 1, title: 'Analyze request', status: 'done' as const },
  { id: 2, title: 'Read source files', status: 'done' as const },
  { id: 3, title: 'Generate changes', status: 'running' as const },
  { id: 4, title: 'Apply modifications', status: 'pending' as const },
  { id: 5, title: 'Run tests', status: 'pending' as const },
];

const statusIcon = {
  done: <CheckCircle2 size={16} className="text-success" />,
  running: <Circle size={16} className="text-primary animate-pulse" />,
  pending: <Circle size={16} className="text-text-muted" />,
  error: <AlertCircle size={16} className="text-error" />,
};

const currentStep = placeholderSteps.findIndex((s) => s.status === 'running') + 1 || placeholderSteps.length;

export default function AgentPage() {
  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      {/* Task input */}
      <Card>
        <h3 className="text-sm font-semibold text-text mb-3">Task Input</h3>
        <div className="flex gap-2">
          <Input placeholder="Describe what you want the agent to do..." className="flex-1" />
          <Button icon={<Play size={16} />}>Run</Button>
        </div>
      </Card>

      {/* Progress indicator */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex-1 h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${(currentStep / placeholderSteps.length) * 100}%` }}
          />
        </div>
        <span className="text-xs text-text-muted shrink-0">
          Step {currentStep} / {placeholderSteps.length}
        </span>
      </div>

      {/* Steps - horizontal scroll on mobile, vertical side panel on desktop */}
      <div className="md:hidden">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {placeholderSteps.map((step) => (
            <div
              key={step.id}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 bg-bg-secondary shrink-0 border transition-colors',
                step.status === 'running' && 'border-primary/50 bg-primary/5',
              )}
            >
              {statusIcon[step.status]}
              <span className="text-xs text-text whitespace-nowrap">{step.title}</span>
              {step.status === 'running' && <Badge variant="info" className="ml-1">Running</Badge>}
              {step.status === 'done' && <Badge variant="success" className="ml-1">Done</Badge>}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
        {/* Steps side panel - desktop only */}
        <Card className="hidden md:flex w-72 shrink-0 overflow-y-auto flex-col">
          <h3 className="text-sm font-semibold text-text mb-3">Execution Steps</h3>
          <div className="space-y-2 flex-1">
            {placeholderSteps.map((step) => (
              <div
                key={step.id}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 bg-bg-secondary transition-colors',
                  step.status === 'running' && 'ring-1 ring-primary/50 bg-primary/5',
                )}
              >
                {statusIcon[step.status]}
                <span className="text-sm text-text">{step.title}</span>
                {step.status === 'running' && <Badge variant="info" className="ml-auto">Running</Badge>}
                {step.status === 'done' && <Badge variant="success" className="ml-auto">Done</Badge>}
              </div>
            ))}
          </div>
        </Card>

        {/* Terminal-like output area */}
        <Card className="flex-1 overflow-y-auto flex flex-col">
          <h3 className="text-sm font-semibold text-text mb-3">Output</h3>
          <div className="flex-1 rounded-lg bg-gray-950 border border-gray-800 p-4 font-mono text-xs text-green-400 leading-relaxed overflow-y-auto">
            <div className="flex items-center gap-2 mb-3 text-gray-500">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <span className="ml-2 text-xs">agent-output</span>
            </div>
            <p className="text-gray-500">$ devflow-agent run --task "refactor auth"</p>
            <p className="mt-2">{'>'} Analyzing project structure...</p>
            <p>Found 12 source files to process.</p>
            <p className="mt-2 text-cyan-400">{'>'} Generating changes for auth module...</p>
            <p className="mt-1 text-yellow-400">{'>'} Processing file 3/12: src/auth/login.ts</p>
            <p className="mt-1 text-gray-500 animate-pulse">_</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
