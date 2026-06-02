import { useEffect, useState } from 'react';
import { Sun, Moon, User, Database, Download, Trash2, Heart, Smile, RefreshCw, AlertCircle } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge, Dot } from '@/components/Badge';
import { api } from '@/api/client';
import { useThemeStore } from '@/stores/theme';
import { toast } from '@/components/Toast';
import type { EmotionState, EmotionName, PersonalityMeta } from '@/types';
import { formatDateTime } from '@/utils';

const EMOTION_LABEL: Record<EmotionName, { label: string; color: string; emoji: string }> = {
  neutral: { label: '平静', color: 'text-fg-soft', emoji: '😐' },
  excited: { label: '兴奋', color: 'text-warning', emoji: '🤩' },
  confident: { label: '自信', color: 'text-success', emoji: '😊' },
  cautious: { label: '谨慎', color: 'text-info', emoji: '🤔' },
  frustrated: { label: '受挫', color: 'text-danger', emoji: '😤' },
  tired: { label: '疲惫', color: 'text-fg-mute', emoji: '😴' },
};

export function Settings() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [personality, setPersonality] = useState<{ current: string; list: PersonalityMeta[] } | null>(null);
  const [emotion, setEmotion] = useState<EmotionState | null>(null);
  const [stats, setStats] = useState<{
    totalRecords: number;
    totalTokens: number;
    averageImportance: number;
  } | null>(null);

  useEffect(() => {
    api.get<{ current: string; list: PersonalityMeta[] }>('/personality').then(setPersonality);
    api.get<{ totalRecords: number; totalTokens: number; averageImportance: number }>(
      '/memory/stats',
    ).then(setStats);
    api.get<EmotionState>('/emotion').then(setEmotion).catch(() => {});
  }, []);

  async function refreshEmotion() {
    try {
      const e = await api.get<EmotionState>('/emotion');
      setEmotion(e);
    } catch (err) {
      toast({ type: 'error', title: '刷新情绪失败', message: String(err) });
    }
  }

  async function setPersonality_(id: string) {
    try {
      await api.post('/personality/set', { id });
      setPersonality((prev) => (prev ? { ...prev, current: id } : prev));
      toast({ type: 'success', title: `已切换到 ${id}` });
    } catch (err) {
      toast({ type: 'error', title: '切换失败', message: String(err) });
    }
  }

  async function exportData() {
    try {
      const [memory, sessions, dashboard] = await Promise.all([
        api.get<any>('/memory'),
        api.get<any>('/chat/sessions'),
        api.get<any>('/dashboard'),
      ]);
      const data = {
        exportedAt: new Date().toISOString(),
        dashboard,
        memory,
        sessions,
        config: await api.get<any>('/config/snapshot'),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `personal-assistant-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ type: 'success', title: '导出完成' });
    } catch (err) {
      toast({ type: 'error', title: '导出失败', message: String(err) });
    }
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold">设置</h1>
        <p className="text-sm text-fg-mute mt-1">主题 / 人格 / 数据管理</p>
      </div>

      <Card>
        <CardHeader>
          <div className="text-sm font-semibold flex items-center gap-2">
            {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />} 主题
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setTheme('light')}
              className={`p-3 rounded-md border text-left transition-colors ${
                theme === 'light' ? 'border-brand bg-brand/8' : 'border-border hover:border-border-strong'
              }`}
            >
              <div className="flex items-center gap-2">
                <Sun size={16} className="text-warning" />
                <span className="text-sm font-medium">浅色</span>
                {theme === 'light' && <Dot variant="success" />}
              </div>
              <div className="text-[10.5px] text-fg-mute mt-1">明亮 · 适合白天</div>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`p-3 rounded-md border text-left transition-colors ${
                theme === 'dark' ? 'border-brand bg-brand/8' : 'border-border hover:border-border-strong'
              }`}
            >
              <div className="flex items-center gap-2">
                <Moon size={16} className="text-indigo-400" />
                <span className="text-sm font-medium">深色</span>
                {theme === 'dark' && <Dot variant="success" />}
              </div>
              <div className="text-[10.5px] text-fg-mute mt-1">深邃 · 适合夜间</div>
            </button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-sm font-semibold flex items-center gap-2">
            <User size={14} /> 人格 (Personality)
          </div>
          {personality && <Badge variant="brand">当前: {personality.current}</Badge>}
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {personality?.list.map((p) => (
              <button
                key={p.id}
                onClick={() => setPersonality_(p.id)}
                className={`p-3 rounded-md border text-left transition-colors ${
                  personality.current === p.id
                    ? 'border-brand bg-brand/8'
                    : 'border-border hover:border-border-strong'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{p.name}</span>
                  {personality.current === p.id && <Dot variant="success" />}
                </div>
                <div className="text-[10.5px] text-fg-mute mt-1 leading-relaxed">{p.description}</div>
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      {emotion && (
        <Card>
          <CardHeader>
            <div className="text-sm font-semibold flex items-center gap-2">
              <Smile size={14} /> 情绪状态（来自 EmotionService）
            </div>
            <button
              onClick={refreshEmotion}
              className="text-[10.5px] text-fg-soft hover:text-fg inline-flex items-center gap-1"
            >
              <RefreshCw size={11} /> 刷新
            </button>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl leading-none">
                {EMOTION_LABEL[emotion.name]?.emoji ?? '😐'}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-semibold ${EMOTION_LABEL[emotion.name]?.color ?? 'text-fg'}`}
                  >
                    {EMOTION_LABEL[emotion.name]?.label ?? emotion.name}
                  </span>
                  <Dot
                    variant={
                      emotion.intensity >= 70
                        ? 'success'
                        : emotion.intensity >= 35
                          ? 'warning'
                          : 'info'
                    }
                    pulse={emotion.intensity >= 35}
                  />
                  <span className="text-[10.5px] text-fg-mute font-mono">
                    intensity {emotion.intensity}/100
                  </span>
                </div>
                <div className="mt-2 h-1.5 bg-bg-soft rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-violet-500"
                    style={{ width: `${emotion.intensity}%` }}
                  />
                </div>
                <div className="text-[10.5px] text-fg-mute mt-1.5">
                  最后更新: {formatDateTime(emotion.lastUpdated)} · triggers: {emotion.triggers.length}
                </div>
              </div>
            </div>
            {emotion.triggers.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-fg-mute hover:text-fg-soft">
                  最近触发 ({emotion.triggers.length})
                </summary>
                <ul className="mt-2 space-y-0.5 font-mono text-fg-mute">
                  {emotion.triggers
                    .slice(-10)
                    .reverse()
                    .map((t, i) => (
                      <li key={i} className="truncate">
                        · {t}
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </CardBody>
        </Card>
      )}

      {stats && (
        <Card>
          <CardHeader>
            <div className="text-sm font-semibold flex items-center gap-2">
              <Database size={14} /> 数据
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <DataStat label="记忆总数" value={stats.totalRecords} />
              <DataStat label="总 Token" value={stats.totalTokens} />
              <DataStat label="平均重要度" value={(stats.averageImportance ?? 0).toFixed(2)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" leftIcon={<Download size={13} />} onClick={exportData}>
                导出全部数据 (JSON)
              </Button>
              <Button
                variant="danger"
                size="sm"
                leftIcon={<Trash2 size={13} />}
                onClick={async () => {
                  if (confirm('确认清空所有记忆？此操作不可恢复。')) {
                    await api.post('/memory/clear');
                    toast({ type: 'success', title: '已清空' });
                  }
                }}
              >
                清空记忆
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="text-sm font-semibold flex items-center gap-2">
            <Heart size={14} /> 关于
          </div>
        </CardHeader>
        <CardBody>
          <div className="text-sm text-fg-soft space-y-2">
            <p>
              <span className="font-semibold text-fg">Personal-Assistant Web</span> · v2.0
            </p>
            <p>Pipeline 驱动的 AI 智能体 · 真实 LLM / 真实工具 / 真实记忆</p>
            <ul className="text-xs text-fg-mute list-disc ml-4 space-y-0.5">
              <li>React 18 + TypeScript + Vite</li>
              <li>Express 后端 · 复用 src/ 中的真实 Adapter</li>
              <li>10 个 LLM Provider · 0 mock</li>
              <li>7 个真实工具：writeFile / readFile / shell / search / remember / analyze / respond</li>
              <li>6 阶段 Pipeline：Initialize → Understand → Plan → Execute → Validate → Reflect</li>
            </ul>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function DataStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-[10.5px] text-fg-mute">{label}</div>
      <div className="text-lg font-semibold font-mono">{value}</div>
    </div>
  );
}
