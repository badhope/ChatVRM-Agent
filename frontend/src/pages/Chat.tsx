import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Send,
  Plus,
  MessageSquare,
  Trash2,
  Edit2,
  Check,
  X,
  Square,
  Settings2,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Input, Textarea } from '@/components/Input';
import { Badge } from '@/components/Badge';
import { Spinner } from '@/components/Spinner';
import { Markdown } from '@/components/Markdown';
import { api, sseStream } from '@/api/client';
import { useConfigStore } from '@/stores/config';
import { cn, formatTime, truncate, providerColor } from '@/utils';
import { toast } from '@/components/Toast';
import type { ChatMessage, ChatSession, ProviderType } from '@/types';

export function Chat() {
  const { t } = useTranslation();
  const { sessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  const defaultProvider = useConfigStore((s) => s.defaultProvider);
  const defaultModel = useConfigStore((s) => s.defaultModel);
  const refreshConfig = useConfigStore((s) => s.refresh);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [provider, setProvider] = useState<ProviderType | ''>('');
  const [model, setModel] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Session id we just minted from an SSE `session` event. The sessionId
  // effect uses this to skip the server round-trip (which would clobber the
  // in-flight streamed messages with `[]`).
  const locallyCreatedRef = useRef<string | null>(null);

  useEffect(() => {
    refreshConfig();
  }, [refreshConfig]);

  useEffect(() => {
    api.get<ChatSession[]>('/chat/sessions').then(setSessions).catch(() => {});
  }, [activeSession?.id]);

  useEffect(() => {
    if (sessionId) {
      // If we just created this session via the SSE `session` event we already
      // have an accurate local view; skip the round-trip and the race against
      // our own in-flight stream that would otherwise reset messages to [].
      if (locallyCreatedRef.current === sessionId) {
        locallyCreatedRef.current = null;
        return;
      }
      api
        .get<ChatSession>(`/chat/sessions/${sessionId}`)
        .then((s) => {
          setActiveSession(s);
          setMessages(s.messages ?? []);
          if (s.provider) setProvider(s.provider);
          if (s.model) setModel(s.model);
        })
        .catch(() => navigate('/chat'));
    } else {
      setActiveSession(null);
      setMessages([]);
    }
  }, [sessionId, navigate]);

  useEffect(() => {
    if (!provider && defaultProvider) setProvider(defaultProvider);
  }, [defaultProvider, provider]);

  useEffect(() => {
    if (!model && defaultModel) setModel(defaultModel);
  }, [defaultModel, model]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, streaming]);

  async function handleSend() {
    if (!input.trim() || streaming) return;
    const sendProvider = (provider || defaultProvider) as ProviderType | undefined;
    if (!sendProvider) {
      toast({ type: 'warning', title: t('chat.configureFirst') });
      return;
    }
    const userContent = input.trim();
    setInput('');

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userContent,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    const assistantId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      provider: sendProvider,
      model,
      streaming: true,
    };
    setMessages((prev) => [...prev, assistantMsg]);

    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let accumulated = '';
      for await (const ev of sseStream(
        '/chat/stream',
        {
          sessionId: activeSession?.id,
          message: userContent,
          provider: sendProvider,
          model,
        },
        controller.signal,
      )) {
        if (ev.event === 'session') {
          const data = JSON.parse(ev.data) as { id: string; title: string };
          if (!activeSession) {
            const newSession: ChatSession = {
              id: data.id,
              title: data.title,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              messageCount: 0,
              provider: sendProvider,
              model,
            };
            setActiveSession(newSession);
            // Mark this session so the sessionId effect doesn't refetch
            // (which would clobber the in-flight streamed messages).
            locallyCreatedRef.current = data.id;
            navigate(`/chat/${data.id}`, { replace: true });
          }
        } else if (ev.event === 'chunk') {
          const d = JSON.parse(ev.data) as { content: string; done: boolean };
          accumulated += d.content;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: accumulated } : m)),
          );
        } else if (ev.event === 'error') {
          const d = JSON.parse(ev.data) as { message: string };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: accumulated, error: d.message, streaming: false } : m,
            ),
          );
          toast({ type: 'error', title: t('chat.llmFailed'), message: d.message });
        } else if (ev.event === 'assistant-end') {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)),
          );
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast({ type: 'error', title: t('chat.requestError'), message: String(err) });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  async function handleNewSession() {
    navigate('/chat');
    setActiveSession(null);
    setMessages([]);
  }

  async function handleDeleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await api.delete(`/chat/sessions/${id}`);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSession?.id === id) handleNewSession();
  }

  function startEditTitle(s: ChatSession, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingId(s.id);
    setEditTitle(s.title);
  }

  async function saveEditTitle(id: string) {
    try {
      await api.patch(`/chat/sessions/${id}`, { title: editTitle });
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title: editTitle } : s)));
      if (activeSession?.id === id) setActiveSession({ ...activeSession, title: editTitle });
      setEditingId(null);
    } catch (err) {
      toast({ type: 'error', title: t('chat.renameFailed'), message: String(err) });
    }
  }

  return (
    <div className="h-full flex">
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border bg-bg-soft/30 flex-col">
        <div className="p-3 border-b border-border">
          <Button variant="primary" className="w-full" onClick={handleNewSession} leftIcon={<Plus size={14} />}>
            {t('chat.newSession')}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {sessions.length === 0 && (
            <div className="text-xs text-fg-mute text-center py-8 px-2">{t('chat.noSessions')}</div>
          )}
          {sessions.map((s) => {
            const isActive = activeSession?.id === s.id;
            return (
              <div
                key={s.id}
                onClick={() => navigate(`/chat/${s.id}`)}
                className={cn(
                  'group flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer text-sm transition-colors',
                  isActive ? 'bg-brand/12 text-brand' : 'hover:bg-bg-soft text-fg-soft hover:text-fg',
                )}
              >
                <MessageSquare size={13} className="shrink-0" />
                {editingId === s.id ? (
                  <div className="flex-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="h-6 text-xs px-1.5"
                      autoFocus
                    />
                    <button
                      onClick={() => saveEditTitle(s.id)}
                      className="text-fg-soft hover:text-fg p-0.5"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-fg-mute hover:text-fg p-0.5"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 truncate">{s.title}</span>
                    <span className="text-[10px] text-fg-mute opacity-0 group-hover:opacity-100 flex items-center gap-1">
                      <span onClick={(e) => startEditTitle(s, e)} className="hover:text-fg">
                        <Edit2 size={11} />
                      </span>
                      <span onClick={(e) => handleDeleteSession(s.id, e)} className="hover:text-danger">
                        <Trash2 size={11} />
                      </span>
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="h-12 px-3 lg:px-5 border-b border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {activeSession ? (
              <>
                <span className="text-sm font-medium truncate">{activeSession.title}</span>
                {activeSession.provider && (
                  <Badge variant="brand" size="sm">
                    {activeSession.provider}
                  </Badge>
                )}
              </>
            ) : (
              <span className="text-sm text-fg-mute">{t('chat.newChat')}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Settings2 size={13} />}
              onClick={() => setShowSettings(!showSettings)}
            >
              <span className="hidden sm:inline">{t('chat.model')}</span>
            </Button>
            <Button variant="ghost" size="sm" leftIcon={<Plus size={13} />} onClick={handleNewSession}>
              <span className="hidden sm:inline">{t('chat.newChat')}</span>
            </Button>
          </div>
        </div>

        {showSettings && (
          <div className="px-5 py-3 border-b border-border bg-bg-soft/40 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
            <div>
              <label className="block text-xs font-medium text-fg-soft mb-1.5">{t('chat.selectProvider')}</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as ProviderType | '')}
                className="w-full h-9 px-2 rounded-md text-sm bg-bg border border-border focus:outline-none focus:border-brand/60"
              >
                <option value="" disabled>
                  {defaultProvider ? t('chat.default', { provider: defaultProvider }) : t('chat.selectProvider')}
                </option>
                {(['openai', 'anthropic', 'google', 'deepseek', 'siliconflow', 'aliyun', 'zhipu', 'baidu', 'ollama', 'lmstudio'] as ProviderType[]).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-fg-soft mb-1.5">{t('chat.model')}</label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={defaultModel || 'Qwen/Qwen2.5-7B-Instruct'}
                className="font-mono text-xs"
              />
            </div>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 && !streaming && (
            <EmptyChat onPrompt={(p) => setInput(p)} provider={provider || defaultProvider} />
          )}
          <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6 space-y-5">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {streaming && messages[messages.length - 1]?.content === '' && (
              <div className="flex gap-3">
                <div
                  className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-semibold shrink-0"
                >
                  AI
                </div>
                <div className="flex-1 pt-1.5">
                  <Spinner size="sm" />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border bg-bg/85 backdrop-blur p-3 lg:p-4">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={provider ? t('chat.sendTo', { provider }) : t('chat.selectProviderFirst')}
                rows={2}
                className="pr-12"
                disabled={streaming}
              />
              {streaming ? (
                <Button
                  variant="danger"
                  size="lg"
                  onClick={handleStop}
                  className="absolute right-1.5 bottom-1.5"
                >
                  <Square size={14} fill="currentColor" />
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleSend}
                  disabled={!input.trim() || !provider}
                  className="absolute right-1.5 bottom-1.5"
                >
                  <Send size={14} />
                </Button>
              )}
            </div>
            <div className="flex items-center justify-between text-[10.5px] text-fg-mute mt-1.5 px-1">
              <span>{t('chat.enterToSend')}</span>
              <span className="font-mono">
                {provider || defaultProvider || '—'} · {truncate(model, 30)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0',
          isUser ? 'bg-zinc-700' : 'bg-gradient-to-br from-indigo-500 to-violet-600',
        )}
      >
        {isUser ? t('chat.you').charAt(0) : 'AI'}
      </div>
      <div className={cn('flex-1 min-w-0 max-w-[85%]', isUser && 'flex flex-col items-end')}>
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs font-medium text-fg-soft">
            {isUser ? t('chat.you') : t('chat.assistant')}
          </span>
          {message.provider && (
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: providerColor(message.provider) }}
            />
          )}
          <span className="text-[10.5px] text-fg-mute">{formatTime(message.createdAt)}</span>
          {message.streaming && <Spinner size="sm" className="ml-1" />}
        </div>
        {message.error ? (
          <div className="bg-danger/10 border border-danger/20 text-danger rounded-lg px-3 py-2 text-sm flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">{t('chat.callFailed')}</div>
              <div className="text-xs mt-0.5">{message.error}</div>
            </div>
          </div>
        ) : isUser ? (
          <div className="bg-brand/10 text-fg rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm whitespace-pre-wrap break-words">
            {message.content}
          </div>
        ) : (
          <div className="text-fg text-sm leading-relaxed">
            {message.content ? (
              <Markdown content={message.content} />
            ) : (
              <span className="inline-block h-3 w-1.5 bg-brand animate-caret-blink align-middle" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyChat({
  onPrompt,
  provider,
}: {
  onPrompt: (p: string) => void;
  provider: ProviderType | null | '';
}) {
  const { t } = useTranslation();
  const presetKeys = ['intro', 'quicksort', 'transformer', 'regex'] as const;
  return (
    <div className="h-full flex items-center justify-center px-4 py-12">
      <div className="text-center max-w-md">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-4 shadow-elev">
          <Sparkles size={20} className="text-white" />
        </div>
        <h2 className="text-lg font-semibold">{t('chat.emptyTitle')}</h2>
        <p className="text-sm text-fg-soft mt-1.5">
          {t('chat.emptySub', { provider: provider || t('chat.defaultProvider') })}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-6 text-left">
          {presetKeys.map((k) => (
            <button
              key={k}
              onClick={() => onPrompt(t(`chat.presets.${k}`))}
              className="text-xs px-3 py-2.5 rounded-md border border-border hover:border-border-strong hover:bg-bg-soft transition-colors text-left"
            >
              {t(`chat.presets.${k}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
