import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardBody } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input, Textarea } from '@/components/Input';
import { Toggle, Select } from '@/components/Form';
import { Badge, Dot } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import { ProviderLogo } from '@/components/ProviderLogo';
import { Spinner } from '@/components/Spinner';
import { useConfigStore, type ProviderMeta, type CircuitBreakerLive } from '@/stores/config';
import { toast } from '@/components/Toast';
import { cn, providerColor } from '@/utils';
import type { ProviderType } from '@/types';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Globe,
  Key,
  KeyRound,
  Plug,
  Power,
  Save,
  Settings2,
  ShieldAlert,
  Star,
  Trash2,
  Wrench,
  Download,
  Upload,
  RotateCcw,
  Database,
  Info,
  X,
  Plus,
} from 'lucide-react';

// ────────────────────────────────────────────────────────────────────────────
// Sectioned Config page — accordion layout
// Inspired by Open WebUI / LM Studio: one save-state per section, with
// providers getting their own full row, a reliability section that mirrors
// real backend state, and a data-management danger zone.
// ────────────────────────────────────────────────────────────────────────────

type SectionId = 'overview' | 'chat' | 'providers' | 'sandbox' | 'reliability' | 'data' | 'env';

export function Config() {
  const { t } = useTranslation();
  const {
    providers,
    snapshot,
    live,
    envVars,
    fileMeta,
    loadAll,
    setKey,
    removeKey,
    setBaseUrl,
    resetBaseUrl,
    setDefault,
    saveChatDefaults,
    saveSandbox,
    saveCircuitBreaker,
    resetCircuitBreaker,
    testConnection,
    listModels,
    exportConfig,
    importConfig,
    resetConfig,
  } = useConfigStore();

  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>({
    overview: true,
    chat: true,
    providers: true,
    sandbox: false,
    reliability: false,
    data: false,
    env: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await loadAll();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAll]);

  const toggle = (s: SectionId) => setOpenSections((p) => ({ ...p, [s]: !p[s] }));

  if (loading && !snapshot) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-12">
      <PageHeader onReload={loadAll} loading={loading} />

      <Section
        id="overview"
        open={openSections.overview}
        onToggle={() => toggle('overview')}
        icon={<Info size={14} />}
        title={t('config.section.overview')}
        subtitle={t('config.section.overviewDesc')}
      >
        <OverviewPanel
          providers={providers}
          defaultProvider={snapshot?.defaultProvider}
          chat={snapshot?.chat}
          sandbox={snapshot?.sandbox}
          circuitBreaker={snapshot?.circuitBreaker}
          liveCount={live.length}
          fileMeta={fileMeta}
        />
      </Section>

      <Section
        id="chat"
        open={openSections.chat}
        onToggle={() => toggle('chat')}
        icon={<Settings2 size={14} />}
        title={t('config.section.chat')}
        subtitle={t('config.section.chatDesc')}
      >
        <ChatDefaultsPanel
          providers={providers}
          defaultProvider={snapshot?.defaultProvider}
          initial={snapshot?.chat}
          listModels={listModels}
          onSave={async (next) => {
            await saveChatDefaults(next);
            toast({ type: 'success', title: t('config.saved') });
          }}
          onSetDefault={async (provider) => {
            await setDefault(provider);
            toast({ type: 'success', title: t('config.saved') });
          }}
        />
      </Section>

      <Section
        id="providers"
        open={openSections.providers}
        onToggle={() => toggle('providers')}
        icon={<KeyRound size={14} />}
        title={t('config.section.providers')}
        subtitle={t('config.section.providersDesc', { count: providers.length, n: providers.length })}
      >
        <ProvidersPanel
          providers={providers}
          defaultProvider={snapshot?.defaultProvider}
          onSetDefault={async (p) => {
            await setDefault(p);
            toast({ type: 'success', title: t('config.saved') });
          }}
          onTest={async (p) => {
            try {
              const r = await testConnection(p);
              toast({
                type: r.available ? 'success' : 'warning',
                title: r.available ? t('config.test.ok') : t('config.test.fail'),
                message: r.available
                  ? t('config.test.okMsg', { provider: p })
                  : t('config.test.failMsg', { provider: p }),
              });
            } catch (e) {
              toast({ type: 'error', title: t('config.test.error'), message: String(e) });
            }
          }}
          onSaveKey={async (provider, key) => {
            await setKey(provider, key);
            toast({ type: 'success', title: t('config.saved') });
          }}
          onRemoveKey={async (provider) => {
            await removeKey(provider);
            toast({ type: 'success', title: t('config.saved') });
          }}
          onSaveBaseUrl={async (provider, url) => {
            await setBaseUrl(provider, url);
            toast({ type: 'success', title: t('config.saved') });
          }}
          onResetBaseUrl={async (provider) => {
            await resetBaseUrl(provider);
            toast({ type: 'success', title: t('config.saved') });
          }}
        />
      </Section>

      <Section
        id="sandbox"
        open={openSections.sandbox}
        onToggle={() => toggle('sandbox')}
        icon={<Wrench size={14} />}
        title={t('config.section.sandbox')}
        subtitle={t('config.section.sandboxDesc')}
      >
        <SandboxPanel
          initial={snapshot?.sandbox}
          onSave={async (next) => {
            await saveSandbox(next);
            toast({ type: 'success', title: t('config.saved') });
          }}
        />
      </Section>

      <Section
        id="reliability"
        open={openSections.reliability}
        onToggle={() => toggle('reliability')}
        icon={<ShieldAlert size={14} />}
        title={t('config.section.reliability')}
        subtitle={t('config.section.reliabilityDesc')}
      >
        <ReliabilityPanel
          initial={snapshot?.circuitBreaker}
          live={live}
          onSave={async (next) => {
            await saveCircuitBreaker(next);
            toast({ type: 'success', title: t('config.saved') });
          }}
          onReset={async (provider) => {
            await resetCircuitBreaker(provider);
            toast({ type: 'success', title: t('config.saved') });
          }}
        />
      </Section>

      <Section
        id="data"
        open={openSections.data}
        onToggle={() => toggle('data')}
        icon={<Database size={14} />}
        title={t('config.section.data')}
        subtitle={t('config.section.dataDesc')}
      >
        <DataPanel
          fileMeta={fileMeta}
          onExport={async () => {
            const data = await exportConfig();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `personal-assistant-config-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toast({ type: 'success', title: t('config.data.exported') });
          }}
          onImport={async (data) => {
            await importConfig(data);
            toast({ type: 'success', title: t('config.data.imported') });
          }}
          onReset={async () => {
            if (!confirm(t('config.data.resetConfirm'))) return;
            await resetConfig();
            toast({ type: 'success', title: t('config.data.resetDone') });
          }}
        />
      </Section>

      <Section
        id="env"
        open={openSections.env}
        onToggle={() => toggle('env')}
        icon={<Globe size={14} />}
        title={t('config.section.env')}
        subtitle={t('config.section.envDesc')}
      >
        <EnvPanel env={envVars} providers={providers} />
      </Section>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Layout helpers
// ────────────────────────────────────────────────────────────────────────────

function PageHeader({ onReload, loading }: { onReload: () => void | Promise<void>; loading: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Settings2 size={18} />
          {t('config.title')}
        </h1>
        <p className="text-xs text-fg-soft mt-0.5">{t('config.subtitle')}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={() => onReload()} loading={loading}>
        {t('config.reload')}
      </Button>
    </div>
  );
}

function Section({
  id,
  open,
  onToggle,
  icon,
  title,
  subtitle,
  children,
}: {
  id: SectionId;
  open: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`section-${id}`}
        className="w-full text-left"
      >
        <CardHeader className="flex items-center gap-2 cursor-pointer hover:bg-bg-soft/40 transition-colors">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="text-fg-soft">{icon}</span>
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-[10.5px] text-fg-mute ml-2 hidden sm:inline">— {subtitle}</span>
        </CardHeader>
      </button>
      {open && (
        <CardBody id={`section-${id}`} className="pt-0 space-y-3">
          {children}
        </CardBody>
      )}
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Overview
// ────────────────────────────────────────────────────────────────────────────

function OverviewPanel({
  providers,
  defaultProvider,
  chat,
  sandbox,
  circuitBreaker,
  liveCount,
  fileMeta,
}: {
  providers: ProviderMeta[];
  defaultProvider: ProviderType | undefined;
  chat: { model?: string; temperature?: number; maxTokens?: number; systemPrompt?: string } | undefined;
  sandbox: { enabled: boolean } | undefined;
  circuitBreaker: { enabled: boolean; failureThreshold?: number; resetTimeout?: number } | undefined;
  liveCount: number;
  fileMeta: { path: string; exists: boolean; size: number; modifiedAt: string | null } | null;
}) {
  const { t } = useTranslation();
  const configuredCount = providers.filter((p) => p.hasKey || p.protocol === 'ollama').length;
  const customUrlCount = providers.filter((p) => p.isCustomBaseUrl).length;
  const sysPrompt = chat?.systemPrompt ?? '';
  const hasSystemPrompt = sysPrompt.trim().length > 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <Stat icon={<KeyRound size={14} />} label={t('config.overview.providers')} value={`${configuredCount}/${providers.length}`} sub={t('config.overview.configuredSub')} />
      <Stat icon={<Star size={14} />} label={t('config.overview.default')} value={defaultProvider ?? '—'} sub={t('config.overview.defaultSub', { model: chat?.model ?? '—' })} />
      <Stat icon={<Settings2 size={14} />} label={t('config.overview.sampling')} value={chat?.model ? `T ${chat.temperature?.toFixed(2)} · ${chat.maxTokens ?? '—'} tok` : '—'} sub={t('config.overview.samplingSub')} />
      <Stat icon={<Wrench size={14} />} label={t('config.overview.sandbox')} value={sandbox?.enabled ? t('common.on') : t('common.off')} sub={sandbox?.enabled ? t('config.overview.sandboxOn') : t('config.overview.sandboxOff')} />
      <Stat icon={<ShieldAlert size={14} />} label={t('config.overview.reliability')} value={circuitBreaker?.enabled ? t('common.on') : t('common.off')} sub={t('config.overview.reliabilitySub', { thr: circuitBreaker?.failureThreshold ?? 5, to: circuitBreaker?.resetTimeout ?? 30000, live: liveCount })} />
      <Stat icon={<Database size={14} />} label={t('config.overview.file')} value={fileMeta?.exists ? `${(fileMeta.size / 1024).toFixed(1)} KB` : t('config.overview.none')} sub={fileMeta?.modifiedAt ? new Date(fileMeta.modifiedAt).toLocaleString() : ''} />
      <Stat icon={<Plug size={14} />} label={t('config.overview.customUrls')} value={`${customUrlCount}`} sub={t('config.overview.customUrlsSub')} />
      <Stat icon={<Info size={14} />} label={t('config.overview.systemPrompt')} value={hasSystemPrompt ? t('config.overview.set', { n: sysPrompt.length }) : t('config.overview.notSet')} sub={hasSystemPrompt ? t('config.overview.systemPromptSet') : t('config.overview.systemPromptNone')} />
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-soft/50 p-3">
      <div className="flex items-center gap-1.5 text-[10.5px] text-fg-soft">
        {icon}
        <span className="uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-base font-semibold mt-1.5 truncate">{value}</div>
      <div className="text-[10.5px] text-fg-mute mt-0.5">{sub}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Chat defaults
// ────────────────────────────────────────────────────────────────────────────

function ChatDefaultsPanel({
  providers,
  defaultProvider,
  initial,
  listModels,
  onSave,
  onSetDefault,
}: {
  providers: ProviderMeta[];
  defaultProvider: ProviderType | undefined;
  initial: { model?: string; temperature?: number; maxTokens?: number; topP?: number; presencePenalty?: number; frequencyPenalty?: number; systemPrompt?: string } | undefined;
  listModels: (p: ProviderType) => Promise<string[]>;
  onSave: (next: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    systemPrompt?: string;
  }) => Promise<void>;
  onSetDefault: (p: ProviderType) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [model, setModel] = useState(initial?.model ?? '');
  const [temperature, setTemperature] = useState(initial?.temperature ?? 0.7);
  const [maxTokens, setMaxTokens] = useState(initial?.maxTokens ?? 2048);
  const [topP, setTopP] = useState(initial?.topP ?? 1);
  const [presence, setPresence] = useState(initial?.presencePenalty ?? 0);
  const [frequency, setFrequency] = useState(initial?.frequencyPenalty ?? 0);
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? '');
  const [provider, setProvider] = useState<ProviderType | ''>(defaultProvider ?? '');
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);

  // Sync from snapshot when it changes
  useEffect(() => {
    if (!initial) return;
    if (dirtyRef.current) return;
    setModel(initial.model ?? '');
    setTemperature(initial.temperature ?? 0.7);
    setMaxTokens(initial.maxTokens ?? 2048);
    setTopP(initial.topP ?? 1);
    setPresence(initial.presencePenalty ?? 0);
    setFrequency(initial.frequencyPenalty ?? 0);
    setSystemPrompt(initial.systemPrompt ?? '');
  }, [initial]);

  useEffect(() => {
    if (defaultProvider) setProvider(defaultProvider);
  }, [defaultProvider]);

  const refreshModels = useCallback(
    async (p: ProviderType | '') => {
      if (!p) return;
      setLoadingModels(true);
      try {
        const m = await listModels(p);
        setModels(m);
        if (m.length > 0 && !m.includes(model)) {
          // leave current model intact, just populate the list
        }
      } catch {
        setModels(providers.find((x) => x.id === p)?.defaultModel ? [providers.find((x) => x.id === p)!.defaultModel] : []);
      } finally {
        setLoadingModels(false);
      }
    },
    [listModels, model, providers],
  );

  useEffect(() => {
    if (provider) refreshModels(provider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const isDirty = useMemo(() => {
    if (!initial) return false;
    return (
      (model || '') !== (initial.model || '') ||
      temperature !== (initial.temperature ?? 0.7) ||
      maxTokens !== (initial.maxTokens ?? 2048) ||
      topP !== (initial.topP ?? 1) ||
      presence !== (initial.presencePenalty ?? 0) ||
      frequency !== (initial.frequencyPenalty ?? 0) ||
      (systemPrompt || '') !== (initial.systemPrompt || '')
    );
  }, [initial, model, temperature, maxTokens, topP, presence, frequency, systemPrompt]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ model: model || undefined, temperature, maxTokens, topP, presencePenalty: presence, frequencyPenalty: frequency, systemPrompt: systemPrompt || undefined });
      dirtyRef.current = false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="space-y-3">
          <Field label={t('config.chat.defaultProvider')}>
            <div className="flex gap-2">
              <Select
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value as ProviderType);
                  dirtyRef.current = true;
                }}
                className="flex-1"
              >
                <option value="">{t('config.chat.noProvider')}</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
              {provider && provider !== defaultProvider && (
                <Button variant="outline" size="sm" onClick={() => onSetDefault(provider as ProviderType)}>
                  {t('config.chat.setAsDefault')}
                </Button>
              )}
            </div>
          </Field>

          <Field label={t('chat.model')}>
            <div className="flex gap-2">
              <Input
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  dirtyRef.current = true;
                }}
                placeholder="gpt-4o-mini, claude-3-5-sonnet, ..."
                className="flex-1 font-mono text-xs"
              />
              {models.length > 0 && (
                <Select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      setModel(e.target.value);
                      dirtyRef.current = true;
                    }
                  }}
                  className="w-48"
                >
                  <option value="">{loadingModels ? t('config.chat.loadingModels') : t('config.chat.pickModel')}</option>
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <p className="text-[10.5px] text-fg-mute mt-1">{t('config.chat.modelHint')}</p>
          </Field>

          <Field label={t('config.chat.systemPrompt')}>
            <Textarea
              value={systemPrompt}
              onChange={(e) => {
                setSystemPrompt(e.target.value);
                dirtyRef.current = true;
              }}
              placeholder="You are a helpful assistant..."
              rows={4}
              className="font-mono text-xs"
            />
            <p className="text-[10.5px] text-fg-mute mt-1">{t('config.chat.systemPromptHint')}</p>
          </Field>
        </div>

        <div className="space-y-3">
          <SliderField label={t('config.temperature')} value={temperature} min={0} max={2} step={0.05} onChange={setTemperature} hint={t('config.chat.tempHint')} />
          <SliderField label={t('config.chat.topP')} value={topP} min={0} max={1} step={0.05} onChange={setTopP} hint={t('config.chat.topPHint')} />
          <SliderField label={t('config.chat.presencePenalty')} value={presence} min={-2} max={2} step={0.1} onChange={setPresence} hint={t('config.chat.presenceHint')} />
          <SliderField label={t('config.chat.frequencyPenalty')} value={frequency} min={-2} max={2} step={0.1} onChange={setFrequency} hint={t('config.chat.frequencyHint')} />
          <Field label={t('config.maxTokens')}>
            <Input
              type="number"
              min={1}
              value={maxTokens}
              onChange={(e) => {
                setMaxTokens(parseInt(e.target.value) || 2048);
                dirtyRef.current = true;
              }}
            />
          </Field>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {isDirty && (
          <span className="text-[10.5px] text-warning flex items-center gap-1 mr-auto">
            <Dot variant="warning" /> {t('config.unsaved')}
          </span>
        )}
        <Button variant="primary" leftIcon={<Save size={12} />} onClick={handleSave} loading={saving} disabled={!isDirty}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-fg-soft mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  hint: string;
}) {
  return (
    <Field label={`${label}: ${value.toFixed(2)}`}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-brand"
      />
      <p className="text-[10.5px] text-fg-mute mt-0.5">{hint}</p>
    </Field>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Providers
// ────────────────────────────────────────────────────────────────────────────

function ProvidersPanel({
  providers,
  defaultProvider,
  onSetDefault,
  onTest,
  onSaveKey,
  onRemoveKey,
  onSaveBaseUrl,
  onResetBaseUrl,
}: {
  providers: ProviderMeta[];
  defaultProvider: ProviderType | undefined;
  onSetDefault: (p: ProviderType) => Promise<void>;
  onTest: (p: ProviderType) => Promise<void>;
  onSaveKey: (provider: ProviderType, key: string) => Promise<void>;
  onRemoveKey: (provider: ProviderType) => Promise<void>;
  onSaveBaseUrl: (provider: ProviderType, url: string) => Promise<void>;
  onResetBaseUrl: (provider: ProviderType) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<ProviderType | null>(null);
  const [testing, setTesting] = useState<ProviderType | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {providers.map((p) => {
          const isDefault = defaultProvider === p.id;
          return (
            <Card key={p.id} className={cn(isDefault && 'border-brand/40 shadow-glow')}>
              <CardBody>
                <div className="flex items-start gap-3">
                  <ProviderLogo provider={p.id} name={p.name} className="h-10 w-10 rounded-md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold">{p.name}</span>
                      <span className="text-[10.5px] text-fg-mute font-mono">{p.id}</span>
                      {isDefault && <Badge variant="brand" size="sm"><Star size={10} /> {t('config.defaultBadge')}</Badge>}
                      {p.hasKey ? (
                        <Badge variant="success" size="sm"><Check size={10} /> {t('config.configured')}</Badge>
                      ) : p.protocol === 'ollama' ? (
                        <Badge variant="info" size="sm">{t('config.local')}</Badge>
                      ) : (
                        <Badge variant="warning" size="sm">{t('config.keyMissing')}</Badge>
                      )}
                      {p.isCustomBaseUrl && (
                        <Badge variant="info" size="sm"><Globe size={10} /> {t('config.customUrl')}</Badge>
                      )}
                    </div>
                    <div className="text-[10.5px] text-fg-mute mt-1 font-mono truncate flex items-center gap-1">
                      <Globe size={9} /> {p.baseUrl}
                    </div>
                    <div className="text-[10.5px] text-fg-mute font-mono mt-0.5">
                      {t('config.defaultModel')}: <span className="text-fg-soft">{p.defaultModel}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {!isDefault && (
                    <Button variant="outline" size="sm" onClick={() => onSetDefault(p.id)} leftIcon={<Star size={11} />}>
                      {t('config.setDefault')}
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => setEditing(p.id)} leftIcon={<Key size={11} />}>
                    {p.hasKey ? t('config.edit') : t('common.configure')}
                  </Button>
                  {p.hasKey && (
                    <Button variant="ghost" size="sm" onClick={async () => {
                      setTesting(p.id);
                      try { await onTest(p.id); } finally { setTesting(null); }
                    }} loading={testing === p.id}>
                      {t('config.testBtn')}
                    </Button>
                  )}
                  {p.hasKey && (
                    <Button variant="ghost" size="sm" onClick={() => onRemoveKey(p.id)} className="text-danger hover:text-danger" leftIcon={<Trash2 size={11} />}>
                      {t('common.delete')}
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {editing && (
        <ProviderEditModal
          provider={providers.find((p) => p.id === editing)!}
          onClose={() => setEditing(null)}
          onSaveKey={async (key) => {
            if (key.length > 0) await onSaveKey(editing, key);
          }}
          onSaveBaseUrl={async (url) => {
            await onSaveBaseUrl(editing, url);
          }}
          onResetBaseUrl={async () => {
            await onResetBaseUrl(editing);
          }}
        />
      )}
    </>
  );
}

function ProviderEditModal({
  provider,
  onClose,
  onSaveKey,
  onSaveBaseUrl,
  onResetBaseUrl,
}: {
  provider: ProviderMeta;
  onClose: () => void;
  onSaveKey: (key: string) => Promise<void>;
  onSaveBaseUrl: (url: string) => Promise<void>;
  onResetBaseUrl: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [key, setKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl === provider.defaultBaseUrl ? '' : provider.baseUrl);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (key.length > 0) await onSaveKey(key);
      if (baseUrl !== provider.baseUrl) {
        if (baseUrl.trim().length === 0) await onResetBaseUrl();
        else await onSaveBaseUrl(baseUrl.trim());
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={t('config.configure', { provider: provider.name })} size="md">
      <div className="space-y-3">
        {provider.protocol !== 'ollama' && (
          <div>
            <label className="block text-xs font-medium text-fg-soft mb-1.5">{t('config.apiKey')}</label>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={provider.hasKey ? '••••••• (leave blank to keep)' : 'sk-...'}
                className="font-mono pr-9"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-mute hover:text-fg"
                type="button"
                aria-label="toggle visibility"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-[10.5px] text-fg-mute mt-1">
              {provider.hasKey ? t('config.keyHintKeep') : t('config.keyHint')}
            </p>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-fg-soft mb-1.5">{t('config.baseUrl')}</label>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={provider.defaultBaseUrl}
            className="font-mono text-xs"
          />
          <p className="text-[10.5px] text-fg-mute mt-1">{t('config.baseUrlHint')}</p>
        </div>
        <div className="bg-info/10 border border-info/20 text-info rounded-md p-2.5 text-xs space-y-1">
          <div className="font-medium flex items-center gap-1.5"><Info size={12} /> {t('config.envPriority')}</div>
          <div className="text-[10.5px] font-mono whitespace-pre-line">
            {t('config.envPriorityList', { PROVIDER: provider.id.toUpperCase() })}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>{t('common.save')}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sandbox
// ────────────────────────────────────────────────────────────────────────────

const COMMAND_PRESETS = ['ls', 'cat', 'grep', 'head', 'tail', 'wc', 'find', 'pwd', 'echo', 'date', 'node', 'npm', 'git'];

function SandboxPanel({
  initial,
  onSave,
}: {
  initial: { enabled: boolean; allowedCommands?: string[]; timeout?: number; workingDirectory?: string } | undefined;
  onSave: (next: { enabled: boolean; allowedCommands?: string[]; timeout?: number; workingDirectory?: string }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [commands, setCommands] = useState<string[]>(initial?.allowedCommands ?? []);
  const [cmdInput, setCmdInput] = useState('');
  const [timeout, setTimeout_] = useState(initial?.timeout ?? 10000);
  const [cwd, setCwd] = useState(initial?.workingDirectory ?? '');
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!initial || dirtyRef.current) return;
    setEnabled(initial.enabled);
    setCommands(initial.allowedCommands ?? []);
    setTimeout_(initial.timeout ?? 10000);
    setCwd(initial.workingDirectory ?? '');
  }, [initial]);

  const addCmd = (c: string) => {
    const v = c.trim();
    if (v && !commands.includes(v)) setCommands([...commands, v]);
    setCmdInput('');
    dirtyRef.current = true;
  };
  const removeCmd = (c: string) => {
    setCommands(commands.filter((x) => x !== c));
    dirtyRef.current = true;
  };
  const togglePreset = (c: string) => {
    if (commands.includes(c)) removeCmd(c);
    else addCmd(c);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-md border border-border p-3 bg-bg-soft/40">
        <div>
          <div className="text-sm font-medium flex items-center gap-1.5">
            <Power size={13} /> {t('config.sandbox.enable')}
          </div>
          <p className="text-[10.5px] text-fg-mute mt-0.5">{t('config.sandbox.enableHint')}</p>
        </div>
        <Toggle
          checked={enabled}
          onChange={(v) => {
            setEnabled(v);
            dirtyRef.current = true;
          }}
        />
      </div>

      <div className={cn('space-y-3', !enabled && 'opacity-50 pointer-events-none')}>
        <Field label={t('config.sandbox.commands')}>
          <div className="flex gap-2">
            <Input
              value={cmdInput}
              onChange={(e) => setCmdInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addCmd(cmdInput);
              }}
              placeholder="ls, cat, ..."
              className="flex-1 font-mono text-xs"
            />
            <Button variant="secondary" size="sm" onClick={() => addCmd(cmdInput)} leftIcon={<Plus size={12} />}>
              {t('common.add')}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {COMMAND_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => togglePreset(p)}
                className={cn(
                  'text-[10.5px] px-1.5 py-0.5 rounded font-mono transition-colors',
                  commands.includes(p)
                    ? 'bg-brand/15 text-brand border border-brand/30'
                    : 'bg-bg-soft text-fg-mute border border-border hover:border-fg-soft',
                )}
              >
                {p}
              </button>
            ))}
          </div>
          {commands.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {commands.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded bg-bg-elev border border-border">
                  <span className="font-mono">{c}</span>
                  <button onClick={() => removeCmd(c)} className="text-fg-mute hover:text-danger" aria-label={`remove ${c}`}>
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="text-[10.5px] text-fg-mute mt-1.5">{t('config.sandbox.commandsHint')}</p>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={`${t('config.sandbox.timeout')} (ms)`}>
            <Input
              type="number"
              min={100}
              value={timeout}
              onChange={(e) => {
                setTimeout_(parseInt(e.target.value) || 10000);
                dirtyRef.current = true;
              }}
            />
          </Field>
          <Field label={t('config.sandbox.workingDir')}>
            <Input
              value={cwd}
              onChange={(e) => {
                setCwd(e.target.value);
                dirtyRef.current = true;
              }}
              placeholder="(process.cwd() if empty)"
              className="font-mono text-xs"
            />
          </Field>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button
          variant="primary"
          leftIcon={<Save size={12} />}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave({ enabled, allowedCommands: commands, timeout, workingDirectory: cwd || undefined });
              dirtyRef.current = false;
            } finally {
              setSaving(false);
            }
          }}
          loading={saving}
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Reliability (Circuit Breaker)
// ────────────────────────────────────────────────────────────────────────────

function ReliabilityPanel({
  initial,
  live,
  onSave,
  onReset,
}: {
  initial: { enabled: boolean; failureThreshold?: number; resetTimeout?: number; halfOpenMaxCalls?: number } | undefined;
  live: CircuitBreakerLive[];
  onSave: (next: { enabled: boolean; failureThreshold?: number; resetTimeout?: number; halfOpenMaxCalls?: number }) => Promise<void>;
  onReset: (provider?: ProviderType) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [failureThreshold, setFailureThreshold] = useState(initial?.failureThreshold ?? 5);
  const [resetTimeout, setResetTimeout] = useState(initial?.resetTimeout ?? 30000);
  const [halfOpen, setHalfOpen] = useState(initial?.halfOpenMaxCalls ?? 1);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!initial || dirtyRef.current) return;
    setEnabled(initial.enabled);
    setFailureThreshold(initial.failureThreshold ?? 5);
    setResetTimeout(initial.resetTimeout ?? 30000);
    setHalfOpen(initial.halfOpenMaxCalls ?? 1);
  }, [initial]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-md border border-border p-3 bg-bg-soft/40">
        <div>
          <div className="text-sm font-medium flex items-center gap-1.5">
            <ShieldAlert size={13} /> {t('config.cb.enable')}
          </div>
          <p className="text-[10.5px] text-fg-mute mt-0.5">{t('config.cb.enableHint')}</p>
        </div>
        <Toggle
          checked={enabled}
          onChange={(v) => {
            setEnabled(v);
            dirtyRef.current = true;
          }}
        />
      </div>

      <div className={cn('grid grid-cols-1 md:grid-cols-3 gap-3', !enabled && 'opacity-50 pointer-events-none')}>
        <Field label={t('config.cb.failureThreshold')}>
          <Input type="number" min={1} value={failureThreshold} onChange={(e) => { setFailureThreshold(parseInt(e.target.value) || 5); dirtyRef.current = true; }} />
          <p className="text-[10.5px] text-fg-mute mt-0.5">{t('config.cb.failureThresholdHint')}</p>
        </Field>
        <Field label={`${t('config.cb.resetTimeout')} (ms)`}>
          <Input type="number" min={100} value={resetTimeout} onChange={(e) => { setResetTimeout(parseInt(e.target.value) || 30000); dirtyRef.current = true; }} />
          <p className="text-[10.5px] text-fg-mute mt-0.5">{t('config.cb.resetTimeoutHint')}</p>
        </Field>
        <Field label={t('config.cb.halfOpenMaxCalls')}>
          <Input type="number" min={1} value={halfOpen} onChange={(e) => { setHalfOpen(parseInt(e.target.value) || 1); dirtyRef.current = true; }} />
          <p className="text-[10.5px] text-fg-mute mt-0.5">{t('config.cb.halfOpenMaxCallsHint')}</p>
        </Field>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium text-fg-soft flex items-center gap-1.5">
            <Power size={12} /> {t('config.cb.liveTitle')}
          </div>
          <Button variant="ghost" size="sm" onClick={() => onReset()} leftIcon={<RotateCcw size={11} />}>
            {t('config.cb.resetAll')}
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {live.map((l) => {
            const variant = l.state === 'OPEN' ? 'danger' : l.state === 'HALF_OPEN' ? 'warning' : 'success';
            return (
              <div key={l.provider} className="rounded-md border border-border bg-bg-soft/40 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold truncate" style={{ color: providerColor(l.provider) }}>{l.provider}</span>
                  <Badge variant={variant} size="sm">{l.state}</Badge>
                </div>
                <div className="text-[10.5px] text-fg-mute mt-1 flex justify-between">
                  <span>↑ {l.successes}</span>
                  <span>↓ {l.failures}</span>
                </div>
                {l.failures > 0 && (
                  <button onClick={() => onReset(l.provider)} className="text-[10.5px] text-fg-mute hover:text-fg mt-1.5">
                    {t('config.cb.resetOne')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button
          variant="primary"
          leftIcon={<Save size={12} />}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave({ enabled, failureThreshold, resetTimeout, halfOpenMaxCalls: halfOpen });
              dirtyRef.current = false;
            } finally {
              setSaving(false);
            }
          }}
          loading={saving}
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Data management
// ────────────────────────────────────────────────────────────────────────────

function DataPanel({
  fileMeta,
  onExport,
  onImport,
  onReset,
}: {
  fileMeta: { path: string; exists: boolean; size: number; modifiedAt: string | null } | null;
  onExport: () => Promise<void>;
  onImport: (data: Record<string, unknown>) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = (file: File) => {
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result as string);
        await onImport(data);
      } catch (e) {
        toast({ type: 'error', title: t('config.data.importError'), message: String(e) });
      } finally {
        setImporting(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-bg-soft/40 p-3">
        <div className="text-xs font-medium text-fg-soft mb-1.5">{t('config.data.fileLabel')}</div>
        <code className="text-[10.5px] font-mono text-fg-mute break-all">{fileMeta?.path ?? '—'}</code>
        <div className="text-[10.5px] text-fg-mute mt-1">
          {fileMeta?.exists
            ? t('config.data.fileMeta', { size: (fileMeta.size / 1024).toFixed(2), ts: fileMeta.modifiedAt ? new Date(fileMeta.modifiedAt).toLocaleString() : '—' })
            : t('config.data.fileMissing')}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-md border border-border p-3">
          <div className="text-sm font-medium flex items-center gap-1.5 mb-1"><Download size={12} /> {t('config.data.export')}</div>
          <p className="text-[10.5px] text-fg-mute mb-2">{t('config.data.exportHint')}</p>
          <Button variant="outline" size="sm" onClick={onExport} leftIcon={<Download size={12} />}>
            {t('config.data.exportBtn')}
          </Button>
        </div>
        <div className="rounded-md border border-border p-3">
          <div className="text-sm font-medium flex items-center gap-1.5 mb-1"><Upload size={12} /> {t('config.data.import')}</div>
          <p className="text-[10.5px] text-fg-mute mb-2">{t('config.data.importHint')}</p>
          <input
            type="file"
            accept="application/json"
            ref={fileRef}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              if (fileRef.current) fileRef.current.value = '';
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} loading={importing} leftIcon={<Upload size={12} />}>
            {t('config.data.importBtn')}
          </Button>
        </div>
        <div className="rounded-md border border-danger/30 p-3 bg-danger/5">
          <div className="text-sm font-medium flex items-center gap-1.5 mb-1 text-danger"><RotateCcw size={12} /> {t('config.data.reset')}</div>
          <p className="text-[10.5px] text-fg-mute mb-2">{t('config.data.resetHint')}</p>
          <Button variant="outline" size="sm" onClick={onReset} className="text-danger border-danger/30 hover:bg-danger/10" leftIcon={<RotateCcw size={12} />}>
            {t('config.data.resetBtn')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Environment
// ────────────────────────────────────────────────────────────────────────────

function EnvPanel({ env, providers }: { env: { provider: ProviderType; apiKeyEnv: { name: string; set: boolean; length: number }[]; baseUrlEnv: { name: string; set: boolean; value?: string } | null }[]; providers: ProviderMeta[] }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <p className="text-[10.5px] text-fg-mute mb-2">{t('config.env.hint')}</p>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-bg-soft text-fg-soft">
            <tr>
              <th className="text-left px-2.5 py-1.5 font-medium">{t('config.env.colProvider')}</th>
              <th className="text-left px-2.5 py-1.5 font-medium">{t('config.env.colApiKey')}</th>
              <th className="text-left px-2.5 py-1.5 font-medium">{t('config.env.colBaseUrl')}</th>
            </tr>
          </thead>
          <tbody>
            {env.map((e, i) => {
              const meta = providers.find((p) => p.id === e.provider);
              return (
                <tr key={e.provider} className={cn(i > 0 && 'border-t border-border')}>
                  <td className="px-2.5 py-1.5 align-top">
                    <div className="font-medium">{meta?.name ?? e.provider}</div>
                    <div className="text-[10.5px] text-fg-mute font-mono">{e.provider}</div>
                  </td>
                  <td className="px-2.5 py-1.5 align-top">
                    {e.apiKeyEnv.map((k) => (
                      <div key={k.name} className="font-mono text-[10.5px] flex items-center gap-1">
                        {k.set ? <Dot variant="success" /> : <Dot variant="muted" />}
                        <span className="truncate">{k.name}</span>
                        {k.set && <span className="text-fg-mute">({k.length} chars)</span>}
                      </div>
                    ))}
                  </td>
                  <td className="px-2.5 py-1.5 align-top">
                    {e.baseUrlEnv ? (
                      <div className="font-mono text-[10.5px] flex items-center gap-1">
                        {e.baseUrlEnv.set ? <Dot variant="success" /> : <Dot variant="muted" />}
                        <span>{e.baseUrlEnv.name}</span>
                        {e.baseUrlEnv.set && <span className="text-fg-mute truncate max-w-[180px]">→ {e.baseUrlEnv.value}</span>}
                      </div>
                    ) : (
                      <span className="text-fg-mute">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
