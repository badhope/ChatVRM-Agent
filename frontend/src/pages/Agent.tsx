import { useEffect, useRef, useState } from 'react';
import {
  Play,
  Square,
  Check,
  AlertCircle,
  Wrench,
  Lightbulb,
  ListChecks,
  RefreshCcw,
  FileText,
  Folder,
  Clock,
  ChevronDown,
  ChevronRight,
  Terminal,
} from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/Card';
import { Button } from '@/components/Button';
import { Textarea } from '@/components/Input';
import { Badge, Dot } from '@/components/Badge';
import { Spinner } from '@/components/Spinner';
import { sseStream } from '@/api/client';
import { useConfigStore } from '@/stores/config';
import { cn, formatTime, truncate, providerColor } from '@/utils';
import { toast } from '@/components/Toast';
import type { AgentStage, AgentStep, PlanStep, ProviderType, StageStatus, ToolCallRecord } from '@/types';

const STAGE_LABELS: Record<AgentStage, string> = {
  initialize: '初始化',
  understand: '理解',
  plan: '规划',
  execute: '执行',
  validate: '校验',
  reflect: '反思',
};

const STAGE_DESCRIPTIONS: Record<AgentStage, string> = {
  initialize: '构建任务上下文与初始元数据',
  understand: 'LLM 识别任务意图 + 扫描 workspace',
  plan: 'LLM 生成执行计划（步骤 + 工具）',
  execute: '按计划逐步调用工具，落地结果',
  validate: '校验执行产物（语法 / 退出码 / 文件）',
  reflect: '写入长期记忆 + 更新情绪状态',
};

const ALL_STAGES: AgentStage[] = ['initialize', 'understand', 'plan', 'execute', 'validate', 'reflect'];

export function Agent() {
  const defaultProvider = useConfigStore((s) => s.defaultProvider);
  const defaultModel = useConfigStore((s) => s.defaultModel);
  const refreshConfig = useConfigStore((s) => s.refresh);

  const [task, setTask] = useState('');
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Record<AgentStage, AgentStep>>({} as any);
  const [recentPlan, setRecentPlan] = useState<PlanStep[]>([]);
  const [recentToolCalls, setRecentToolCalls] = useState<ToolCallRecord[]>([]);
  const [intent, setIntent] = useState<string | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [logs, setLogs] = useState<Array<{ type: string; data: any; ts: string }>>([]);
  const [result, setResult] = useState<{
    success: boolean;
    failed?: string;
    error?: string;
    createdFiles: string[];
    modifiedFiles: string[];
  } | null>(null);
  const [expandedStep, setExpandedStep] = useState<Record<string, boolean>>({});
  const [cwd, setCwd] = useState<string>('');
  const [provider, setProvider] = useState<ProviderType | undefined>(defaultProvider ?? undefined);
  const [model, setModel] = useState<string>(defaultModel);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    refreshConfig();
  }, [refreshConfig]);

  useEffect(() => {
    if (defaultProvider) setProvider(defaultProvider);
  }, [defaultProvider]);

  useEffect(() => {
    if (defaultModel) setModel(defaultModel);
  }, [defaultModel]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs.length]);

  function reset() {
    setSteps({} as any);
    setRecentPlan([]);
    setRecentToolCalls([]);
    setIntent(null);
    setFiles([]);
    setLogs([]);
    setResult(null);
  }

  async function handleRun() {
    if (!task.trim() || running) return;
    const runProvider = (provider ?? defaultProvider) as ProviderType | undefined;
    if (!runProvider) {
      toast({ type: 'warning', title: '请先在配置页设置默认 provider / API key' });
      return;
    }
    reset();
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      for await (const ev of sseStream(
        '/agent/run',
        { task: task.trim(), provider: runProvider, model, cwd: cwd || undefined },
        controller.signal,
      )) {
        const data = ev.data ? JSON.parse(ev.data) : {};
        setLogs((prev) => [...prev, { type: ev.event, data, ts: new Date().toISOString() }].slice(-300));
        if (ev.event === 'stage') {
          setSteps((prev) => {
            const cur = prev[data.stage as AgentStage] ?? { stage: data.stage, status: 'pending' };
            return { ...prev, [data.stage]: { ...cur, stage: data.stage, status: data.status } };
          });
        } else if (ev.event === 'understand') {
          setIntent(data.intent);
        } else if (ev.event === 'plan') {
          setRecentPlan(data.steps ?? []);
        } else if (ev.event === 'workspace') {
          setFiles(data.files ?? []);
        } else if (ev.event === 'step') {
          setRecentPlan((prev) =>
            prev.map((s) =>
              s.id === data.step.id
                ? { ...s, status: data.status, output: data.result?.output, toolCall: data.result }
                : s,
            ),
          );
          if (data.result && data.result.toolName) {
            setRecentToolCalls((prev) => [...prev, data.result as ToolCallRecord]);
          }
        } else if (ev.event === 'pipeline-end') {
          setResult({
            success: data.success,
            failed: data.failed,
            error: data.error,
            createdFiles: data.createdFiles ?? [],
            modifiedFiles: data.modifiedFiles ?? [],
          });
        } else if (ev.event === 'error') {
          toast({ type: 'error', title: '任务失败', message: data.message });
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast({ type: 'error', title: '请求异常', message: String(err) });
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  const completedStages = ALL_STAGES.filter((s) => steps[s]?.status === 'done').length;
  const hasResult = result !== null;

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
      <Card>
        <CardBody>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-fg-soft mb-1.5">任务描述</label>
              <Textarea
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="例如：写一个 Python 函数，输入文件路径，统计行数"
                rows={3}
                disabled={running}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-fg-soft mb-1.5">Provider</label>
                <select
                  value={provider ?? ''}
                  onChange={(e) => setProvider((e.target.value || undefined) as ProviderType | undefined)}
                  className="w-full h-9 px-2 rounded-md text-sm bg-bg border border-border"
                  disabled={running}
                >
                  {(['siliconflow', 'openai', 'anthropic', 'google', 'deepseek', 'aliyun', 'zhipu', 'baidu', 'ollama', 'lmstudio'] as ProviderType[]).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-fg-soft mb-1.5">Model</label>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full h-9 px-3 rounded-md text-xs font-mono bg-bg border border-border"
                  disabled={running}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-fg-soft mb-1.5">工作目录（可选）</label>
                <input
                  value={cwd}
                  onChange={(e) => setCwd(e.target.value)}
                  placeholder={typeof window !== 'undefined' ? '/当前路径' : ''}
                  className="w-full h-9 px-3 rounded-md text-xs font-mono bg-bg border border-border"
                  disabled={running}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-xs text-fg-mute">
                真实 LLM 推理 + 真实工具调用 · 6 阶段 Pipeline · 0 mock
              </div>
              {running ? (
                <Button variant="danger" onClick={handleStop} leftIcon={<Square size={14} />}>
                  停止
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={handleRun}
                  disabled={!task.trim()}
                  leftIcon={<Play size={14} />}
                >
                  运行任务
                </Button>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {hasResult && (
        <Card>
          <CardBody className="flex items-center gap-3">
            {result?.success ? (
              <>
                <div className="h-9 w-9 rounded-md bg-success/15 text-success flex items-center justify-center">
                  <Check size={16} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">任务完成</div>
                  <div className="text-xs text-fg-mute mt-0.5">
                    全部 6 个阶段通过
                    {result.createdFiles.length > 0 && ` · 创建 ${result.createdFiles.length} 个文件`}
                    {result.modifiedFiles.length > 0 && ` · 修改 ${result.modifiedFiles.length} 个文件`}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="h-9 w-9 rounded-md bg-danger/15 text-danger flex items-center justify-center">
                  <AlertCircle size={16} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">任务失败 · 阶段: {result?.failed}</div>
                  <div className="text-xs text-fg-mute mt-0.5 font-mono">{result?.error}</div>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <Card>
            <CardHeader>
              <div className="text-sm font-semibold flex items-center gap-2">
                <ListChecks size={14} /> 6 阶段 Pipeline
                {running && <Spinner size="sm" />}
                {!running && completedStages > 0 && (
                  <Badge variant="success">{completedStages}/6 完成</Badge>
                )}
              </div>
            </CardHeader>
            <CardBody className="p-0">
              <div className="divide-y divide-border">
                {ALL_STAGES.map((stage, idx) => {
                  const s = steps[stage] ?? { stage, status: 'pending' as StageStatus };
                  const isLast = idx === ALL_STAGES.length - 1;
                  return (
                    <div key={stage} className="px-5 py-3.5">
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center pt-0.5">
                          <StageIcon status={s.status} />
                          {!isLast && (
                            <div
                              className={cn(
                                'w-px flex-1 min-h-[20px] mt-1',
                                s.status === 'done' ? 'bg-success/40' : 'bg-border',
                              )}
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{STAGE_LABELS[stage]}</span>
                            <span className="text-[10.5px] text-fg-mute font-mono">{stage}</span>
                            <StageBadge status={s.status} />
                          </div>
                          <div className="text-xs text-fg-soft mt-0.5">
                            {STAGE_DESCRIPTIONS[stage]}
                          </div>
                          {stage === 'understand' && intent && (
                            <div className="mt-2 text-xs">
                              <Badge variant="info">识别意图: {intent}</Badge>
                            </div>
                          )}
                          {stage === 'plan' && recentPlan.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {recentPlan.map((p) => (
                                <div
                                  key={p.id}
                                  className="flex items-center gap-2 text-xs text-fg-soft"
                                >
                                  <span
                                    className={cn(
                                      'h-1.5 w-1.5 rounded-full shrink-0',
                                      p.status === 'done' ? 'bg-success' : p.status === 'failed' ? 'bg-danger' : p.status === 'running' ? 'bg-warning animate-pulse' : 'bg-fg-mute',
                                    )}
                                  />
                                  <span className="truncate flex-1">{p.description}</span>
                                  {p.tool && (
                                    <span className="font-mono text-[10.5px] text-fg-mute">
                                      {p.tool}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          {recentToolCalls.length > 0 && (
            <Card>
              <CardHeader>
                <div className="text-sm font-semibold flex items-center gap-2">
                  <Wrench size={14} /> 工具调用记录 ({recentToolCalls.length})
                </div>
              </CardHeader>
              <CardBody className="p-0">
                <div className="divide-y divide-border">
                  {recentToolCalls.map((c, i) => (
                    <div key={i} className="px-5 py-3">
                      <button
                        onClick={() =>
                          setExpandedStep((prev) => ({ ...prev, [`tool-${i}`]: !prev[`tool-${i}`] }))
                        }
                        className="w-full flex items-center gap-2 text-left"
                      >
                        {expandedStep[`tool-${i}`] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <Badge variant="brand" size="sm">{c.toolName}</Badge>
                        <span className="text-xs text-fg-soft truncate flex-1 font-mono">
                          {truncate(JSON.stringify(c.args), 80)}
                        </span>
                        <span className="text-[10.5px] text-fg-mute">{c.durationMs}ms</span>
                      </button>
                      {expandedStep[`tool-${i}`] && (
                        <div className="mt-2 space-y-2 text-xs">
                          <div>
                            <div className="text-[10.5px] text-fg-mute mb-1">参数</div>
                            <pre className="bg-bg-soft rounded-md p-2 font-mono overflow-x-auto">
                              {JSON.stringify(c.args, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <div className="text-[10.5px] text-fg-mute mb-1">输出</div>
                            <pre className="bg-bg-soft rounded-md p-2 font-mono overflow-x-auto max-h-48 overflow-y-auto">
                              {c.output || c.error || '(empty)'}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-3">
          <Card>
            <CardHeader>
              <div className="text-sm font-semibold flex items-center gap-2">
                <Lightbulb size={14} /> 实时事件流
                {running && <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />}
              </div>
            </CardHeader>
            <CardBody className="p-0">
              <div
                ref={logRef}
                className="font-mono text-[11px] text-fg-soft max-h-96 overflow-y-auto px-3 py-2 space-y-0.5"
              >
                {logs.length === 0 && (
                  <div className="text-fg-mute">等待任务开始...</div>
                )}
                {logs.map((l, i) => (
                  <div key={i} className="flex gap-2 hover:bg-bg-soft -mx-1 px-1 rounded">
                    <span className="text-fg-mute shrink-0">{l.ts.slice(11, 19)}</span>
                    <span
                      className={cn(
                        'shrink-0',
                        l.type === 'stage' && 'text-info',
                        l.type === 'chunk' && 'text-fg',
                        l.type === 'step' && 'text-brand',
                        l.type === 'pipeline-end' && 'text-success',
                        l.type === 'error' && 'text-danger',
                      )}
                    >
                      {l.type}
                    </span>
                    <span className="truncate">
                      {l.type === 'stage' && `${l.data.stage} → ${l.data.status}`}
                      {l.type === 'chunk' && `${truncate(l.data.content ?? '', 50)}`}
                      {l.type === 'plan' && `${l.data.steps?.length} steps`}
                      {l.type === 'step' && `${l.data.step?.description} → ${l.data.status}`}
                      {l.type === 'pipeline-end' && (l.data.success ? '完成' : `失败 @${l.data.failed}`)}
                    </span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {(files.length > 0 || result) && (
            <Card>
              <CardHeader>
                <div className="text-sm font-semibold flex items-center gap-2">
                  <Folder size={14} /> 文件变更
                </div>
              </CardHeader>
              <CardBody className="space-y-2 text-xs">
                {result && result.createdFiles.length > 0 && (
                  <div>
                    <div className="text-[10.5px] text-fg-mute mb-1">创建</div>
                    {result.createdFiles.map((f) => (
                      <div key={f} className="flex items-center gap-1.5 text-fg-soft font-mono truncate">
                        <FileText size={11} className="text-success" /> {f}
                      </div>
                    ))}
                  </div>
                )}
                {result && result.modifiedFiles.length > 0 && (
                  <div>
                    <div className="text-[10.5px] text-fg-mute mb-1">修改</div>
                    {result.modifiedFiles.map((f) => (
                      <div key={f} className="flex items-center gap-1.5 text-fg-soft font-mono truncate">
                        <FileText size={11} className="text-warning" /> {f}
                      </div>
                    ))}
                  </div>
                )}
                {files.length > 0 && (
                  <details className="text-[11px]">
                    <summary className="cursor-pointer text-fg-mute hover:text-fg-soft">
                      工作目录扫描 ({files.length} 个文件)
                    </summary>
                    <div className="mt-1.5 max-h-32 overflow-y-auto font-mono text-fg-mute space-y-0.5">
                      {files.map((f) => (
                        <div key={f} className="truncate">
                          {f.replace(process.cwd(), '.')}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </CardBody>
            </Card>
          )}

          {provider && (
            <div className="text-[10.5px] text-fg-mute text-center flex items-center justify-center gap-1.5">
              <Clock size={10} />
              {logs[0] && formatTime(logs[0].ts)}
              <span>·</span>
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: providerColor(provider) }}
              />
              <span className="font-mono">{provider}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StageIcon({ status }: { status: StageStatus }) {
  if (status === 'running') return <Spinner size="sm" />;
  if (status === 'done')
    return (
      <div className="h-5 w-5 rounded-full bg-success/20 text-success flex items-center justify-center">
        <Check size={11} />
      </div>
    );
  if (status === 'failed')
    return (
      <div className="h-5 w-5 rounded-full bg-danger/20 text-danger flex items-center justify-center">
        <AlertCircle size={11} />
      </div>
    );
  return <div className="h-5 w-5 rounded-full border border-border-strong" />;
}

function StageBadge({ status }: { status: StageStatus }) {
  if (status === 'running') return <Badge variant="warning">运行中</Badge>;
  if (status === 'done') return <Badge variant="success">完成</Badge>;
  if (status === 'failed') return <Badge variant="danger">失败</Badge>;
  return <Badge>等待</Badge>;
}
