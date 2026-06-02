import { useEffect, useState } from 'react';
import {
  Key,
  Check,
  X,
  Loader2,
  Star,
  Globe,
  AlertCircle,
  Search,
  Settings2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input, Textarea } from '@/components/Input';
import { Badge, Dot } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import { api } from '@/api/client';
import { cn, providerColor, providerInitial, copyToClipboard } from '@/utils';
import { toast } from '@/components/Toast';
import type { ProviderType, ProviderMeta } from '@/types';
import { useConfigStore } from '@/stores/config';

interface ServerProviderMeta extends ProviderMeta {
  hasKey: boolean;
}

export function Config() {
  const refresh = useConfigStore((s) => s.refresh);
  const [providers, setProviders] = useState<ServerProviderMeta[]>([]);
  const [snapshot, setSnapshot] = useState<any>(null);
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
        api.get<{ defaultProvider: ProviderType; chat: { model?: string; temperature?: number; maxTokens?: number } }>(
          '/config/snapshot',
        ),
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
      toast({ type: 'error', title: '加载配置失败', message: String(err) });
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
    setSaving(true);
    try {
      if (keyInput.length > 0) {
        await api.post('/config/set-key', { provider: editingProvider, key: keyInput });
      }
      toast({ type: 'success', title: '已保存 API key' });
      setEditingProvider(null);
      setKeyInput('');
      await load();
      refresh();
    } catch (err) {
      toast({ type: 'error', title: '保存失败', message: String(err) });
    } finally {
      setSaving(false);
    }
  }

  async function removeKey(p: ProviderType) {
    if (!confirm(`确认删除 ${p} 的 API key？`)) return;
    try {
      await api.post('/config/remove-key', { provider: p });
      toast({ type: 'success', title: '已删除' });
      await load();
      refresh();
    } catch (err) {
      toast({ type: 'error', title: '删除失败', message: String(err) });
    }
  }

  async function setDefault(p: ProviderType) {
    try {
      await api.post('/config/set-default', { provider: p });
      setDefaultProvider(p);
      toast({ type: 'success', title: `默认 provider: ${p}` });
      refresh();
    } catch (err) {
      toast({ type: 'error', title: '设置失败', message: String(err) });
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
        toast({ type: 'success', title: `${p} 连接成功`, message: `响应: "${res.content}"` });
      } else {
        toast({ type: 'error', title: `${p} 连接失败`, message: res.error });
      }
    } catch (err) {
      toast({ type: 'error', title: '测试失败', message: String(err) });
    } finally {
      setTesting(null);
    }
  }

  async function saveChatConfig() {
    setSavingChat(true);
    try {
      await api.post('/config/set-chat-config', chatCfg);
      toast({ type: 'success', title: '聊天参数已保存' });
      refresh();
    } catch (err) {
      toast({ type: 'error', title: '保存失败', message: String(err) });
    } finally {
      setSavingChat(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-fg-mute">加载配置...</div>;
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">配置管理</h1>
          <p className="text-sm text-fg-mute mt-1">10 个 LLM Provider · API key 存 conf 0600 权限</p>
        </div>
        <Badge variant="brand">默认: {defaultProvider ?? '未设置'}</Badge>
      </div>

      <Card>
        <CardHeader>
          <div className="text-sm font-semibold flex items-center gap-2">
            <Settings2 size={14} /> 聊天参数
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-fg-soft mb-1.5">Model</label>
              <Input
                value={chatCfg.model}
                onChange={(e) => setChatCfg((p) => ({ ...p, model: e.target.value }))}
                placeholder="Qwen/Qwen2.5-7B-Instruct"
                className="font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-fg-soft mb-1.5">
                Temperature: <span className="font-mono">{chatCfg.temperature.toFixed(2)}</span>
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
              <label className="block text-xs font-medium text-fg-soft mb-1.5">Max Tokens</label>
              <Input
                type="number"
                value={chatCfg.maxTokens}
                onChange={(e) => setChatCfg((p) => ({ ...p, maxTokens: parseInt(e.target.value) || 2048 }))}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={saveChatConfig} disabled={savingChat} loading={savingChat}>
              保存
            </Button>
          </div>
        </CardBody>
      </Card>

      <div>
        <h2 className="text-sm font-semibold mb-2">LLM Providers ({providers.length})</h2>
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
                        {isDefault && <Badge variant="brand" size="sm">默认</Badge>}
                        {p.requiresKey ? (
                          p.hasKey ? (
                            <Badge variant="success" size="sm">
                              <Check size={10} /> 已配置
                            </Badge>
                          ) : (
                            <Badge variant="warning" size="sm">未配置 key</Badge>
                          )
                        ) : (
                          <Badge variant="info" size="sm">本地</Badge>
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
                        设为默认
                      </Button>
                    )}
                    {p.requiresKey && (
                      <Button variant="secondary" size="sm" onClick={() => startEdit(p)} leftIcon={<Key size={11} />}>
                        {p.hasKey ? '更换' : '配置'} key
                      </Button>
                    )}
                    {p.hasKey && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => testConnection(p.id)}
                        loading={testing === p.id}
                      >
                        测试
                      </Button>
                    )}
                    {p.hasKey && (
                      <Button variant="ghost" size="sm" onClick={() => removeKey(p.id)} className="text-danger hover:text-danger">
                        删除
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
        title={`配置 ${editingProvider ?? ''}`}
        size="md"
      >
        {editingProvider && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-fg-soft mb-1.5">API Key</label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="sk-...  完整粘贴"
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
                存储位置: ~/.config/personal-assistant-nodejs/config.json (0600)
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-fg-soft mb-1.5">Base URL（可选，自建代理）</label>
              <Input
                value={baseUrlInput}
                onChange={(e) => setBaseUrlInput(e.target.value)}
                placeholder={providers.find((p) => p.id === editingProvider)?.baseUrl ?? ''}
                className="font-mono text-xs"
              />
            </div>
            <div className="bg-info/10 border border-info/20 text-info rounded-md p-2.5 text-xs">
              <div className="font-medium mb-0.5">环境变量优先级</div>
              <div className="text-[10.5px] font-mono">
                1. conf 存储 (本页设置)<br />
                2. PERSONAL_ASSISTANT_{editingProvider.toUpperCase()}<br />
                3. {editingProvider.toUpperCase()}_API_KEY
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditingProvider(null)}>取消</Button>
              <Button variant="primary" onClick={saveKey} loading={saving} disabled={keyInput.length === 0}>
                保存
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
