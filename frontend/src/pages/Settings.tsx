import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, Smile, Trash2, Download, RefreshCw, AlertCircle, Info, Heart, Loader2 } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/ErrorState';
import { api } from '@/api/client';
import { useThemeStore } from '@/stores/theme';
import { cn, formatTime } from '@/utils';
import { toast } from '@/components/Toast';
import { useAsyncState } from '@/hooks/useAsyncState';
import { classifyError, isRetryable, type AppError } from '@/utils/errors';
import type { EmotionState } from '@/types';

interface PersonalityOption {
  id: string;
  name: string;
  description: string;
  systemPrompt?: string;
}

interface MemoryStats {
  count: number;
  totalTokens: number;
  avgImportance: number;
}

const PERSONALITY_EMOJI: Record<string, string> = {
  friendly_mentor: '👨‍🏫',
  tech_expert: '🧑‍💻',
  creative_genius: '🎨',
  pragmatic_worker: '🤵',
};

function emojiFor(id: string): string {
  return PERSONALITY_EMOJI[id] ?? '🙂';
}

function isPersonalityOption(v: unknown): v is PersonalityOption {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as PersonalityOption).id === 'string' &&
    typeof (v as PersonalityOption).name === 'string'
  );
}

function isEmotionState(v: unknown): v is EmotionState {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Partial<EmotionState>;
  return (
    typeof e.name === 'string' &&
    typeof e.intensity === 'number' &&
    typeof e.lastUpdated === 'string' &&
    Array.isArray(e.triggers)
  );
}

function isMemoryStats(v: unknown): v is MemoryStats {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.count === 'number' && typeof r.total === 'number';
}

export function Settings() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('zh') ? 'zh' : 'en';
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  // ---------------- Data fetchers ----------------
  const fetchEmotion = useCallback(async (): Promise<EmotionState> => {
    const raw = await api.get<unknown>('/emotion');
    if (!isEmotionState(raw)) {
      const err: AppError = { kind: 'parse', message: t('errors.kind.parse') };
      throw err;
    }
    return raw;
  }, [t]);

  const fetchStats = useCallback(async (): Promise<MemoryStats> => {
    const raw = await api.get<unknown>('/memory?limit=1');
    if (!isMemoryStats(raw)) {
      const err: AppError = { kind: 'parse', message: t('errors.kind.parse') };
      throw err;
    }
    return {
      count: raw.count,
      totalTokens: raw.totalTokens ?? 0,
      avgImportance: raw.avgImportance ?? 0,
    };
  }, [t]);

  const fetchPersonalities = useCallback(async (): Promise<{
    current: string;
    list: PersonalityOption[];
  }> => {
    const raw = await api.get<{ current: unknown; list: unknown }>('/personality');
    const list = Array.isArray(raw?.list) ? raw.list.filter(isPersonalityOption) : [];
    return {
      current: typeof raw?.current === 'string' ? raw.current : '',
      list,
    };
  }, []);

  const emotion = useAsyncState<EmotionState>(fetchEmotion, { label: 'emotion', ttlMs: 15_000 });
  const stats = useAsyncState<MemoryStats>(fetchStats, { label: 'stats', ttlMs: 10_000 });
  const personalities = useAsyncState<{ current: string; list: PersonalityOption[] }>(
    fetchPersonalities,
    { label: 'personality', ttlMs: 60_000 },
  );

  // ---------------- Action state ----------------
  const [switching, setSwitching] = useState<string | null>(null); // id being switched
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const inFlightSwitchRef = useRef<string | null>(null);

  // ---------------- Actions ----------------
  const switchPersonality = useCallback(
    async (id: string) => {
      if (!id) return;
      if (inFlightSwitchRef.current === id) return; // dedupe rapid clicks on same target
      if (switching) return; // another switch in flight
      inFlightSwitchRef.current = id;
      setSwitching(id);
      try {
        await api.post('/personality/set', { id });
        // Re-fetch to keep list in sync (server is source of truth).
        await personalities.run();
        const p = (personalities.data?.list ?? []).find((x) => x.id === id);
        const displayName = t(`settings.personalities.${id}.name`, p?.name ?? id);
        toast({ type: 'success', title: t('settings.switchedTo', { name: displayName }) });
      } catch (rawErr) {
        const err = classifyError(rawErr);
        // Roll back by re-running so server remains source of truth.
        void personalities.run();
        toast({
          type: 'error',
          title: t('settings.switchFailed'),
          message: t(`errors.kind.${err.kind}`, err.message),
        });
      } finally {
        inFlightSwitchRef.current = null;
        setSwitching(null);
      }
    },
    [personalities, switching, t],
  );

  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const raw = await api.get<{ items: unknown[]; total: number }>('/memory?limit=100000');
      const items = Array.isArray(raw?.items) ? raw.items : [];
      if (items.length === 0) {
        toast({ type: 'info', title: t('settings.exportEmpty') });
        return;
      }
      const data = {
        exportedAt: new Date().toISOString(),
        memory: items,
        total: raw?.total ?? items.length,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `personal-assistant-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ type: 'success', title: t('settings.exportDone') });
    } catch (rawErr) {
      const err = classifyError(rawErr);
      toast({
        type: 'error',
        title: t('settings.exportFailed'),
        message: t(`errors.kind.${err.kind}`, err.message),
      });
    } finally {
      setExporting(false);
    }
  }, [exporting, t]);

  const handleClearMemory = useCallback(async () => {
    if (clearing) return;
    setClearing(true);
    try {
      await api.post('/memory/clear');
      toast({ type: 'success', title: t('settings.cleared') });
      setConfirmOpen(false);
      // Refetch stats immediately so the UI updates without waiting on TTL.
      await stats.run();
    } catch (rawErr) {
      const err = classifyError(rawErr);
      toast({
        type: 'error',
        title: t('settings.clearFailed'),
        message: t(`errors.kind.${err.kind}`, err.message),
      });
    } finally {
      setClearing(false);
    }
  }, [clearing, stats, t]);

  // ---------------- Derived ----------------
  const personalityList = personalities.data?.list ?? [];
  const currentPersonality = personalities.data?.current ?? '';
  const emotionData = emotion.data;
  const statsData = stats.data;

  const lastUpdatedLabel = useCallback(
    (ts: number | null) => {
      if (!ts) return t('errors.neverUpdated');
      return t('settings.lastUpdatedAt', { time: formatTime(new Date(ts).toISOString(), lang) });
    },
    [lang, t],
  );

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('settings.title')}</h1>
        <p className="text-sm text-fg-mute mt-1">{t('settings.subtitle')}</p>
      </div>

      {/* ============ Theme ============ */}
      <Card>
        <CardHeader>
          <div className="text-sm font-semibold flex items-center gap-2">
            {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />} {t('settings.theme')}
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setTheme('light')}
              className={cn(
                'p-3 rounded-md border text-left transition-all',
                theme === 'light' ? 'border-brand/60 bg-brand/8' : 'border-border hover:bg-bg-soft',
              )}
            >
              <div className="flex items-center gap-2">
                <Sun size={14} className="text-warning" />
                <span className="text-sm font-medium">{t('settings.light')}</span>
              </div>
              <p className="text-[10.5px] text-fg-mute mt-1">{t('settings.lightHint')}</p>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={cn(
                'p-3 rounded-md border text-left transition-all',
                theme === 'dark' ? 'border-brand/60 bg-brand/8' : 'border-border hover:bg-bg-soft',
              )}
            >
              <div className="flex items-center gap-2">
                <Moon size={14} className="text-info" />
                <span className="text-sm font-medium">{t('settings.dark')}</span>
              </div>
              <p className="text-[10.5px] text-fg-mute mt-1">{t('settings.darkHint')}</p>
            </button>
          </div>
        </CardBody>
      </Card>

      {/* ============ Personality ============ */}
      <Card>
        <CardHeader>
          <div className="text-sm font-semibold flex items-center gap-2">
            <Smile size={14} /> {t('settings.personalityTitle')}
            {personalities.loading && <Loader2 size={12} className="animate-spin text-fg-mute" />}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={personalities.retry}
            leftIcon={<RefreshCw size={12} />}
            disabled={personalities.loading}
          >
            {t('common.refresh')}
          </Button>
        </CardHeader>
        <CardBody className="space-y-2">
          {personalities.status === 'error' && personalities.error && (
            <ErrorState
              error={personalities.error}
              message={t('settings.personalityLoadFailed')}
              onRetry={isRetryable(personalities.error) ? personalities.retry : undefined}
            />
          )}

          {personalities.status !== 'error' && personalityList.length === 0 && personalities.loading && (
            <div className="text-sm text-fg-mute flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> {t('settings.loading')}
            </div>
          )}

          {personalityList.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {personalityList.map((p) => {
                const isCurrent = currentPersonality === p.id;
                const isLoading = switching === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => switchPersonality(p.id)}
                    disabled={Boolean(switching)}
                    className={cn(
                      'p-3 rounded-md border text-left transition-all',
                      'disabled:opacity-60 disabled:pointer-events-none',
                      isCurrent ? 'border-brand/60 bg-brand/8' : 'border-border hover:bg-bg-soft',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{emojiFor(p.id)}</span>
                      <span className="text-sm font-medium">
                        {t(`settings.personalities.${p.id}.name`, p.name)}
                      </span>
                      {isLoading && <Loader2 size={12} className="animate-spin text-fg-mute" />}
                      {isCurrent && !isLoading && (
                        <Badge variant="brand" size="sm">{t('settings.currentPersonality')}</Badge>
                      )}
                    </div>
                    <p className="text-[10.5px] text-fg-mute mt-1">
                      {t(`settings.personalities.${p.id}.desc`, p.description)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {personalities.lastUpdated && (
            <div
              className={cn(
                'text-[10.5px] font-mono',
                personalities.isStale ? 'text-warning' : 'text-fg-mute',
              )}
            >
              {lastUpdatedLabel(personalities.lastUpdated)}
              {personalities.isStale && ` · ${t('errors.dataStale')}`}
            </div>
          )}
        </CardBody>
      </Card>

      {/* ============ Emotion ============ */}
      <Card>
        <CardHeader>
          <div className="text-sm font-semibold flex items-center gap-2">
            <Heart size={14} /> {t('settings.emotionTitle')}
            {emotion.loading && <Loader2 size={12} className="animate-spin text-fg-mute" />}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={emotion.retry}
            leftIcon={<RefreshCw size={12} className={emotion.loading ? 'animate-spin' : ''} />}
            disabled={emotion.loading}
          >
            {t('common.refresh')}
          </Button>
        </CardHeader>
        <CardBody className="space-y-2">
          {emotion.status === 'error' && emotion.error && (
            <ErrorState
              error={emotion.error}
              message={t('settings.refreshFailed')}
              onRetry={isRetryable(emotion.error) ? emotion.retry : undefined}
            />
          )}

          {emotionData && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-md bg-bg-soft flex items-center justify-center text-2xl">
                  {emotionEmoji(emotionData.name)}
                </div>
                <div>
                  <div className="text-base font-medium">
                    {t(`settings.emotionNames.${emotionData.name}`, emotionData.name)}
                  </div>
                  <div className="text-xs text-fg-mute">
                    {t('settings.intensityFormat', { n: Math.round(emotionData.intensity) })}
                  </div>
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-bg-soft overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-info to-brand transition-all"
                  style={{ width: `${emotionData.intensity}%` }}
                />
              </div>
              {emotionData.triggers && emotionData.triggers.length > 0 && (
                <div>
                  <div className="text-xs text-fg-soft mb-1.5">
                    {t('settings.triggersCount', { n: emotionData.triggers.length })}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {emotionData.triggers.slice(0, 5).map((tr, i) => (
                      <Badge key={i} variant="info" size="sm">
                        {tr}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!emotionData && emotion.status !== 'error' && !emotion.loading && (
            <div className="text-sm text-fg-mute flex items-center gap-2">
              <AlertCircle size={14} /> —
            </div>
          )}

          {emotion.lastUpdated && (
            <div
              className={cn(
                'text-[10.5px] font-mono',
                emotion.isStale ? 'text-warning' : 'text-fg-mute',
              )}
            >
              {t('settings.lastUpdated')}: {formatTime(emotionData?.lastUpdated ?? new Date(emotion.lastUpdated).toISOString(), lang)}
              {emotion.isStale && ` · ${t('errors.dataStale')}`}
            </div>
          )}
        </CardBody>
      </Card>

      {/* ============ Data ============ */}
      <Card>
        <CardHeader>
          <div className="text-sm font-semibold flex items-center gap-2">
            {t('settings.dataTitle')}
            {stats.loading && <Loader2 size={12} className="animate-spin text-fg-mute" />}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={stats.retry}
            leftIcon={<RefreshCw size={12} />}
            disabled={stats.loading}
          >
            {t('common.refresh')}
          </Button>
        </CardHeader>
        <CardBody className="space-y-3">
          {stats.status === 'error' && stats.error && (
            <ErrorState
              error={stats.error}
              message={t('settings.statsLoadFailed')}
              onRetry={isRetryable(stats.error) ? stats.retry : undefined}
            />
          )}

          {statsData && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-bg-soft rounded-md p-2.5">
                <div className="text-base font-semibold">{statsData.count.toLocaleString()}</div>
                <div className="text-[10.5px] text-fg-mute">{t('settings.totalRecords')}</div>
              </div>
              <div className="bg-bg-soft rounded-md p-2.5">
                <div className="text-base font-semibold">{statsData.totalTokens.toLocaleString()}</div>
                <div className="text-[10.5px] text-fg-mute">{t('settings.totalTokens')}</div>
              </div>
              <div className="bg-bg-soft rounded-md p-2.5">
                <div className="text-base font-semibold">{statsData.avgImportance.toFixed(1)}</div>
                <div className="text-[10.5px] text-fg-mute">{t('settings.averageImportance')}</div>
              </div>
            </div>
          )}

          {stats.lastUpdated && (
            <div
              className={cn(
                'text-[10.5px] font-mono',
                stats.isStale ? 'text-warning' : 'text-fg-mute',
              )}
            >
              {lastUpdatedLabel(stats.lastUpdated)}
              {stats.isStale && ` · ${t('errors.dataStale')}`}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              leftIcon={<Download size={13} />}
              onClick={handleExport}
              className="flex-1"
              loading={exporting}
              disabled={exporting || stats.status === 'error'}
            >
              {t('settings.exportAll')}
            </Button>
            <Button
              variant="danger"
              leftIcon={<Trash2 size={13} />}
              onClick={() => setConfirmOpen(true)}
              disabled={clearing || stats.status === 'error'}
            >
              {t('settings.clearMemory')}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* ============ About ============ */}
      <Card>
        <CardHeader>
          <div className="text-sm font-semibold flex items-center gap-2">
            <Info size={14} /> {t('settings.about')}
          </div>
        </CardHeader>
        <CardBody className="text-xs text-fg-soft space-y-1.5">
          <div>· {t('settings.aboutLine1')}</div>
          <div>· {t('settings.aboutLine2')}</div>
          <div>· {t('settings.aboutStack')}</div>
          <div>· {t('settings.aboutBackend')}</div>
          <div>· {t('settings.aboutProviders')}</div>
          <div>· {t('settings.aboutTools')}</div>
          <div>· {t('settings.aboutPipeline')}</div>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title={t('settings.confirmClearTitle')}
        message={t('settings.confirmClearMessage')}
        details={
          statsData
            ? t('memory.clearAllHint', { n: statsData.count })
            : undefined
        }
        confirmLabel={t('settings.confirmOk')}
        cancelLabel={t('settings.confirmCancel')}
        loading={clearing}
        onConfirm={handleClearMemory}
        onCancel={() => !clearing && setConfirmOpen(false)}
      />
    </div>
  );
}

function emotionEmoji(name: string): string {
  const map: Record<string, string> = {
    neutral: '😐',
    excited: '🤩',
    confident: '😎',
    cautious: '🤔',
    frustrated: '😤',
    tired: '😴',
  };
  return map[name] ?? '🙂';
}
