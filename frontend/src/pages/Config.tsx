import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Key,
  Check,
  Loader2,
  Star,
  Globe,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import { api } from '@/api/client';
import { cn, providerColor, providerInitial } from '@/utils';
import { toast } from '@/components/Toast';
import type { ProviderType, ProviderMeta } from '@/types';
import { useConfigStore } from '@/stores/config';

interface ServerProviderMeta extends ProviderMeta {
  hasKey: boolean;
}

interface ConfigSnapshot {
  defaultProvider: ProviderType;
  chat: { model?: string; temperature?: number; maxTokens?: number };
}

export function Config() {
  const { t } = useTranslation();
  const refresh = useConfigStore((s) => s.refresh);
  const [providers, setProviders] = useState<ServerProviderMeta[]>([]);
  const [snapshot, setSnapshot] = useState<ConfigSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingProvider, setEditingProvider] = useState<ProviderType | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<ProviderType | null>(null);
  const [defaultProvider, setDefaultProvider] = useState<ProviderType | null>(null);
  const [chatCfg, setChatCfg] = useState({ model: '', temperature: 0.7, maxTokens: 2048 });
  const [savingChat, setSavingChat] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [plist, snap] = await Promise.all([
        api.get<ServerProviderMeta[]>('/config/providers'),
        api.get<ConfigSnapshot>('/config/snapshot'),
      ]);
      setProviders(plist);
      setSnapshot(snap);
      setDefaultProvider(snap.defaultProvider);
      setChatCfg({
        model: snap.chat.model ?? '',
        temperature: snap.chat.temperature ?? 0.7,
        maxTokens: snap.chat.maxTokens ?? 2048,
      });
    } catch (err) {
      toast({ type: 'error', title: t('config.loadFailed'), message: String(err) });
    } finally {
      setLoading(false);
    }
  }

  function startEdit(p: ServerProviderMeta) {
    setEditingProvider(p.id);
    setKeyInput('');
    setBaseUrlInput('');
    setShowKey(false);
  }

  async function saveKey() {
    if (!editingProvider) return;
    if (keyInput.length === 0 && baseUrlInput.length === 0) return;
    setSaving(true);
    try {
      if (keyInput.length > 0) {
        await api.post('/config/set-key', { provider: editingProvider, key: keyInput });
      }
      if (baseUrlInput.length > 0) {
        await api.post('/config/set-base-url', { provider: editingProvider, baseUrl: baseUrlInput });
      }
      toast({ type: 'success', title: t('config.keySaved') });
      setEditingProvider(null);
      setKeyInput('');
      setBaseUrlInput('');
      await load();
      refresh();
    } catch (err) {
      toast({ type: 'error', title: t('config.saveFailed'), message: String(err) });
    } finally {
      setSaving(false);
    }
  }

  async function removeKey(p: ProviderType) {
    if (!confirm(t('config.removeConfirm', { provider: p }))) return;
    try {
      await api.post('/config/remove-key', { provider: p });
      toast({ type: 'success', title: t('config.keyRemoved') });
      await load();
      refresh();
    } catch (err) {
      toast({ type: 'error', title: t('config.saveFailed'), message: String(err) });
    }
  }

  async function setDefault(p: ProviderType) {
    try {
      await api.post('/config/set-default', { provider: p });
      setDefaultProvider(p);
      toast({ type: 'success', title: t('config.defaultSet', { provider: p }) });
      refresh();
    } catch (err) {
      toast({ type: 'error', title: t('config.saveFailed'), message: String(err) });
    }
  }

  async function testConnection(p: ProviderType) {
    setTesting(p);
    try {
      const res = await api.post<{ ok: boolean; content?: string; model?: string; error?: string }>(
        '/config/test-message',
        { provider: p, model: snapshot?.chat?.model, message: 'Reply with one word: pong' },
      );
      if (res.ok) {
        toast({ type: 'success', title: t('config.testOk', { provider: p }), message: t('config.testFailedHint', { content: res.content ?? '' }) });
      } else {
        toast({ type: 'error', title: t('config.testFailed', { provider: p }), message: res.error });
      }
    } catch (err) {
      toast({ type: 'error', title: t('config.testFailed', { provider: p }), message: String(err) });
    } finally {
      setTesting(null);
    }
  }

  async function saveChatConfig() {
    setSavingChat(true);
    try {
      await api.post('/config/set-chat-config', chatCfg);
      toast({ type: 'success', title: t('config.chatSaved') });
      refresh();
    } catch (err) {
      toast({ type: 'error', title: t('config.saveFailed'), message: String(err) });
    } finally {
      setSavingChat(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-fg-mute">{t('common.loading')}</div>;
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">{t('config.configTitle')}</h1>
          <p className="text-sm text-fg-mute mt-1">{t('config.configSub')}</p>
        </div>
        <Badge variant="brand">{defaultProvider ? t('config.defaultLabel', { provider: defaultProvider }) : t('config.defaultNotSet')}</Badge>
      </div>

      <Card>
        <CardHeader>
          <div className="text-sm font-semibold flex items-center gap-2">
            {t('config.chatParams')}
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-fg-soft mb-1.5">{t('chat.model')}</label>
              <Input
                value={chatCfg.model}
                onChange={(e) => setChatCfg((p) => ({ ...p, model: e.target.value }))}
                placeholder="Qwen/Qwen2.5-7B-Instruct"
                className="font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-fg-soft mb-1.5">
                {t('config.temperature')}: <span className="font-mono">{chatCfg.temperature.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={chatCfg.temperature}
                onChange={(e) => setChatCfg((p) => ({ ...p, temperature: parseFloat(e.target.value) }))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-fg-soft mb-1.5">{t('config.maxTokens')}</label>
              <Input
                type="number"
                value={chatCfg.maxTokens}
                onChange={(e) => setChatCfg((p) => ({ ...p, maxTokens: parseInt(e.target.value) || 2048 }))}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={saveChatConfig} disabled={savingChat} loading={savingChat}>
              {t('common.save')}
            </Button>
          </div>
        </CardBody>
      </Card>

      <div>
        <h2 className="text-sm font-semibold mb-2">{t('config.providersCount', { n: providers.length })}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {providers.map((p) => {
            const isDefault = defaultProvider === p.id;
            return (
              <Card key={p.id} className={cn(isDefault && 'border-brand/40 shadow-glow')}>
                <CardBody>
                  <div className="flex items-start gap-3">
                    <div
                      className="h-10 w-10 rounded-md flex items-center justify-center text-white text-sm font-semibold shrink-0"
                      style={{ backgroundColor: providerColor(p.id) }}
                    >
                      {providerInitial(p.id)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold">{p.name}</span>
                        <span className="text-[10.5px] text-fg-mute font-mono">{p.id}</span>
                        {isDefault && <Badge variant="brand" size="sm">{t('config.defaultBadge')}</Badge>}
                        {p.requiresKey ? (
                          p.hasKey ? (
                            <Badge variant="success" size="sm">
                              <Check size={10} /> {t('config.configured')}
                            </Badge>
                          ) : (
                            <Badge variant="warning" size="sm">{t('config.keyMissing')}</Badge>
                          )
                        ) : (
                          <Badge variant="info" size="sm">{t('config.local')}</Badge>
                        )}
                      </div>
                      <div className="text-xs text-fg-soft mt-1">{p.description}</div>
                      <div className="text-[10.5px] text-fg-mute mt-1 font-mono flex items-center gap-1">
                        <Globe size={10} /> {p.baseUrl}
                      </div>
                      <div className="text-[10.5px] text-fg-mute font-mono mt-0.5">
                        model: {p.defaultModel}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {!isDefault && (
                      <Button variant="outline" size="sm" onClick={() => setDefault(p.id)} leftIcon={<Star size={11} />}>
                        {t('config.setDefault')}
                      </Button>
                    )}
                    {p.requiresKey && (
                      <Button variant="secondary" size="sm" onClick={() => startEdit(p)} leftIcon={<Key size={11} />}>
                        {p.hasKey ? t('config.replace') : t('common.configure')} key
                      </Button>
                    )}
                    {p.hasKey && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => testConnection(p.id)}
                        loading={testing === p.id}
                      >
                        {t('config.testBtn')}
                      </Button>
                    )}
                    {p.hasKey && (
                      <Button variant="ghost" size="sm" onClick={() => removeKey(p.id)} className="text-danger hover:text-danger">
                        {t('common.delete')}
                      </Button>
                    )}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      </div>

      <Modal
        open={editingProvider !== null}
        onClose={() => setEditingProvider(null)}
        title={editingProvider ? t('config.configure', { provider: editingProvider }) : ''}
        size="md"
      >
        {editingProvider && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-fg-soft mb-1.5">{t('config.apiKey')}</label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="sk-...  (paste fully)"
                  className="font-mono pr-9"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-mute hover:text-fg"
                  type="button"
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className="text-[10.5px] text-fg-mute mt-1">
                {t('config.keyHint')}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-fg-soft mb-1.5">{t('config.baseUrl')}</label>
              <Input
                value={baseUrlInput}
                onChange={(e) => setBaseUrlInput(e.target.value)}
                placeholder={providers.find((p) => p.id === editingProvider)?.baseUrl ?? ''}
                className="font-mono text-xs"
              />
            </div>
            <div className="bg-info/10 border border-info/20 text-info rounded-md p-2.5 text-xs">
              <div className="font-medium mb-0.5">{t('config.envPriority')}</div>
              <div className="text-[10.5px] font-mono whitespace-pre-line">
                {t('config.envPriorityList', { PROVIDER: editingProvider.toUpperCase() })}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditingProvider(null)}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={saveKey} loading={saving} disabled={keyInput.length === 0 && baseUrlInput.length === 0}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
