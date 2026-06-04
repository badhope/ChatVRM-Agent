import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Trash2, Brain, Tag, X, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import { api } from '@/api/client';
import { formatTime, formatDateTime, providerColor, providerInitial, cn } from '@/utils';
import { toast } from '@/components/Toast';
import type { MemoryEntry } from '@/types';

export function Memory() {
  const { t } = useTranslation();
  const [items, setItems] = useState<MemoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<MemoryEntry | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<{ items: MemoryEntry[]; count: number; total: number }>(
        `/memory?q=${encodeURIComponent(query)}${activeTag ? `&tag=${activeTag}` : ''}`,
      );
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      toast({ type: 'error', title: t('memory.loadFailed'), message: String(err) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const id = setTimeout(load, 200);
    return () => clearTimeout(id);
  }, [query, activeTag]);

  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of items) for (const tag of m.tags) map.set(tag, (map.get(tag) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [items]);

  async function handleDelete(id: string) {
    try {
      await api.delete(`/memory/${id}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (selected?.id === id) setSelected(null);
      toast({ type: 'success', title: t('memory.deleted') });
    } catch (err) {
      toast({ type: 'error', title: t('memory.deleteFailed'), message: String(err) });
    }
  }

  async function handleClear() {
    try {
      await api.post('/memory/clear');
      setItems([]);
      setTotal(0);
      setShowClearConfirm(false);
      toast({ type: 'success', title: t('memory.clearedAll') });
    } catch (err) {
      toast({ type: 'error', title: t('memory.clearFailed'), message: String(err) });
    }
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Brain size={18} /> {t('memory.title')}
          </h1>
          <p className="text-sm text-fg-mute mt-1">{t('memory.realPersist')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="brand">{t('memory.total', { count: total, n: total })}</Badge>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Trash2 size={13} />}
            onClick={() => setShowClearConfirm(true)}
            disabled={items.length === 0}
          >
            {t('memory.clearAll')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="space-y-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-mute" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('memory.searchPlaceholder')}
              className="pl-8"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-mute hover:text-fg"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <Card>
            <CardHeader>
              <div className="text-xs font-medium text-fg-soft">{t('memory.hotTags')}</div>
            </CardHeader>
            <CardBody className="space-y-1">
              {tagCounts.length === 0 && <div className="text-xs text-fg-mute">{t('memory.noTags')}</div>}
              {tagCounts.map(([tag, count]) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  className={cn(
                    'w-full flex items-center justify-between text-xs px-2 py-1.5 rounded transition-colors',
                    activeTag === tag ? 'bg-brand/12 text-brand' : 'hover:bg-bg-soft text-fg-soft',
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <Tag size={11} /> #{tag}
                  </span>
                  <span className="font-mono text-fg-mute">{count}</span>
                </button>
              ))}
            </CardBody>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <div className="text-sm font-semibold">
                {t('memory.list')}
                {query && <span className="text-fg-mute">· "{query}"</span>}
                {activeTag && <span className="text-fg-mute"> · #{activeTag}</span>}
              </div>
              <span className="text-xs text-fg-mute">{t('memory.total', { count: items.length, n: items.length })}</span>
            </CardHeader>
            <CardBody className="p-0">
              {loading ? (
                <div className="p-8 text-center text-fg-mute text-sm">{t('common.loading')}</div>
              ) : items.length === 0 ? (
                <div className="p-8 text-center text-fg-mute text-sm">
                  {query || activeTag ? t('memory.noMatch') : t('memory.noMemories')}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {items.map((m) => (
                    <MemoryItem key={m.id} item={m} onSelect={setSelected} onDelete={handleDelete} query={query} />
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={t('memory.details')}
        size="lg"
      >
        {selected && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-fg-mute text-[10.5px] mb-0.5">{t('memory.id')}</div>
                <div className="font-mono">{selected.id}</div>
              </div>
              <div>
                <div className="text-fg-mute text-[10.5px] mb-0.5">{t('memory.time')}</div>
                <div>{formatDateTime(selected.createdAt)}</div>
              </div>
              <div>
                <div className="text-fg-mute text-[10.5px] mb-0.5">{t('chat.selectProvider')}</div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: providerColor(selected.provider) }}
                  />
                  {selected.provider}
                </div>
              </div>
              <div>
                <div className="text-fg-mute text-[10.5px] mb-0.5">{t('chat.model')}</div>
                <div className="font-mono">{selected.model}</div>
              </div>
            </div>
            <div>
              <div className="text-fg-mute text-[10.5px] mb-1.5">{t('common.tags')}</div>
              <div className="flex flex-wrap gap-1">
                {selected.tags.map((tag) => (
                  <Badge key={tag} size="sm">#{tag}</Badge>
                ))}
              </div>
            </div>
            <div>
              <div className="text-fg-mute text-[10.5px] mb-1.5">{t('memory.input')}</div>
              <pre className="bg-bg-soft border border-border rounded-md p-3 text-xs whitespace-pre-wrap break-words">
                {selected.input}
              </pre>
            </div>
            <div>
              <div className="text-fg-mute text-[10.5px] mb-1.5">{t('memory.output')}</div>
              <pre className="bg-bg-soft border border-border rounded-md p-3 text-xs whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
                {selected.output}
              </pre>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="danger"
                size="sm"
                leftIcon={<Trash2 size={13} />}
                onClick={() => {
                  handleDelete(selected.id);
                  setSelected(null);
                }}
              >
                {t('memory.deleteBtn')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        title={t('memory.clearAllTitle')}
        size="sm"
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-sm text-danger">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div>{t('memory.clearAllHint', { n: total })}</div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowClearConfirm(false)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={handleClear}>{t('memory.clearAll')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function MemoryItem({
  item,
  query,
  onSelect,
  onDelete,
}: {
  item: MemoryEntry;
  query: string;
  onSelect: (m: MemoryEntry) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="px-5 py-3 hover:bg-bg-soft/40 group transition-colors">
      <div className="flex items-start gap-3">
        <div
          className="h-7 w-7 rounded-md flex items-center justify-center text-white text-[10.5px] font-semibold shrink-0"
          style={{ backgroundColor: providerColor(item.provider) }}
        >
          {providerInitial(item.provider)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-mono">{item.provider}</span>
            {item.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} size="sm">#{tag}</Badge>
            ))}
            <span className="text-[10.5px] text-fg-mute ml-auto shrink-0">{formatTime(item.createdAt)}</span>
          </div>
          <div className="text-xs text-fg-soft mt-1 line-clamp-2">
            <Highlight text={item.input} query={query} />
          </div>
          {expanded && (
            <pre className="mt-2 text-xs text-fg-soft bg-bg-soft rounded-md p-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
              {item.output}
            </pre>
          )}
          <div className="flex items-center gap-2 mt-1.5 text-[10.5px] text-fg-mute">
            <button
              onClick={() => setExpanded(!expanded)}
              className="hover:text-fg-soft flex items-center gap-0.5"
            >
              {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              {expanded ? t('common.collapse') : t('memory.expand')}
            </button>
            <span>·</span>
            <button onClick={() => onSelect(item)} className="hover:text-fg-soft">{t('memory.detailsBtn')}</button>
            <span>·</span>
            <button
              onClick={() => {
                if (confirm(t('memory.deleteOneConfirm'))) onDelete(item.id);
              }}
              className="hover:text-danger"
            >
              {t('memory.deleteBtn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query || query.length === 0) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-warning/30 text-warning rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
