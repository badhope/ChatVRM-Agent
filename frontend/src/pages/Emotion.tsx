import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Heart, Sparkles, Loader2, AlertCircle, RefreshCw, Activity,
  TrendingDown, RotateCcw, Trash2, CheckCircle2, Wand2,
} from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Input, Textarea, Select } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/ErrorState';
import { AIGenerateDialog } from '@/components/AIGenerateDialog';
import { api } from '@/api/client';
import { useAsyncState } from '@/hooks/useAsyncState';
import { classifyError, isRetryable } from '@/utils/errors';
import { toast } from '@/components/Toast';
import { cn } from '@/utils';

const EMOTION_KEYS = ['neutral', 'excited', 'confident', 'cautious', 'frustrated', 'tired'] as const;
type EmotionKey = typeof EMOTION_KEYS[number];

const EMOTION_EMOJI: Record<EmotionKey, string> = {
  neutral: '😐',
  excited: '🤩',
  confident: '😎',
  cautious: '🤔',
  frustrated: '😤',
  tired: '😩',
};

const EMOTION_COLOR: Record<EmotionKey, string> = {
  neutral: 'bg-fg-mute/30',
  excited: 'bg-warning',
  confident: 'bg-brand',
  cautious: 'bg-info',
  frustrated: 'bg-danger',
  tired: 'bg-fg-mute/60',
};

interface EmotionState {
  name: string;
  intensity: number;
  lastUpdated: string;
  triggers: string[];
}

interface HistoryEntry {
  id: number;
  name: string;
  intensity: number;
  triggers: string[];
  source: 'manual' | 'interaction' | 'reset' | 'ai';
  timestamp: string;
  note?: string;
}

interface HistoryResponse {
  total: number;
  count: number;
  items: HistoryEntry[];
}

function isEmotion(v: unknown): v is EmotionState {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as EmotionState;
  return typeof e.name === 'string' && typeof e.intensity === 'number' && Array.isArray(e.triggers);
}

function emotionKey(name: string): EmotionKey {
  return (EMOTION_KEYS as readonly string[]).includes(name) ? (name as EmotionKey) : 'neutral';
}

export function Emotion() {
  const { t } = useTranslation();

  // ---------- Data ----------
  const fetchCurrent = useCallback(async (): Promise<EmotionState> => {
    const raw = await api.get<unknown>('/emotion');
    if (!isEmotion(raw)) throw new Error('Bad response');
    return raw;
  }, []);
  const fetchHistory = useCallback(async (): Promise<HistoryResponse> => {
    const raw = await api.get<unknown>('/emotion/history?limit=100');
    if (typeof raw !== 'object' || raw === null) throw new Error('Bad response');
    const r = raw as Partial<HistoryResponse>;
    return {
      total: typeof r.total === 'number' ? r.total : 0,
      count: typeof r.count === 'number' ? r.count : 0,
      items: Array.isArray(r.items) ? r.items : [],
    };
  }, []);

  const current = useAsyncState<EmotionState>(fetchCurrent, { label: 'emotion.current', ttlMs: 10_000 });
  const history = useAsyncState<HistoryResponse>(fetchHistory, { label: 'emotion.history', ttlMs: 10_000 });

  const reload = useCallback(async () => {
    await Promise.all([current.run(), history.run()]);
  }, [current, history]);

  // ---------- Manual edit ----------
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState<EmotionKey>('neutral');
  const [editIntensity, setEditIntensity] = useState(20);
  const [editTriggers, setEditTriggers] = useState('');
  const [editNote, setEditNote] = useState('');
  const [saving, setSaving] = useState(false);

  const openEdit = useCallback(() => {
    const e = current.data;
    if (!e) return;
    setEditName(emotionKey(e.name));
    setEditIntensity(e.intensity);
    setEditTriggers(e.triggers.join('\n'));
    setEditNote('');
    setEditOpen(true);
  }, [current.data]);

  const saveManual = useCallback(async () => {
    setSaving(true);
    try {
      const triggers = editTriggers.split('\n').map((s) => s.trim()).filter(Boolean).slice(-10);
      await api.post('/emotion/update', {
        name: editName,
        intensity: editIntensity,
        triggers,
        note: editNote.trim() || undefined,
      });
      toast({ type: 'success', title: t('emotionPage.saveOk') });
      setEditOpen(false);
      await reload();
    } catch (raw) {
      const err = classifyError(raw);
      toast({ type: 'error', title: t('emotionPage.saveFailed'), message: t(`errors.kind.${err.kind}`, err.message) });
    } finally {
      setSaving(false);
    }
  }, [editName, editIntensity, editTriggers, editNote, reload, t]);

  // ---------- Decay ----------
  const [decaying, setDecaying] = useState(false);
  const doDecay = useCallback(async () => {
    setDecaying(true);
    try {
      await api.post('/emotion/decay');
      toast({ type: 'success', title: t('emotionPage.saveOk') });
      await reload();
    } catch (raw) {
      const err = classifyError(raw);
      toast({ type: 'error', title: t('emotionPage.saveFailed'), message: t(`errors.kind.${err.kind}`, err.message) });
    } finally {
      setDecaying(false);
    }
  }, [reload, t]);

  // ---------- Reset / clear history ----------
  const [resetting, setResetting] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const doReset = useCallback(async () => {
    setResetting(true);
    try {
      await api.post('/emotion/reset');
      toast({ type: 'success', title: t('emotionPage.resetOk') });
      setResetOpen(false);
      await reload();
    } catch (raw) {
      const err = classifyError(raw);
      toast({ type: 'error', title: t('emotionPage.saveFailed'), message: t(`errors.kind.${err.kind}`, err.message) });
    } finally {
      setResetting(false);
    }
  }, [reload, t]);

  const doClearHistory = useCallback(async () => {
    try {
      await api.delete('/emotion/history');
      toast({ type: 'success', title: t('emotionPage.clearedHistory') });
      setClearOpen(false);
      await reload();
    } catch (raw) {
      const err = classifyError(raw);
      toast({ type: 'error', title: t('emotionPage.saveFailed'), message: t(`errors.kind.${err.kind}`, err.message) });
    }
  }, [reload, t]);

  // ---------- AI analyze ----------
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiApplying, setAiApplying] = useState(false);

  const applyAI = useCallback(async (parsed: unknown) => {
    if (!parsed || typeof parsed !== 'object') return;
    const p = parsed as Record<string, unknown>;
    const name = typeof p.name === 'string' ? p.name : 'neutral';
    const intensity = typeof p.intensity === 'number' ? Math.max(0, Math.min(100, p.intensity)) : 50;
    const triggers = Array.isArray(p.triggers)
      ? (p.triggers as unknown[]).filter((x): x is string => typeof x === 'string').slice(-10)
      : [];
    setAiApplying(true);
    try {
      await api.post('/emotion/update', { name, intensity, triggers, note: 'AI suggestion' });
      toast({ type: 'success', title: t('emotionPage.saveOk') });
      setAiOpen(false);
      await reload();
    } catch (raw) {
      const err = classifyError(raw);
      toast({ type: 'error', title: t('emotionPage.aiFailed'), message: t(`errors.kind.${err.kind}`, err.message) });
    } finally {
      setAiApplying(false);
    }
  }, [reload, t]);

  const error = current.error ?? history.error;

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Heart size={18} /> {t('emotionPage.title')}
          </h1>
          <p className="text-sm text-fg-mute mt-1">{t('emotionPage.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={reload}
            leftIcon={<RefreshCw size={12} className={current.loading ? 'animate-spin' : ''} />}
            disabled={current.loading}
          >
            {t('common.refresh')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Sparkles size={12} />}
            onClick={() => { setAiText(''); setAiOpen(true); }}
          >
            {t('emotionPage.aiAnalyze')}
          </Button>
        </div>
      </div>

      {error && (
        <ErrorState
          error={error}
          onRetry={isRetryable(error) ? reload : undefined}
        />
      )}

      {/* Current emotion card */}
      {current.data && (
        <Card>
          <CardHeader>
            <div className="text-sm font-semibold flex items-center gap-2">
              <Activity size={14} /> {t('emotionPage.currentTitle')}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" leftIcon={<Wand2 size={11} />} onClick={openEdit}>
                {t('emotionPage.setManual')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<TrendingDown size={11} />}
                onClick={doDecay}
                loading={decaying}
                disabled={decaying}
                title={t('emotionPage.decayHint')}
              >
                {t('emotionPage.decay')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                leftIcon={<RotateCcw size={11} />}
                onClick={() => setResetOpen(true)}
              >
                {t('emotionPage.reset')}
              </Button>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="text-5xl">
                {EMOTION_EMOJI[emotionKey(current.data.name)]}
              </div>
              <div className="flex-1">
                <div className="text-lg font-medium capitalize">
                  {t(`emotionPage.nameOptions.${emotionKey(current.data.name)}`, current.data.name)}
                </div>
                <div className="text-[10.5px] text-fg-mute">
                  {t('emotionPage.lastUpdated')}: {new Date(current.data.lastUpdated).toLocaleString()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10.5px] text-fg-mute uppercase">{t('emotionPage.intensity')}</div>
                <div className="text-2xl font-mono">{current.data.intensity}<span className="text-fg-mute text-sm">/100</span></div>
              </div>
            </div>

            {/* Intensity bar */}
            <div>
              <div className="h-3 w-full rounded-full bg-bg-soft border border-border overflow-hidden relative">
                <div
                  className={cn('h-full transition-all duration-500', EMOTION_COLOR[emotionKey(current.data.name)])}
                  style={{ width: `${Math.max(0, Math.min(100, current.data.intensity))}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-fg-mute font-mono mt-0.5">
                <span>0</span><span>50</span><span>100</span>
              </div>
            </div>

            {/* Triggers */}
            {current.data.triggers.length > 0 && (
              <div>
                <div className="text-[10.5px] uppercase tracking-wide text-fg-mute mb-1.5">
                  {t('emotionPage.triggersRecent')}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {current.data.triggers.slice(-8).reverse().map((tg, i) => (
                    <Badge key={`${tg}-${i}`} variant="muted" size="sm">{tg}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader>
          <div className="text-sm font-semibold flex items-center gap-2">
            {t('emotionPage.historyTitle')} ({history.data?.count ?? 0})
          </div>
          <Button
            variant="danger"
            size="sm"
            leftIcon={<Trash2 size={11} />}
            onClick={() => setClearOpen(true)}
            disabled={!history.data || history.data.count === 0}
          >
            {t('emotionPage.clearHistory')}
          </Button>
        </CardHeader>
        <CardBody>
          {history.loading && !history.data && (
            <div className="text-sm text-fg-mute flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> {t('common.loading')}
            </div>
          )}
          {history.data && history.data.items.length === 0 && (
            <div className="text-xs text-fg-mute flex items-center gap-2">
              <AlertCircle size={12} /> {t('emotionPage.noHistory')}
            </div>
          )}
          {history.data && history.data.items.length > 0 && (
            <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
              {history.data.items.map((h) => (
                <HistoryRow key={h.id} h={h} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Manual edit modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={t('emotionPage.setManual')}
        size="md"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-fg-soft mb-1.5">{t('emotionPage.name')}</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {EMOTION_KEYS.map((k) => (
                <button
                  key={k}
                  onClick={() => setEditName(k)}
                  className={cn(
                    'flex flex-col items-center gap-0.5 p-2 rounded-md border text-[10.5px] transition-colors',
                    editName === k
                      ? 'border-brand/60 bg-brand/10 text-brand'
                      : 'border-border text-fg-soft hover:bg-bg-soft',
                  )}
                >
                  <span className="text-xl">{EMOTION_EMOJI[k]}</span>
                  <span>{t(`emotionPage.nameOptions.${k}`)}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-fg-soft mb-1.5">
              {t('emotionPage.intensity')}: {editIntensity}/100
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={editIntensity}
              onChange={(e) => setEditIntensity(parseInt(e.target.value, 10))}
              className="w-full"
            />
          </div>
          <Textarea
            label="Triggers (one per line)"
            value={editTriggers}
            onChange={(e) => setEditTriggers(e.target.value)}
            rows={3}
            placeholder="user_praised, code_review"
          />
          <Input
            label={t('emotionPage.noteOptional')}
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            placeholder="e.g. nightly mood reset"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" leftIcon={<CheckCircle2 size={13} />} loading={saving} disabled={saving} onClick={saveManual}>
              {t('emotionPage.save')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* AI analyze modal wrapper (we wrap the shared dialog so we can collect text first) */}
      <Modal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        title={t('emotionPage.aiAnalyze')}
        size="md"
      >
        <div className="space-y-3">
          <Textarea
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            rows={5}
            placeholder={t('emotionPage.aiPromptPlaceholder')}
            label={t('emotionPage.aiPrompt')}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAiOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              leftIcon={<Sparkles size={13} />}
              loading={aiApplying}
              disabled={aiApplying || !aiText.trim()}
              onClick={async () => {
                setAiApplying(true);
                try {
                  const r = await api.post<{ ok: boolean; parsed?: unknown; content?: string; error?: string }>(
                    '/ai/generate',
                    { type: 'emotion', prompt: aiText.trim(), temperature: 0.3, maxTokens: 256 },
                  );
                  if (r.ok && r.parsed) {
                    await applyAI(r.parsed);
                  } else {
                    toast({ type: 'error', title: t('emotionPage.aiFailed'), message: r.error ?? 'unknown' });
                  }
                } catch (raw) {
                  const err = classifyError(raw);
                  toast({ type: 'error', title: t('emotionPage.aiFailed'), message: t(`errors.kind.${err.kind}`, err.message) });
                } finally {
                  setAiApplying(false);
                }
              }}
            >
              {t('emotionPage.aiRun')}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={resetOpen}
        title={t('emotionPage.reset')}
        message={t('emotionPage.resetConfirm')}
        confirmLabel={t('emotionPage.reset')}
        cancelLabel={t('common.cancel')}
        onConfirm={doReset}
        onCancel={() => setResetOpen(false)}
      />
      <ConfirmDialog
        open={clearOpen}
        title={t('emotionPage.clearHistory')}
        message={t('emotionPage.clearHistoryConfirm')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={doClearHistory}
        onCancel={() => setClearOpen(false)}
      />
    </div>
  );
}

function HistoryRow({ h }: { h: HistoryEntry }) {
  const { t } = useTranslation();
  const key = emotionKey(h.name);
  return (
    <div className="flex items-center gap-3 p-2 rounded-md border border-border bg-bg-soft/50 hover:bg-bg-soft transition-colors">
      <span className="text-lg">{EMOTION_EMOJI[key]}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium capitalize">
            {t(`emotionPage.nameOptions.${key}`, h.name)}
          </span>
          <Badge
            variant={h.source === 'ai' ? 'brand' : h.source === 'reset' ? 'warning' : 'muted'}
            size="sm"
          >
            {h.source}
          </Badge>
        </div>
        <div className="text-[10.5px] text-fg-mute">
          {new Date(h.timestamp).toLocaleString()}
          {h.note && <span className="ml-1.5 italic">— {h.note}</span>}
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-mono">{h.intensity}</div>
        <div className="h-1.5 w-16 rounded-full bg-bg overflow-hidden border border-border">
          <div
            className={cn('h-full', EMOTION_COLOR[key])}
            style={{ width: `${Math.max(0, Math.min(100, h.intensity))}%` }}
          />
        </div>
      </div>
    </div>
  );
}
