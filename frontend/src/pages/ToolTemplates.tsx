import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Wrench, Sparkles, Plus, Pencil, Copy, Trash2, Loader2,
  AlertCircle, CheckCircle2, RefreshCw, Tag, Zap,
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

type ParamType = 'string' | 'number' | 'boolean' | 'array' | 'object';
type Category = 'productivity' | 'data' | 'dev' | 'web' | 'misc' | 'custom';

const CATEGORIES: Category[] = ['productivity', 'data', 'dev', 'web', 'misc', 'custom'];
const TYPES: ParamType[] = ['string', 'number', 'boolean', 'array', 'object'];

const CATEGORY_COLOR: Record<Category, 'info' | 'success' | 'warning' | 'brand' | 'muted' | 'danger'> = {
  productivity: 'info',
  data: 'success',
  dev: 'brand',
  web: 'warning',
  misc: 'muted',
  custom: 'danger',
};

interface Param {
  name: string;
  type: ParamType;
  description: string;
  required: boolean;
}

interface Template {
  id: string;
  name: string;
  description: string;
  category: Category;
  params: Param[];
  instructions: string;
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

const SNAKE_CASE = /^[a-z][a-z0-9_]{0,40}$/;

function isTemplate(v: unknown): v is Template {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Template;
  return typeof t.id === 'string' && typeof t.name === 'string' && Array.isArray(t.params);
}

interface EditorState {
  open: boolean;
  mode: 'create' | 'edit';
  initialId: string;
  id: string;
  name: string;
  description: string;
  category: Category;
  params: Param[];
  instructions: string;
}

function emptyEditor(): EditorState {
  return {
    open: false,
    mode: 'create',
    initialId: '',
    id: '',
    name: '',
    description: '',
    category: 'custom',
    params: [],
    instructions: '',
  };
}

export function ToolTemplates() {
  const { t } = useTranslation();

  // ---------- Data ----------
  const fetchTemplates = useCallback(async (): Promise<Template[]> => {
    const raw = await api.get<unknown>('/tools/templates');
    if (typeof raw !== 'object' || raw === null) throw new Error('Bad response');
    const r = raw as { items?: unknown };
    return Array.isArray(r.items) ? r.items.filter(isTemplate) : [];
  }, []);
  const list = useAsyncState<Template[]>(fetchTemplates, { label: 'toolTemplates', ttlMs: 30_000 });

  // ---------- Group ----------
  const { builtins, customs } = useMemo(() => {
    const items = list.data ?? [];
    return {
      builtins: items.filter((t) => t.builtin),
      customs: items.filter((t) => !t.builtin),
    };
  }, [list.data]);

  // ---------- Editor ----------
  const [editor, setEditor] = useState<EditorState>(emptyEditor());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Template | null>(null);

  // ---------- Duplicate ----------
  const [dupOpen, setDupOpen] = useState<Template | null>(null);
  const [dupId, setDupId] = useState('');
  const [dupName, setDupName] = useState('');

  // ---------- AI ----------
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSeed, setAiSeed] = useState('');

  const openCreate = () => setEditor({ ...emptyEditor(), open: true, mode: 'create' });
  const openEdit = (tpl: Template) => {
    setEditor({
      open: true,
      mode: 'edit',
      initialId: tpl.id,
      id: tpl.id,
      name: tpl.name,
      description: tpl.description,
      category: tpl.category,
      params: tpl.params.map((p) => ({ ...p })),
      instructions: tpl.instructions,
    });
  };
  const openDuplicate = (tpl: Template) => {
    setDupOpen(tpl);
    setDupId(`${tpl.id}_copy`.slice(0, 40));
    setDupName(tpl.name + ' (Copy)');
  };

  // ---------- Save ----------
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
        description: editor.description,
        category: editor.category,
        params: editor.params.map((p) => ({
          name: p.name.trim().slice(0, 40),
          type: p.type,
          description: p.description.slice(0, 200),
          required: p.required,
        })),
        instructions: editor.instructions,
      };
      if (editor.mode === 'create') {
        await api.post('/tools/templates', payload);
      } else {
        await api.patch(`/tools/templates/${encodeURIComponent(editor.initialId)}`, payload);
      }
      toast({ type: 'success', title: t('templates.aiSavedOk') });
      setEditor(emptyEditor());
      await list.run();
    } catch (raw) {
      const err = classifyError(raw);
      toast({ type: 'error', title: t('templates.aiSaveFailed'), message: t(`errors.kind.${err.kind}`, err.message) });
    } finally {
      setSaving(false);
    }
  }, [editor, list, t]);

  // ---------- Delete ----------
  const doDelete = useCallback(async () => {
    if (!deleting) return;
    try {
      await api.delete(`/tools/templates/${encodeURIComponent(deleting.id)}`);
      toast({ type: 'success', title: t('templates.aiSavedOk') });
      setDeleting(null);
      await list.run();
    } catch (raw) {
      const err = classifyError(raw);
      toast({ type: 'error', title: t('templates.aiSaveFailed'), message: t(`errors.kind.${err.kind}`, err.message) });
    }
  }, [deleting, list, t]);

  // ---------- Duplicate ----------
  const doDuplicate = useCallback(async () => {
    if (!dupOpen) return;
    if (!SNAKE_CASE.test(dupId)) {
      toast({ type: 'warning', title: t('personalityPage.aiInvalidId') });
      return;
    }
    try {
      await api.post(`/tools/templates/${encodeURIComponent(dupOpen.id)}/duplicate`, {
        newId: dupId.trim(),
        newName: dupName.trim() || undefined,
      });
      toast({ type: 'success', title: t('templates.aiSavedOk') });
      setDupOpen(null);
      await list.run();
    } catch (raw) {
      const err = classifyError(raw);
      toast({ type: 'error', title: t('templates.aiSaveFailed'), message: t(`errors.kind.${err.kind}`, err.message) });
    }
  }, [dupOpen, dupId, dupName, list, t]);

  // ---------- AI ----------
  const openAIGenerate = (seed = '') => {
    setAiSeed(seed);
    setAiOpen(true);
  };
  const handleAIApply = (parsed: unknown) => {
    if (!parsed || typeof parsed !== 'object') return;
    const p = parsed as Record<string, unknown>;
    const id = typeof p.id === 'string' ? p.id.trim() : '';
    const name = typeof p.name === 'string' ? p.name.trim() : '';
    const desc = typeof p.description === 'string' ? p.description : '';
    const instr = typeof p.instructions === 'string' ? p.instructions : '';
    const cat: Category = typeof p.category === 'string' && CATEGORIES.includes(p.category as Category)
      ? p.category as Category
      : 'custom';
    const params: Param[] = Array.isArray(p.schema)
      ? (p.schema as unknown[]).slice(0, 16).map((raw) => {
          if (typeof raw !== 'object' || raw === null) return { name: '', type: 'string', description: '', required: false };
          const s = raw as Record<string, unknown>;
          return {
            name: typeof s.name === 'string' ? s.name.slice(0, 40) : '',
            type: (typeof s.type === 'string' && TYPES.includes(s.type as ParamType)) ? (s.type as ParamType) : 'string',
            description: typeof s.description === 'string' ? s.description.slice(0, 200) : '',
            required: s.required === true,
          };
        })
      : [];
    setEditor({
      open: true,
      mode: 'create',
      initialId: '',
      id: (id || `gen_${Date.now().toString(36)}`).slice(0, 40),
      name: name || '',
      description: desc,
      category: cat,
      params,
      instructions: instr,
    });
  };

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Wrench size={18} /> {t('templates.title')}
          </h1>
          <p className="text-sm text-fg-mute mt-1">{t('templates.subtitle')}</p>
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
            {t('templates.aiGenerate')}
          </Button>
          <Button variant="primary" size="sm" leftIcon={<Plus size={12} />} onClick={openCreate}>
            {t('templates.newTemplate')}
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
            {t('templates.builtinBadge')} ({builtins.length})
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {builtins.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                tpl={tpl}
                onEdit={() => openEdit(tpl)}
                onDuplicate={() => openDuplicate(tpl)}
                onDelete={() => setDeleting(tpl)}
                canDelete={false}
              />
            ))}
          </div>

          <div className="text-[10.5px] uppercase tracking-wide text-fg-mute pt-2 flex items-center gap-2">
            {t('templates.customBadge')} ({customs.length})
            {customs.length === 0 && (
              <span className="text-fg-mute normal-case">{t('templates.noCustom')}</span>
            )}
          </div>
          {customs.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {customs.map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  tpl={tpl}
                  onEdit={() => openEdit(tpl)}
                  onDuplicate={() => openDuplicate(tpl)}
                  onDelete={() => setDeleting(tpl)}
                  canDelete
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Editor */}
      <Modal
        open={editor.open}
        onClose={() => setEditor(emptyEditor())}
        size="lg"
        title={editor.mode === 'create' ? t('templates.newTemplate') : t('templates.edit')}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('templates.idLabel')}
              value={editor.id}
              onChange={(e) => setEditor({ ...editor, id: e.target.value })}
              disabled={editor.mode === 'edit'}
            />
            <Input
              label={t('templates.nameLabel')}
              value={editor.name}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
            />
          </div>
          <Input
            label={t('templates.descriptionLabel')}
            value={editor.description}
            onChange={(e) => setEditor({ ...editor, description: e.target.value })}
            placeholder="What does this tool do? When should the model use it?"
          />
          <Select
            label={t('templates.categoryLabel')}
            value={editor.category}
            onChange={(v) => setEditor({ ...editor, category: v as Category })}
            options={CATEGORIES.map((c) => ({ value: c, label: t(`templates.categories.${c}`) }))}
          />

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-fg-soft">
                {t('templates.paramsLabel')} ({editor.params.length})
              </label>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Plus size={11} />}
                onClick={() => setEditor({
                  ...editor,
                  params: [...editor.params, { name: '', type: 'string', description: '', required: false }],
                })}
              >
                {t('templates.addParam')}
              </Button>
            </div>
            <p className="text-[10.5px] text-fg-mute mb-2">{t('templates.paramsHint')}</p>
            <div className="space-y-1.5">
              {editor.params.map((p, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1.5 items-end p-2 rounded border border-border bg-bg-soft">
                  <Input
                    className="col-span-3"
                    value={p.name}
                    onChange={(e) => setEditor({
                      ...editor,
                      params: editor.params.map((pp, i) => i === idx ? { ...pp, name: e.target.value } : pp),
                    })}
                    placeholder={t('templates.paramName')}
                  />
                  <Select
                    className="col-span-2"
                    value={p.type}
                    onChange={(v) => setEditor({
                      ...editor,
                      params: editor.params.map((pp, i) => i === idx ? { ...pp, type: v as ParamType } : pp),
                    })}
                    options={TYPES.map((t) => ({ value: t, label: t }))}
                  />
                  <Input
                    className="col-span-5"
                    value={p.description}
                    onChange={(e) => setEditor({
                      ...editor,
                      params: editor.params.map((pp, i) => i === idx ? { ...pp, description: e.target.value } : pp),
                    })}
                    placeholder={t('templates.paramDescription')}
                  />
                  <label className="col-span-1 flex flex-col items-center gap-0.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={p.required}
                      onChange={(e) => setEditor({
                        ...editor,
                        params: editor.params.map((pp, i) => i === idx ? { ...pp, required: e.target.checked } : pp),
                      })}
                      className="h-3.5 w-3.5 accent-brand"
                    />
                    <span className="text-[9px] text-fg-mute">{t('templates.paramRequired')}</span>
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="col-span-1"
                    onClick={() => setEditor({
                      ...editor,
                      params: editor.params.filter((_, i) => i !== idx),
                    })}
                    leftIcon={<Trash2 size={11} />}
                  >
                    {t('templates.removeParam')}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <Textarea
            label={t('templates.instructionsLabel')}
            value={editor.instructions}
            onChange={(e) => setEditor({ ...editor, instructions: e.target.value })}
            rows={4}
            placeholder={t('templates.instructionsHint')}
          />

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEditor(emptyEditor())}>{t('common.cancel')}</Button>
            <Button variant="primary" loading={saving} disabled={saving} onClick={save} leftIcon={<CheckCircle2 size={13} />}>
              {editor.mode === 'create' ? t('templates.createBtn') : t('templates.saveBtn')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Duplicate modal */}
      <Modal
        open={!!dupOpen}
        onClose={() => setDupOpen(null)}
        size="md"
        title={t('templates.duplicate')}
      >
        <div className="space-y-3">
          <Input
            label={t('templates.duplicateNewId')}
            value={dupId}
            onChange={(e) => setDupId(e.target.value)}
          />
          <Input
            label={t('templates.duplicateNewName')}
            value={dupName}
            onChange={(e) => setDupName(e.target.value)}
            placeholder={dupOpen?.name ?? ''}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDupOpen(null)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={doDuplicate} leftIcon={<Copy size={13} />}>
              {t('templates.duplicateBtn')}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title={t('templates.delete')}
        message={t('templates.deleteConfirm', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={doDelete}
        onCancel={() => setDeleting(null)}
      />

      <AIGenerateDialog
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        type="tool"
        defaultPrompt={aiSeed}
        allowTypeSwitch
        onApply={handleAIApply}
      />
    </div>
  );
}

interface CardProps {
  tpl: Template;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canDelete: boolean;
}

function TemplateCard({ tpl, onEdit, onDuplicate, onDelete, canDelete }: CardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={cn(
        'rounded-lg border p-3 space-y-2 transition-colors',
        tpl.builtin ? 'border-border bg-bg-soft' : 'border-brand/30 bg-brand/4',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{tpl.name}</span>
            <Badge variant={CATEGORY_COLOR[tpl.category]} size="sm">
              {t(`templates.categories.${tpl.category}`, tpl.category)}
            </Badge>
            <Badge variant={tpl.builtin ? 'muted' : 'brand'} size="sm">
              {tpl.builtin ? t('templates.builtinBadge') : t('templates.customBadge')}
            </Badge>
          </div>
          <div className="text-[10.5px] text-fg-mute font-mono truncate">{tpl.id}</div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" leftIcon={<Pencil size={11} />} onClick={onEdit}>
            {t('templates.edit')}
          </Button>
          <Button variant="ghost" size="sm" leftIcon={<Copy size={11} />} onClick={onDuplicate}>
            {t('templates.duplicate')}
          </Button>
          {canDelete && (
            <Button variant="danger" size="sm" leftIcon={<Trash2 size={11} />} onClick={onDelete}>
              {t('templates.delete')}
            </Button>
          )}
        </div>
      </div>
      <p className="text-[11px] text-fg-soft line-clamp-2">{tpl.description}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10.5px] text-fg-mute uppercase flex items-center gap-1">
          <Zap size={10} /> {tpl.params.length}
        </span>
        {tpl.params.slice(0, 3).map((p) => (
          <Badge key={p.name} variant="muted" size="sm">
            {p.name}
            {p.required && <span className="text-danger">*</span>}
          </Badge>
        ))}
        {tpl.params.length > 3 && <Badge variant="muted" size="sm">+{tpl.params.length - 3}</Badge>}
      </div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-[10.5px] text-fg-mute hover:text-fg flex items-center gap-1"
      >
        {expanded ? '▴' : '▾'} {t('templates.instructionsLabel')}
      </button>
      {expanded && (
        <pre className="text-[10.5px] font-mono whitespace-pre-wrap bg-bg p-2 rounded border border-border max-h-32 overflow-auto">
          {tpl.instructions || '—'}
        </pre>
      )}
    </div>
  );
}
