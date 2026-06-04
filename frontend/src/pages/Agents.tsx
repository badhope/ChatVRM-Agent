import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Wand2, Sparkles, Plus, Pencil, Copy, Trash2, Loader2,
  CheckCircle2, RefreshCw, AlertCircle,
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

interface AgentProfile {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  capabilities: string[];
  limitations: string[];
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

const SNAKE_CASE = /^[a-z][a-z0-9_]{0,40}$/;

function isAgent(v: unknown): v is AgentProfile {
  if (typeof v !== 'object' || v === null) return false;
  const a = v as AgentProfile;
  return typeof a.id === 'string' && typeof a.name === 'string' && Array.isArray(a.capabilities);
}

interface EditorState {
  open: boolean;
  mode: 'create' | 'edit';
  initialId: string;
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  capabilitiesText: string;
  limitationsText: string;
}

function emptyEditor(): EditorState {
  return {
    open: false,
    mode: 'create',
    initialId: '',
    id: '',
    name: '',
    role: '',
    systemPrompt: '',
    capabilitiesText: '',
    limitationsText: '',
  };
}

const AGENT_EMOJI: Record<string, string> = {
  'agt-researcher': '🔍',
  'agt-coder': '🧑‍💻',
  'agt-writer': '✍️',
};

function emojiFor(id: string): string {
  return AGENT_EMOJI[id] ?? '🤖';
}

export function Agents() {
  const { t } = useTranslation();

  const fetchAgents = useCallback(async (): Promise<AgentProfile[]> => {
    const raw = await api.get<unknown>('/agents');
    if (typeof raw !== 'object' || raw === null) throw new Error('Bad response');
    const r = raw as { items?: unknown };
    return Array.isArray(r.items) ? r.items.filter(isAgent) : [];
  }, []);
  const list = useAsyncState<AgentProfile[]>(fetchAgents, { label: 'agents', ttlMs: 30_000 });

  const { builtins, customs } = useMemo(() => {
    const items = list.data ?? [];
    return {
      builtins: items.filter((a) => a.builtin),
      customs: items.filter((a) => !a.builtin),
    };
  }, [list.data]);

  const [editor, setEditor] = useState<EditorState>(emptyEditor());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<AgentProfile | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSeed, setAiSeed] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const openCreate = () => setEditor({ ...emptyEditor(), open: true, mode: 'create' });
  const openEdit = (a: AgentProfile) => {
    setEditor({
      open: true,
      mode: 'edit',
      initialId: a.id,
      id: a.id,
      name: a.name,
      role: a.role,
      systemPrompt: a.systemPrompt,
      capabilitiesText: a.capabilities.join('\n'),
      limitationsText: a.limitations.join('\n'),
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
        role: editor.role,
        systemPrompt: editor.systemPrompt,
        capabilities: editor.capabilitiesText.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 8),
        limitations: editor.limitationsText.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 8),
      };
      if (editor.mode === 'create') {
        await api.post('/agents', payload);
      } else {
        await api.patch(`/agents/${encodeURIComponent(editor.initialId)}`, payload);
      }
      toast({ type: 'success', title: t('agents.aiSavedOk') });
      setEditor(emptyEditor());
      await list.run();
    } catch (raw) {
      const err = classifyError(raw);
      toast({ type: 'error', title: t('agents.aiSaveFailed'), message: t(`errors.kind.${err.kind}`, err.message) });
    } finally {
      setSaving(false);
    }
  }, [editor, list, t]);

  const doDelete = useCallback(async () => {
    if (!deleting) return;
    try {
      await api.delete(`/agents/${encodeURIComponent(deleting.id)}`);
      toast({ type: 'success', title: t('agents.aiSavedOk') });
      setDeleting(null);
      await list.run();
    } catch (raw) {
      const err = classifyError(raw);
      toast({ type: 'error', title: t('agents.aiSaveFailed'), message: t(`errors.kind.${err.kind}`, err.message) });
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
    const role = typeof p.role === 'string' ? p.role : '';
    const systemPrompt = typeof p.systemPrompt === 'string' ? p.systemPrompt : '';
    const capabilities = Array.isArray(p.capabilities)
      ? (p.capabilities as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean)
      : [];
    const limitations = Array.isArray(p.limitations)
      ? (p.limitations as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean)
      : [];
    setEditor({
      open: true,
      mode: 'create',
      initialId: '',
      id: (id || `gen_${Date.now().toString(36)}`).slice(0, 40),
      name: name || '',
      role,
      systemPrompt,
      capabilitiesText: capabilities.join('\n'),
      limitationsText: limitations.join('\n'),
    });
  };

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Wand2 size={18} /> {t('agents.title')}
          </h1>
          <p className="text-sm text-fg-mute mt-1">{t('agents.subtitle')}</p>
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
            {t('agents.aiGenerate')}
          </Button>
          <Button variant="primary" size="sm" leftIcon={<Plus size={12} />} onClick={openCreate}>
            {t('agents.newAgent')}
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
            {t('agents.builtinBadge')} ({builtins.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {builtins.map((a) => (
              <AgentCard
                key={a.id}
                agent={a}
                expanded={!!expanded[a.id]}
                onToggle={() => setExpanded((e) => ({ ...e, [a.id]: !e[a.id] }))}
                onEdit={() => openEdit(a)}
                onDelete={() => setDeleting(a)}
                canDelete={false}
              />
            ))}
          </div>

          <div className="text-[10.5px] uppercase tracking-wide text-fg-mute pt-2 flex items-center gap-2">
            {t('agents.customBadge')} ({customs.length})
            {customs.length === 0 && (
              <span className="text-fg-mute normal-case">{t('agents.noCustom')}</span>
            )}
          </div>
          {customs.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {customs.map((a) => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  expanded={!!expanded[a.id]}
                  onToggle={() => setExpanded((e) => ({ ...e, [a.id]: !e[a.id] }))}
                  onEdit={() => openEdit(a)}
                  onDelete={() => setDeleting(a)}
                  canDelete
                />
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={editor.open}
        onClose={() => setEditor(emptyEditor())}
        size="lg"
        title={editor.mode === 'create' ? t('agents.newAgent') : t('agents.edit')}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={t('agents.idLabel')}
              value={editor.id}
              onChange={(e) => setEditor({ ...editor, id: e.target.value })}
              disabled={editor.mode === 'edit'}
            />
            <Input
              label={t('agents.nameLabel')}
              value={editor.name}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
            />
          </div>
          <Input
            label={t('agents.roleLabel')}
            value={editor.role}
            onChange={(e) => setEditor({ ...editor, role: e.target.value })}
            placeholder="1-2 sentence role description"
          />
          <Textarea
            label={t('agents.systemPromptLabel')}
            value={editor.systemPrompt}
            onChange={(e) => setEditor({ ...editor, systemPrompt: e.target.value })}
            rows={6}
            placeholder="Detailed system prompt (100-200 words)"
          />
          <Textarea
            label={t('agents.capabilitiesLabel')}
            value={editor.capabilitiesText}
            onChange={(e) => setEditor({ ...editor, capabilitiesText: e.target.value })}
            rows={3}
            placeholder="One capability per line (verb phrases, 3-6 entries)"
          />
          <Textarea
            label={t('agents.limitationsLabel')}
            value={editor.limitationsText}
            onChange={(e) => setEditor({ ...editor, limitationsText: e.target.value })}
            rows={2}
            placeholder="What the agent must NOT do (one per line)"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEditor(emptyEditor())}>{t('common.cancel')}</Button>
            <Button variant="primary" loading={saving} disabled={saving} onClick={save} leftIcon={<CheckCircle2 size={13} />}>
              {editor.mode === 'create' ? t('agents.createBtn') : t('agents.saveBtn')}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        title={t('agents.delete')}
        message={t('agents.deleteConfirm', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={doDelete}
        onCancel={() => setDeleting(null)}
      />

      <AIGenerateDialog
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        type="agent"
        defaultPrompt={aiSeed}
        allowTypeSwitch
        onApply={handleAIApply}
      />
    </div>
  );
}

interface CardProps {
  agent: AgentProfile;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canDelete: boolean;
}

function AgentCard({ agent, expanded, onToggle, onEdit, onDelete, canDelete }: CardProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'rounded-lg border p-3 space-y-2 transition-colors',
        agent.builtin ? 'border-border bg-bg-soft' : 'border-brand/30 bg-brand/4',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl">{emojiFor(agent.id)}</span>
            <span className="text-sm font-medium truncate">{agent.name}</span>
            <Badge variant={agent.builtin ? 'muted' : 'brand'} size="sm">
              {agent.builtin ? t('agents.builtinBadge') : t('agents.customBadge')}
            </Badge>
          </div>
          <div className="text-[10.5px] text-fg-mute font-mono truncate">{agent.id}</div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" leftIcon={<Pencil size={11} />} onClick={onEdit}>
            {t('agents.edit')}
          </Button>
          {canDelete && (
            <Button variant="danger" size="sm" leftIcon={<Trash2 size={11} />} onClick={onDelete}>
              {t('agents.delete')}
            </Button>
          )}
        </div>
      </div>
      <p className="text-[11px] text-fg-soft line-clamp-2">{agent.role}</p>
      <div className="flex flex-wrap gap-1">
        {agent.capabilities.slice(0, 4).map((c) => (
          <Badge key={c} variant="info" size="sm">{c}</Badge>
        ))}
        {agent.capabilities.length > 4 && <Badge variant="muted" size="sm">+{agent.capabilities.length - 4}</Badge>}
      </div>
      <button
        onClick={onToggle}
        className="text-[10.5px] text-fg-mute hover:text-fg flex items-center gap-1"
      >
        {expanded ? '▴' : '▾'} {t('agents.systemPromptLabel')}
      </button>
      {expanded && (
        <div className="space-y-1.5">
          <pre className="text-[10.5px] font-mono whitespace-pre-wrap bg-bg p-2 rounded border border-border max-h-40 overflow-auto">
            {agent.systemPrompt || '—'}
          </pre>
          {agent.limitations.length > 0 && (
            <div className="text-[10.5px] text-fg-mute">
              <AlertCircle size={9} className="inline" /> {agent.limitations.join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
