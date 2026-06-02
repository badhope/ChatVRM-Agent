import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare,
  Brain,
  Wrench,
  Wand2,
  Activity,
  ArrowUpRight,
  Check,
  AlertCircle,
  Tag,
  ChevronRight,
} from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/Card';
import { Badge, Dot } from '@/components/Badge';
import { Skeleton } from '@/components/Spinner';
import { api } from '@/api/client';
import { useConfigStore } from '@/stores/config';
import { formatTime, providerColor, providerInitial, cn } from '@/utils';
import type { DashboardStats } from '@/types';

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useConfigStore((s) => s.refresh);

  useEffect(() => {
    api
      .get<DashboardStats>('/dashboard')
      .then(setStats)
      .catch((e) => setError(String(e)));
    refresh();
    const id = setInterval(() => {
      api.get<DashboardStats>('/dashboard').then(setStats).catch(() => {});
    }, 8000);
    return () => clearInterval(id);
  }, [refresh]);

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardBody>
            <div className="flex items-start gap-3 text-danger">
              <AlertCircle size={18} />
              <div>
                <div className="font-medium">无法加载仪表盘</div>
                <div className="text-xs text-fg-mute mt-1">{error}</div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      <Hero />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={MessageSquare}
          label="对话会话"
          value={stats?.chatSessions}
          hint="共 {n} 条消息"
          to="/chat"
          loading={!stats}
          hue="indigo"
        />
        <StatCard
          icon={Brain}
          label="长期记忆"
          value={stats?.memoryCount}
          hint="token: {n}"
          to="/memory"
          loading={!stats}
          hue="violet"
          formatter={(n) => n.toLocaleString()}
        />
        <StatCard
          icon={Wand2}
          label="Agent 任务"
          value={stats?.agentRunCount ?? 0}
          hint={`${stats?.agentMemoryCount ?? 0} 条 agent 记忆`}
          to="/agent"
          loading={!stats}
          hue="emerald"
        />
        <StatCard
          icon={Activity}
          label="Provider 就绪"
          value={stats ? `${stats.providersConfigured}/${stats.providersTotal}` : undefined}
          hint="10 个厂商"
          to="/config"
          loading={!stats}
          hue="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <div className="text-sm font-semibold">LLM Provider 状态</div>
              <div className="text-xs text-fg-mute mt-0.5">10 个厂商 · 实时连通性</div>
            </div>
            <Link
              to="/config"
              className="text-xs text-fg-soft hover:text-fg inline-flex items-center gap-1"
            >
              管理 <ArrowUpRight size={12} />
            </Link>
          </CardHeader>
          <CardBody className="p-0">
            <div className="divide-y divide-border">
              {stats?.providerStatus.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-bg-soft/50 transition-colors"
                >
                  <div
                    className="h-8 w-8 rounded-md flex items-center justify-center text-white text-xs font-semibold shrink-0"
                    style={{ backgroundColor: providerColor(p.id) }}
                  >
                    {providerInitial(p.id)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{p.name}</span>
                      <span className="text-[10.5px] text-fg-mute font-mono">{p.id}</span>
                    </div>
                    <div className="text-xs text-fg-mute">
                      {p.requiresKey ? (p.hasKey ? '已配置 API key' : '未配置 key') : '本地服务无需 key'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.available ? (
                      <Badge variant="success">
                        <Check size={10} /> 就绪
                      </Badge>
                    ) : (
                      <Badge variant="warning">未就绪</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader>
              <div className="text-sm font-semibold flex items-center gap-2">
                <Tag size={14} /> 热门标签
              </div>
            </CardHeader>
            <CardBody className="space-y-2">
              {stats?.memoryByTag.length === 0 && (
                <div className="text-xs text-fg-mute">暂无标签</div>
              )}
              {stats?.memoryByTag.map((t) => (
                <div key={t.tag} className="flex items-center justify-between text-xs">
                  <span className="text-fg-soft">#{t.tag}</span>
                  <span className="font-mono text-fg-mute">{t.count}</span>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div className="text-sm font-semibold">最近记忆</div>
            </CardHeader>
            <CardBody className="space-y-2">
              {stats?.recentActivity.length === 0 && (
                <div className="text-xs text-fg-mute">还没有任何记录</div>
              )}
              {stats?.recentActivity.map((a) => (
                <Link
                  key={a.id}
                  to="/memory"
                  className="block text-xs hover:bg-bg-soft -mx-2 px-2 py-1.5 rounded transition-colors"
                >
                  <div className="line-clamp-2 text-fg-soft">{a.summary}</div>
                  <div className="text-fg-mute mt-0.5">{formatTime(a.createdAt)}</div>
                </Link>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="text-sm font-semibold">快速入口</div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <QuickAction to="/chat" icon={MessageSquare} title="开始对话" subtitle="与 LLM 多轮聊天" />
            <QuickAction to="/agent" icon={Wand2} title="跑 Agent" subtitle="6 阶段 Pipeline" />
            <QuickAction to="/tools" icon={Wrench} title="工具浏览器" subtitle="7 个真实工具" />
            <QuickAction to="/graph" icon={Brain} title="知识图谱" subtitle="记忆关联可视化" />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function Hero() {
  const defaultProvider = useConfigStore((s) => s.defaultProvider);
  const configuredKeys = useConfigStore((s) => s.configuredKeys);
  const ready = configuredKeys.size > 0;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-bg-elev via-bg-elev to-bg-soft p-5 lg:p-6">
      <div className="absolute inset-0 dot-bg opacity-30" aria-hidden />
      <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Dot variant={ready ? 'success' : 'warning'} pulse={ready} />
            <span className="text-xs font-mono text-fg-soft">
              {ready ? `${defaultProvider} · ready` : 'no API key configured'}
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-balance">
            <span className="text-gradient">Personal-Assistant</span>
          </h1>
          <p className="text-sm text-fg-soft max-w-2xl">
            Pipeline 驱动的 AI 智能体 · 真实 LLM / 真实工具 / 真实记忆 · 0 mock
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/chat"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-brand-fg text-sm font-medium hover:brightness-110 transition shadow-soft"
          >
            开始对话 <ChevronRight size={14} />
          </Link>
          {!ready && (
            <Link
              to="/config"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md border border-border bg-bg-elev text-sm hover:bg-bg-soft"
            >
              配置 API key
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  to,
  loading,
  hue,
  formatter,
}: {
  icon: any;
  label: string;
  value: number | string | undefined;
  hint?: string;
  to: string;
  loading?: boolean;
  hue: 'indigo' | 'violet' | 'emerald' | 'amber';
  formatter?: (n: number) => string;
}) {
  const hueClass: Record<string, string> = {
    indigo: 'from-indigo-500/15 to-indigo-500/0 text-indigo-500',
    violet: 'from-violet-500/15 to-violet-500/0 text-violet-500',
    emerald: 'from-emerald-500/15 to-emerald-500/0 text-emerald-500',
    amber: 'from-amber-500/15 to-amber-500/0 text-amber-500',
  };
  return (
    <Link to={to}>
      <Card className="h-full hover:border-border-strong transition-colors group">
        <CardBody className="space-y-2">
          <div className="flex items-start justify-between">
            <div
              className={cn(
                'h-9 w-9 rounded-md flex items-center justify-center bg-gradient-to-br',
                hueClass[hue],
              )}
            >
              <Icon size={16} />
            </div>
            <ArrowUpRight
              size={14}
              className="text-fg-mute opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </div>
          {loading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <div className="text-2xl font-semibold tracking-tight">
              {typeof value === 'number' && formatter ? formatter(value) : value ?? '—'}
            </div>
          )}
          <div>
            <div className="text-xs text-fg-soft">{label}</div>
            {hint && (
              <div className="text-[10.5px] text-fg-mute mt-0.5">
                {hint.replace('{n}', String(value ?? 0))}
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}

function QuickAction({
  to,
  icon: Icon,
  title,
  subtitle,
}: {
  to: string;
  icon: any;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 p-3 rounded-md border border-border hover:border-border-strong hover:bg-bg-soft transition-colors group"
    >
      <div className="h-9 w-9 rounded-md bg-bg-soft flex items-center justify-center group-hover:bg-bg-elev">
        <Icon size={16} className="text-fg-soft" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-[11px] text-fg-mute">{subtitle}</div>
      </div>
      <ChevronRight size={14} className="text-fg-mute" />
    </Link>
  );
}
