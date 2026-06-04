import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Smile, Sparkles, Loader2, Plus, Copy, Pencil, Trash2,
  AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Star, RefreshCw,
} from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Input, Textarea } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/ErrorState';
import { AIGenerateDialog, type AIGenerateResult } from '@/components/AIGenerateDialog';
import { api } from '@/api/client';
import { useAsyncState } from '@/hooks/useAsyncState';
import { classifyError, isRetryable } from '@/utils/errors';
import { toast } from '@/components/Toast';
import { cn } from '@/utils';

interface PersonalityTraits {
  traits: string[];
  preferences: Record<string, number>;
}

interface PersonalityItem {
  kind: 'preset' | 'custom';
  id: string;
  name: string;
  description: string;
  traits: string[];
  preferences: Record<string, number>;
  systemPrompt: string;
  createdAt?: string;
  updatedAt?: string;
}

interface PersonalityListResponse {
  current: string;
  kind: 'preset' | 'custom';
  systemPrompt: string;
  presets: PersonalityItem[];
  custom: PersonalityItem[];
}

const SNAKE_CASE = /^[a-z][a-z0-9_]{0,40}$/;

function isPersonalityItem(v: unknown): v is PersonalityItem {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as PersonalityItem;
  return typeof p.id === 'string'
    && typeof p.name === 'string'
    && typeof p.systemPrompt === 'string'
    && Array.isArray(p.traits)
    && typeof p.preferences === 'object';
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

interface EditorState {
  open: boolean;
  mode: 'create' | 'edit';
  initialId: string;
  id: string;
  name: string;
  traitsText: string;
  preferences: Record<string, number>;
  systemPrompt: string;
}

const DEFAULT_PREFS = {
  verbosity: 50,
  humor: 30,
  formality: 40,
  creativity: 50,
  precision: 60,
};

function emptyEditor(): EditorState {
  return {
    open: false,
    mode: 'create',
    initialId: '',
    id: '',
    name: '',
    traitsText: '',
    preferences: { ...DEFAULT_PREFS },
    systemPrompt: '',
  };
}

export function Personality() {
  const { t } = useTranslation();

  // ---------- Data fetch ----------
  const fetchList = useCallback(async (): Promise<PersonalityListResponse> => {
    const raw = await api.get<unknown>('/personality');
    if (typeof raw !== 'object' || raw === null) throw new Error('Bad response');
    const r = raw as Partial<PersonalityListResponse>;
    return {
      current: typeof r.current === 'string' ? r.current : '',
      kind: r.kind === 'custom' ? 'custom' : 'preset',
      systemPrompt: typeof r.systemPrompt === 'string' ? r.systemPrompt : '',
      presets: Array.isArray(r.presets) ? r.presets.filter(isPersonalityItem) : [],
      custom: Array.isArray(r.custom) ? r.custom.filter(isPersonalityItem) : [],
    };
  }, []);

  const list = useAsyncState<PersonalityListResponse>(fetchList, { label: 'personality', ttlMs: 30_000 });

  // ---------- Local state ----------
  const [switching, setSwitching] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(emptyEditor());
  const [deleting, setDeleting] = useState<PersonalityItem | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSeed, setAiSeed] = useState('');
  const [aiTarget, setAiTarget] = useState<'editor' | 'new'>('editor');
  const [showAllPresets, setShowAllPresets] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Re-fetch when AI dialog closes (in case we saved from it)
  useEffect(() => {
    if (!aiOpen) {
      void list.run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiOpen]);

  const data = list.data;
  const active = data?.current ?? '';
  const activeKind = data?.kind ?? 'preset';
  const activeItem: PersonalityItem | undefined = useMemo(() => {
    if (!data) return undefined;
    return [...data.presets, ...data.custom].find((p) => p.id === active);
  }, [data, active]);

  // ---------- Switch ----------
  const switchTo = useCallback(async (id: string) => {
    if (!id) return;
    if (switching) return;
    setSwitching(id);
    try {
      await api.post('/personality/set', { id });
      await list.run();
      toast({ type: 'success', title: t('personalityPage.activeHint'), message: id });
    } catch (raw) {
      const err = classifyError(raw);
      toast({ type: 'error', title: t('personalityPage.aiFetchFailed'), message: t(`errors.kind.${err.kind}`, err.message) });
    } finally {
      setSwitching(null);
    }
  }, [list, switching, t]);

  // ---------- Editor helpers ----------
  const openCreate = () => {
    setEditor({ ...emptyEditor(), open: true, mode: 'create' });
  };
  const openEdit = (p: PersonalityItem) => {
    setEditor({
      open: true,
      mode: 'edit',
      initialId: p.id,
      id: p.id,
      name: p.name,
      traitsText: p.traits.join(', '),
      preferences: { ...p.preferences },
      systemPrompt: p.systemPrompt,
    });
  };
  const openDuplicate = (p: PersonalityItem) => {
    const newId = `${p.id}_copy`.slice(0, 40);
    setEditor({
      open: true,
      mode: 'create',
      initialId: '',
      id: newId,
      name: p.name + ' (Copy)',
      traitsText: p.traits.join(', '),
      preferences: { ...p.preferences },
      systemPrompt: p.systemPrompt,
    });
  };

  // ---------- Save (create or update) ----------
  const saveEditor = useCallback(async () => {
    const idTrim = editor.id.trim();
    if (!SNAKE_CASE.test(idTrim)) {
      toast({ type: 'warning', title: t('personalityPage.aiInvalidId') });
      return;
    }
    if (editor.mode === 'create' && data?.custom.some((c) => c.id === idTrim)) {
      toast({ type: 'warning', title: t('personalityPage.aiIdConflict') });
      return;
    }
    const traits = editor.traitsText
      .split(/[\n,]/g)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
    if (traits.length === 0) traits.push('adaptive');
    const payload = {
      id: idTrim,
      name: editor.name.trim() || idTrim,
      traits,
      preferences: editor.preferences,
      systemPrompt: editor.systemPrompt,
    };
    try {
      if (editor.mode === 'create') {
        await api.post('/personality/custom', payload);
      } else {
        await api.patch(`/personality/custom/${encodeURIComponent(editor.initialId)}`, {
          name: payload.name,
          traits: payload.traits,
          preferences: payload.preferences,
        });
      }
      toast({ type: 'success', title: t('personalityPage.aiSaved') });
      setEditor(emptyEditor());
      await list.run();
    } catch (raw) {
      const err = classifyError(raw);
      toast({ type: 'error', title: t('personalityPage.aiSaveFailed'), message: t(`errors.kind.${err.kind}`, err.message) });
    }
  }, [data, editor, list, t]);

  // ---------- Delete ----------
  const doDelete = useCallback(async () => {
    if (!deleting) return;
    try {
      await api.delete(`/personality/custom/${encodeURIComponent(deleting.id)}`);
      toast({ type: 'success', title: t('personalityPage.savedOk') });
      setDeleting(null);
      await list.run();
    } catch (raw) {
      const err = classifyError(raw);
      toast({ type: 'error', title: t('personalityPage.aiSaveFailed'), message: t(`errors.kind.${err.kind}`, err.message) });
    }
  }, [deleting, list, t]);

  // ---------- AI generator ----------
  const openAIGenerate = (target: 'editor' | 'new', seed?: string) => {
    setAiTarget(target);
    setAiSeed(seed ?? '');
    setAiOpen(true);
  };

  const handleAIApply = (parsed: unknown) => {
    if (!parsed || typeof parsed !== 'object') return;
    const p = parsed as Record<string, unknown>;
    const id = typeof p.id === 'string' ? p.id.trim() : '';
    const name = typeof p.name === 'string' ? p.name.trim() : '';
    const traits = Array.isArray(p.traits)
      ? (p.traits as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean).slice(0, 12)
      : [];
    const sys = typeof p.systemPrompt === 'string' ? p.systemPrompt : '';
    const prefs = (typeof p.preferences === 'object' && p.preferences) ? { ...(p.preferences as Record<string, number>) } : {};

    if (aiTarget === 'editor') {
      setEditor((e) => ({
        ...e,
        id: id || e.id,
        name: name || e.name,
        traitsText: traits.length > 0 ? traits.join(', ') : e.traitsText,
        preferences: Object.keys(prefs).length > 0 ? prefs : e.preferences,
        systemPrompt: sys || e.systemPrompt,
      }));
    } else {
      // 'new' — open editor with a new id
      const newId = (id || `gen_${Date.now().toString(36)}`).slice(0, 40);
      setEditor({
        open: true,
        mode: 'create',
        initialId: '',
        id: newId,
        name: name || newId,
        traitsText: traits.join(', '),
        preferences: Object.keys(prefs).length > 0 ? prefs : { ...DEFAULT_PREFS },
        systemPrompt: sys,
      });
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Smile size={18} /> {t('personalityPage.title')}
          </h1>
          <p className="text-sm text-fg-mute mt-1">{t('personalityPage.subtitle')}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={list.retry}
          leftIcon={<RefreshCw size={12} className={list.loading ? 'animate-spin' : ''} />}
          disabled={list.loading}
        >
          {t('common.refresh')}
        </Button>
      </div>

      {/* Active card */}
      {data && (
        <Card>
          <CardHeader>
            <div className="text-sm font-semibold flex items-center gap-2">
              <Star size={14} className="text-warning" /> {t('personalityPage.activeCard')}
            </div>
            <Badge variant={activeKind === 'custom' ? 'brand' : 'info'}>
              {activeKind === 'custom' ? t('personalityPage.kindCustom') : t('personalityPage.kindPreset')}
            </Badge>
          </CardHeader>
          <CardBody className="space-y-2">
            {activeItem ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{emojiFor(activeItem.id)}</span>
                  <div>
                    <div className="text-sm font-medium">{activeItem.name}</div>
                    <div className="text-[10.5px] text-fg-mute font-mono">{activeItem.id}</div>
                  </div>
                </div>
                <p className="text-xs text-fg-soft">{activeItem.description}</p>
                <details className="rounded-md border border-border bg-bg-soft p-2.5">
                  <summary className="text-xs font-medium cursor-pointer flex items-center gap-1.5 select-none">
                    <ChevronDown size={12} /> {t('personalityPage.systemPrompt')}
                  </summary>
                  <pre className="mt-2 text-[11px] font-mono whitespace-pre-wrap text-fg-soft">{activeItem.systemPrompt}</pre>
                </details>
                <p className="text-[10.5px] text-fg-mute">{t('personalityPage.activeHint')}</p>
              </>
            ) : (
              <p className="text-sm text-fg-mute">—</p>
            )}
          </CardBody>
        </Card>
      )}

      {/* Error state */}
      {list.status === 'error' && list.error && (
        <ErrorState
          error={list.error}
          message={t('personalityPage.loadFailed')}
          onRetry={isRetryable(list.error) ? list.retry : undefined}
        />
      )}

      {/* Loading */}
      {list.status !== 'error' && !data && list.loading && (
        <div className="text-sm text-fg-mute flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> {t('common.loading')}
        </div>
      )}

      {/* Presets */}
      {data && (
        <Card>
          <CardHeader>
            <div className="text-sm font-semibold flex items-center gap-2">
              {t('personalityPage.presetsTitle')} ({data.presets.length})
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllPresets((v) => !v)}
              rightIcon={showAllPresets ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            >
              {showAllPresets ? t('common.collapse') : t('common.expanded')}
            </Button>
          </CardHeader>
          <CardBody>
            <div className={cn('grid gap-2', showAllPresets ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4')}>
              {data.presets.map((p) => (
                <PersonalityCard
                  key={p.id}
                  item={p}
                  isActive={active === p.id}
                  isLoading={switching === p.id}
                  expanded={!!expanded[p.id]}
                  onToggleExpand={() => setExpanded((e) => ({ ...e, [p.id]: !e[p.id] }))}
                  onUse={() => switchTo(p.id)}
                  onDuplicate={() => openDuplicate(p)}
                  extraActions={null}
                />
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Custom */}
      {data && (
        <Card>
          <CardHeader>
            <div className="text-sm font-semibold flex items-center gap-2">
              {t('personalityPage.customTitle')} ({data.custom.length})
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Sparkles size={12} />}
                onClick={() => openAIGenerate('new')}
              >
                {t('personalityPage.aiGenerate')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Plus size={12} />}
                onClick={openCreate}
              >
                {t('personalityPage.newCustom')}
              </Button>
            </div>
          </CardHeader>
          <CardBody>
            {data.custom.length === 0 ? (
              <div className="text-xs text-fg-mute flex items-center gap-2">
                <AlertCircle size={12} /> {t('personalityPage.noCustom')}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.custom.map((p) => (
                  <PersonalityCard
                    key={p.id}
                    item={p}
                    isActive={active === p.id}
                    isLoading={switching === p.id}
                    expanded={!!expanded[p.id]}
                    onToggleExpand={() => setExpanded((e) => ({ ...e, [p.id]: !e[p.id] }))}
                    onUse={() => switchTo(p.id)}
                    onDuplicate={() => openDuplicate(p)}
                    extraActions={
                      <div className="flex gap-1.5">
                        <Button variant="ghost" size="sm" leftIcon={<Pencil size={11} />} onClick={() => openEdit(p)}>
                          {t('personalityPage.editCustom')}
                        </Button>
                        <Button variant="danger" size="sm" leftIcon={<Trash2 size={11} />} onClick={() => setDeleting(p)}>
                          {t('personalityPage.deleteCustom')}
                        </Button>
                      </div>
                    }
                  />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* Editor modal */}
      <Modal
        open={editor.open}
        onClose={() => setEditor(emptyEditor())}
        size="lg"
        title={editor.mode === 'create' ? t('personalityPage.newCustom') : t('personalityPage.editCustom')}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('personalityPage.idLabel')}
              value={editor.id}
              onChange={(e) => setEditor({ ...editor, id: e.target.value })}
              disabled={editor.mode === 'edit'}
              hint={editor.mode === 'edit' ? t('common.default') : undefined}
            />
            <Input
              label={t('personalityPage.nameLabel')}
              value={editor.name}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
            />
          </div>
          <Textarea
            label={t('personalityPage.traitsLabel')}
            value={editor.traitsText}
            onChange={(e) => setEditor({ ...editor, traitsText: e.target.value })}
            rows={2}
            placeholder="patient, encouraging, empathetic"
          />
          <div>
            <label className="block text-xs font-medium text-fg-soft mb-1.5">
              {t('personalityPage.preferencesLabel')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(editor.preferences).map(([k, v]) => (
                <div key={k}>
                  <div className="flex justify-between text-[10.5px] text-fg-mute">
                    <span>{k}</span>
                    <span className="font-mono">{v}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={v}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        preferences: { ...editor.preferences, [k]: parseInt(e.target.value, 10) },
                      })
                    }
                    className="w-full"
                  />
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1"
              onClick={() => setEditor({ ...editor, preferences: { ...DEFAULT_PREFS } })}
            >
              {t('common.default')}
            </Button>
          </div>
          <Textarea
            label={t('personalityPage.systemPromptLabel')}
            value={editor.systemPrompt}
            onChange={(e) => setEditor({ ...editor, systemPrompt: e.target.value })}
            rows={5}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEditor(emptyEditor())}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              leftIcon={<CheckCircle2 size={13} />}
              onClick={saveEditor}
            >
              {editor.mode === 'create' ? t('personalityPage.createCustom') : t('personalityPage.updateCustom')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleting}
        title={t('personalityPage.deleteCustom')}
        message={t('personalityPage.deleteConfirm', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={doDelete}
        onCancel={() => setDeleting(null)}
      />

      {/* AI generator */}
      <AIGenerateDialog
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        type="personality"
        defaultPrompt={aiSeed}
        allowTypeSwitch
        onApply={handleAIApply}
      />
    </div>
  );
}

// ---------- Subcomponent ----------

interface CardProps {
  item: PersonalityItem;
  isActive: boolean;
  isLoading: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onUse: () => void;
  onDuplicate: () => void;
  extraActions: React.ReactNode;
}

function PersonalityCard({
  item, isActive, isLoading, expanded, onToggleExpand, onUse, onDuplicate, extraActions,
}: CardProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'rounded-lg border p-3 flex flex-col gap-2 transition-all',
        isActive ? 'border-brand/60 bg-brand/8' : 'border-border bg-bg-soft',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-xl">{emojiFor(item.id)}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{item.name}</div>
          <div className="text-[10.5px] text-fg-mute font-mono truncate">{item.id}</div>
        </div>
        {isActive && <Badge variant="brand" size="sm">{t('personalityPage.activeCard')}</Badge>}
      </div>
      <p className="text-[11px] text-fg-soft line-clamp-2">{item.description}</p>
      <div className="flex flex-wrap gap-1">
        {item.traits.slice(0, 4).map((t) => (
          <Badge key={t} variant="muted" size="sm">{t}</Badge>
        ))}
        {item.traits.length > 4 && <Badge variant="muted" size="sm">+{item.traits.length - 4}</Badge>}
      </div>
      <button
        onClick={onToggleExpand}
        className="text-[10.5px] text-fg-mute hover:text-fg flex items-center gap-1 self-start"
      >
        {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        {t('personalityPage.systemPrompt')}
      </button>
      {expanded && (
        <pre className="text-[10.5px] font-mono whitespace-pre-wrap text-fg-soft bg-bg p-2 rounded border border-border max-h-40 overflow-auto">
          {item.systemPrompt}
        </pre>
      )}
      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
        <Button
          variant={isActive ? 'outline' : 'primary'}
          size="sm"
          onClick={onUse}
          loading={isLoading}
          disabled={isActive || isLoading}
        >
          {isActive ? t('personalityPage.activeCard') : t('common.default')}
        </Button>
        <Button variant="ghost" size="sm" leftIcon={<Copy size={11} />} onClick={onDuplicate}>
          {t('personalityPage.duplicate')}
        </Button>
        {extraActions}
      </div>
    </div>
  );
}
