import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sparkles, Plus, Pencil, Copy, Trash2, Loader2,
  AlertCircle, CheckCircle2, RefreshCw, Wrench, ListChecks,
} from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/Card';
import { Button } from '@/components/Button';
import { Badge } from '@/components/Badge';
import { Input, Textarea } from '@/components/Input';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorState } from '@/components/ErrorState';
import { AIGenerateDialog } from '@/components/AIGenerateDialog';
import { api } from '@/api/client';
import { useAsyncState } from '@/hooks/useAsyncState';
import { classifyError, isRetryable } from '@/utils/errors';
import { toast } from '@/components/Toast';
import { cn } from '@/utils';

interface Skill {
  id: string;
  name: string;
  slug: string;
  summary: string;
  trigger: string;
  steps: string[];
  tools: string[];
  guardrails: string;
  params: Array<{ name: string; type: 'string' | 'number' | 'boolean'; description: string; required: boolean }>;
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

const SNAKE_CASE = /^[a-z][a-z0-9_]{0,40}$/;

function isSkill(v: unknown): v is Skill {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Skill;
  return typeof s.id === 'string' && typeof s.name === 'string' && Array.isArray(s.steps);
}

interface EditorState {
  open: boolean;
  mode: 'create' | 'edit';
  initialId: string;
  id: string;
  name: string;
  summary: string;
  trigger: string;
  stepsText: string;
  toolsText: string;
  guardrails: string;
}

function emptyEditor(): EditorState {
  return {
    open: false,
    mode: 'create',
    initialId: '',
    id: '',
    name: '',
    summary: '',
    trigger: '',
    stepsText: '',
    toolsText: '',
    guardrails: '',
  };
}

export function Skills() {
  const { t } = useTranslation();

  const fetchSkills = useCallback(async (): Promise<Skill[]> => {
    const raw = await api.get<unknown>('/skills');
    if (typeof raw !== 'object' || raw === null) throw new Error('Bad response');
    const r = raw as { items?: unknown };
    return Array.isArray(r.items) ? r.items.filter(isSkill) : [];
  }, []);
  const list = useAsyncState<Skill[]>(fetchSkills, { label: 'skills', ttlMs: 30_000 });

  const { builtins, customs } = useMemo(() => {
    const items = list.data ?? [];
    return {
      builtins: items.filter((s) => s.builtin),
      customs: items.filter((s) => !s.builtin),
    };
  }, [list.data]);

  const [editor, setEditor] = useState<EditorState>(emptyEditor());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Skill | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSeed, setAiSeed] = useState('');

  const openCreate = () => setEditor({ ...emptyEditor(), open: true, mode: 'create' });
  const openEdit = (s: Skill) => {
    setEditor({
      open: true,
      mode: 'edit',
      initialId: s.id,
      id: s.id,
      name: s.name,
      summary: s.summary,
      trigger: s.trigger,
      stepsText: s.steps.join('\n'),
      toolsText: s.tools.join('\n'),
      guardrails: s.guardrails,
    });
  };

  const save = useCallback(async () => {
    const idTrim = editor.id.trim();
    if (!SNAKE_CASE.test(idTrim)) {
      toast({ type: 'warning', title: t('personalityPage.aiInvalidId') });
      return;
    }
    if (!editor.name.trim()) {
      toast({ type: 'warning', title: 'Name is required' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        id: idTrim,
        name: editor.name.trim().slice(0, 80),
        summary: editor.summary,
        trigger: editor.trigger,
        steps: editor.stepsText.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 10),
        tools: editor.toolsText.split(/\n|,/).map((s) => s.trim()).filter(Boolean).slice(0, 16),
        guardrails: editor.guardrails,
        params: [],
      };
      if (editor.mode === 'create') {
        await api.post('/skills', payload);
      } else {
        await api.patch(`/skills/${encodeURIComponent(editor.initialId)}`, payload);
      }
      toast({ type: 'success', title: t('skills.aiSavedOk') });
      setEditor(emptyEditor());
      await list.run();
    } catch (raw) {
      const err = classifyError(raw);
      toast({ type: 'error', title: t('skills.aiSaveFailed'), message: t(`errors.kind.${err.kind}`, err.message) });
    } finally {
      setSaving(false);
    }
  }, [editor, list, t]);

  const doDelete = useCallback(async () => {
    if (!deleting) return;
    try {
      await api.delete(`/skills/${encodeURIComponent(deleting.id)}`);
      toast({ type: 'success', title: t('skills.aiSavedOk') });
      setDeleting(null);
      await list.run();
    } catch (raw) {
      const err = classifyError(raw);
      toast({ type: 'error', title: t('skills.aiSaveFailed'), message: t(`errors.kind.${err.kind}`, err.message) });
    }
  }, [deleting, list, t]);

  const openAIGenerate = (seed = '') => {
    setAiSeed(seed);
    setAiOpen(true);
  };

  const handleAIApply = (parsed: unknown) => {
    if (!parsed || typeof parsed !== 'object') return;
    const p = parsed as Record<string, unknown>;
    const id = typeof p.id === 'string' ? p.id.trim() : '';
    const name = typeof p.name === 'string' ? p.name.trim() : '';
    const summary = typeof p.summary === 'string' ? p.summary : '';
    const trigger = typeof p.trigger === 'string' ? p.trigger : '';
    const steps = Array.isArray(p.steps)
      ? (p.steps as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean)
      : [];
    const tools = Array.isArray(p.tools)
      ? (p.tools as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean)
      : [];
    const guardrails = typeof p.guardrails === 'string' ? p.guardrails : '';
    setEditor({
      open: true,
      mode: 'create',
      initialId: '',
      id: (id || `gen_${Date.now().toString(36)}`).slice(0, 40),
      name: name || '',
      summary,
      trigger,
      stepsText: steps.join('\n'),
      toolsText: tools.join('\n'),
      guardrails,
    });
  };

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ListChecks size={18} /> {t('skills.title')}
          </h1>
          <p className="text-sm text-fg-mute mt-1">{t('skills.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={list.retry}
            leftIcon={<RefreshCw size={12} className={list.loading ? 'animate-spin' : ''} />}
            disabled={list.loading}
          >
            {t('common.refresh')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Sparkles size={12} />}
            onClick={() => openAIGenerate('')}
          >
            {t('skills.aiGenerate')}
          </Button>
          <Button variant="primary" size="sm" leftIcon={<Plus size={12} />} onClick={openCreate}>
            {t('skills.newSkill')}
          </Button>
        </div>
      </div>

      {list.error && (
        <ErrorState
          error={list.error}
          onRetry={isRetryable(list.error) ? list.retry : undefined}
        />
      )}

      {list.loading && !list.data && (
        <div className="text-sm text-fg-mute flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> {t('common.loading')}
        </div>
      )}

      {list.data && (
        <>
          <div className="text-[10.5px] uppercase tracking-wide text-fg-mute">
            {t('skills.builtinBadge')} ({builtins.length})
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {builtins.map((s) => (
              <SkillCard key={s.id} skill={s} onEdit={() => openEdit(s)} onDelete={() => setDeleting(s)} canDelete={false} />
            ))}
          </div>

          <div className="text-[10.5px] uppercase tracking-wide text-fg-mute pt-2 flex items-center gap-2">
            {t('skills.customBadge')} ({customs.length})
            {customs.length === 0 && (
              <span className="text-fg-mute normal-case">{t('skills.noCustom')}</span>
            )}
          </div>
          {customs.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {customs.map((s) => (
                <SkillCard key={s.id} skill={s} onEdit={() => openEdit(s)} onDelete={() => setDeleting(s)} canDelete />
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={editor.open}
        onClose={() => setEditor(emptyEditor())}
        size="lg"
        title={editor.mode === 'create' ? t('skills.newSkill') : t('skills.edit')}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('skills.idLabel')}
              value={editor.id}
              onChange={(e) => setEditor({ ...editor, id: e.target.value })}
              disabled={editor.mode === 'edit'}
            />
            <Input
              label={t('skills.nameLabel')}
              value={editor.name}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
            />
          </div>
          <Input
            label={t('skills.summaryLabel')}
            value={editor.summary}
            onChange={(e) => setEditor({ ...editor, summary: e.target.value })}
            placeholder="One sentence, ≤100 chars."
          />
          <Textarea
            label={t('skills.triggerLabel')}
            value={editor.trigger}
            onChange={(e) => setEditor({ ...editor, trigger: e.target.value })}
            rows={2}
            placeholder="When should this skill activate?"
          />
          <Textarea
            label={t('skills.stepsLabel')}
            value={editor.stepsText}
            onChange={(e) => setEditor({ ...editor, stepsText: e.target.value })}
            rows={5}
            placeholder={'Step 1: read the file\nStep 2: identify the issue\nStep 3: write a review'}
          />
          <Textarea
            label={t('skills.toolsLabel')}
            value={editor.toolsText}
            onChange={(e) => setEditor({ ...editor, toolsText: e.target.value })}
            rows={2}
            placeholder="readFile, search, analyze (one per line or comma separated)"
          />
          <Textarea
            label={t('skills.guardrailsLabel')}
            value={editor.guardrails}
            onChange={(e) => setEditor({ ...editor, guardrails: e.target.value })}
            rows={2}
            placeholder="What this skill must NOT do."
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEditor(emptyEditor())}>{t('common.cancel')}</Button>
            <Button variant="primary" loading={saving} disabled={saving} onClick={save} leftIcon={<CheckCircle2 size={13} />}>
              {editor.mode === 'create' ? t('skills.createBtn') : t('skills.saveBtn')}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title={t('skills.delete')}
        message={t('skills.deleteConfirm', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={doDelete}
        onCancel={() => setDeleting(null)}
      />

      <AIGenerateDialog
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        type="skill"
        defaultPrompt={aiSeed}
        allowTypeSwitch
        onApply={handleAIApply}
      />
    </div>
  );
}

interface CardProps {
  skill: Skill;
  onEdit: () => void;
  onDelete: () => void;
  canDelete: boolean;
}

function SkillCard({ skill, onEdit, onDelete, canDelete }: CardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={cn(
        'rounded-lg border p-3 space-y-2 transition-colors',
        skill.builtin ? 'border-border bg-bg-soft' : 'border-brand/30 bg-brand/4',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{skill.name}</span>
            <Badge variant={skill.builtin ? 'muted' : 'brand'} size="sm">
              {skill.builtin ? t('skills.builtinBadge') : t('skills.customBadge')}
            </Badge>
            <Badge variant="info" size="sm">
              {skill.steps.length} {t('skills.stepsLabel').toLowerCase()}
            </Badge>
          </div>
          <div className="text-[10.5px] text-fg-mute font-mono truncate">{skill.slug}</div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" leftIcon={<Pencil size={11} />} onClick={onEdit}>
            {t('skills.edit')}
          </Button>
          {canDelete && (
            <Button variant="danger" size="sm" leftIcon={<Trash2 size={11} />} onClick={onDelete}>
              {t('skills.delete')}
            </Button>
          )}
        </div>
      </div>
      <p className="text-[11px] text-fg-soft line-clamp-2">{skill.summary}</p>
      {skill.trigger && (
        <p className="text-[10.5px] text-fg-mute italic line-clamp-2">
          <AlertCircle size={10} className="inline" /> {skill.trigger}
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        {skill.tools.slice(0, 5).map((tn) => (
          <Badge key={tn} variant="muted" size="sm">
            <Wrench size={9} className="inline" /> {tn}
          </Badge>
        ))}
        {skill.tools.length > 5 && <Badge variant="muted" size="sm">+{skill.tools.length - 5}</Badge>}
      </div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-[10.5px] text-fg-mute hover:text-fg flex items-center gap-1"
      >
        {expanded ? '▴' : '▾'} {t('skills.stepsLabel')}
      </button>
      {expanded && (
        <ol className="text-[11px] text-fg-soft space-y-0.5 list-decimal pl-4">
          {skill.steps.map((step, idx) => <li key={idx}>{step}</li>)}
        </ol>
      )}
    </div>
  );
}
