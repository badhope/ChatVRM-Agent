import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, Smile, Trash2, Download, RefreshCw, AlertCircle, Info, Heart } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { api } from '@/api/client';
import { useThemeStore } from '@/stores/theme';
import { cn, formatTime } from '@/utils';
import { toast } from '@/components/Toast';
import type { EmotionState } from '@/types';

const PERSONALITIES = [
  { id: 'default', name: 'default', emoji: '🧑‍💻', desc: 'Balanced, professional, efficient' },
  { id: 'mentor', name: 'mentor', emoji: '👨‍🏫', desc: 'Patient, didactic, encouraging' },
  { id: 'pirate', name: 'pirate', emoji: '🏴‍☠️', desc: 'Adventurous, colourful, witty' },
  { id: 'conservative', name: 'conservative', emoji: '🤵', desc: 'Cautious, formal, low-risk' },
  { id: 'creative', name: 'creative', emoji: '🎨', desc: 'Imaginative, bold, divergent' },
] as const;

export function Settings() {
  const { t } = useTranslation();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [emotion, setEmotion] = useState<EmotionState | null>(null);
  const [loadingEmotion, setLoadingEmotion] = useState(false);
  const [currentPersonality, setCurrentPersonality] = useState('default');
  const [stats, setStats] = useState<{ count: number; totalTokens: number; avgImportance: number } | null>(null);

  useEffect(() => {
    loadEmotion();
    loadStats();
  }, []);

  async function loadEmotion() {
    setLoadingEmotion(true);
    try {
      const res = await api.get<EmotionState>('/emotion');
      setEmotion(res);
    } catch (err) {
      toast({ type: 'error', title: t('settings.refreshFailed'), message: String(err) });
    } finally {
      setLoadingEmotion(false);
    }
  }

  async function loadStats() {
    try {
      const res = await api.get<{ items: unknown[]; count: number; total: number; totalTokens?: number; avgImportance?: number }>(
        '/memory?limit=1',
      );
      setStats({ count: res.count, totalTokens: res.totalTokens ?? 0, avgImportance: res.avgImportance ?? 0 });
    } catch {
      setStats({ count: 0, totalTokens: 0, avgImportance: 0 });
    }
  }

  async function switchPersonality(id: string) {
    setCurrentPersonality(id);
    try {
      await api.post('/personality', { id });
      const p = PERSONALITIES.find((x) => x.id === id);
      toast({ type: 'success', title: t('settings.switchedTo', { name: p?.name ?? id }) });
    } catch (err) {
      toast({ type: 'error', title: t('settings.switchFailed'), message: String(err) });
    }
  }

  async function handleExport() {
    try {
      const res = await api.get<{ items: unknown[]; total: number }>('/memory?limit=100000');
      const data = { exportedAt: new Date().toISOString(), memory: res.items, total: res.total };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `personal-assistant-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ type: 'success', title: t('settings.exportDone') });
    } catch (err) {
      toast({ type: 'error', title: t('settings.exportFailed'), message: String(err) });
    }
  }

  async function handleClearMemory() {
    if (!confirm(t('settings.clearConfirm'))) return;
    try {
      await api.post('/memory/clear');
      toast({ type: 'success', title: t('settings.cleared') });
      loadStats();
    } catch (err) {
      toast({ type: 'error', title: t('settings.clearConfirm'), message: String(err) });
    }
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('settings.title')}</h1>
        <p className="text-sm text-fg-mute mt-1">{t('settings.subtitle')}</p>
      </div>

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

      <Card>
        <CardHeader>
          <div className="text-sm font-semibold flex items-center gap-2">
            <Smile size={14} /> {t('settings.personalityTitle')}
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PERSONALITIES.map((p) => (
              <button
                key={p.id}
                onClick={() => switchPersonality(p.id)}
                className={cn(
                  'p-3 rounded-md border text-left transition-all',
                  currentPersonality === p.id ? 'border-brand/60 bg-brand/8' : 'border-border hover:bg-bg-soft',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{p.emoji}</span>
                  <span className="text-sm font-medium">{p.name}</span>
                  {currentPersonality === p.id && <Badge variant="brand" size="sm">{t('settings.currentPersonality')}</Badge>}
                </div>
                <p className="text-[10.5px] text-fg-mute mt-1">{p.desc}</p>
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-sm font-semibold flex items-center gap-2">
            <Heart size={14} /> {t('settings.emotionTitle')}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadEmotion}
            leftIcon={<RefreshCw size={12} className={loadingEmotion ? 'animate-spin' : ''} />}
            disabled={loadingEmotion}
          >
            {t('settings.refresh')}
          </Button>
        </CardHeader>
        <CardBody>
          {emotion ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-md bg-bg-soft flex items-center justify-center text-2xl">
                  {emotionEmoji(emotion.name)}
                </div>
                <div>
                  <div className="text-base font-medium">{t(`settings.emotionNames.${emotion.name}`, emotion.name)}</div>
                  <div className="text-xs text-fg-mute">
                    {t('settings.intensityFormat', { n: Math.round(emotion.intensity) })}
                  </div>
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-bg-soft overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-info to-brand transition-all"
                  style={{ width: `${emotion.intensity}%` }}
                />
              </div>
              <div className="text-[10.5px] text-fg-mute font-mono">
                {t('settings.lastUpdated')}: {formatTime(emotion.lastUpdated)}
              </div>
              {emotion.triggers && emotion.triggers.length > 0 && (
                <div>
                  <div className="text-xs text-fg-soft mb-1.5">
                    {t('settings.triggersCount', { n: emotion.triggers.length })}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {emotion.triggers.slice(0, 5).map((tr, i) => (
                      <Badge key={i} variant="info" size="sm">
                        {tr}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-fg-mute flex items-center gap-2">
              <AlertCircle size={14} /> —
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="text-sm font-semibold">{t('settings.dataTitle')}</div>
        </CardHeader>
        <CardBody className="space-y-3">
          {stats && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-bg-soft rounded-md p-2.5">
                <div className="text-base font-semibold">{stats.count}</div>
                <div className="text-[10.5px] text-fg-mute">{t('settings.totalRecords')}</div>
              </div>
              <div className="bg-bg-soft rounded-md p-2.5">
                <div className="text-base font-semibold">{stats.totalTokens.toLocaleString()}</div>
                <div className="text-[10.5px] text-fg-mute">{t('settings.totalTokens')}</div>
              </div>
              <div className="bg-bg-soft rounded-md p-2.5">
                <div className="text-base font-semibold">{stats.avgImportance.toFixed(1)}</div>
                <div className="text-[10.5px] text-fg-mute">{t('settings.averageImportance')}</div>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" leftIcon={<Download size={13} />} onClick={handleExport} className="flex-1">
              {t('settings.exportAll')}
            </Button>
            <Button variant="danger" leftIcon={<Trash2 size={13} />} onClick={handleClearMemory}>
              {t('settings.clearMemory')}
            </Button>
          </div>
        </CardBody>
      </Card>

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
