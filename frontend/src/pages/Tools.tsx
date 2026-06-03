import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Wrench,
  FileText,
  FileSearch,
  Terminal,
  Search,
  Bookmark,
  ScanSearch,
  MessageSquare,
  Send,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input, Textarea } from '@/components/Input';
import { Badge } from '@/components/Badge';
import { api } from '@/api/client';
import { cn, formatTime, copyToClipboard } from '@/utils';
import { toast } from '@/components/Toast';
import type { ToolMeta } from '@/types';

const ICON_MAP: Record<string, any> = {
  writeFile: FileText,
  readFile: FileSearch,
  shell: Terminal,
  search: Search,
  remember: Bookmark,
  analyze: ScanSearch,
  respond: MessageSquare,
};

interface FieldState {
  [k: string]: string;
}

export function Tools() {
  const { t } = useTranslation();
  const [tools, setTools] = useState<ToolMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [args, setArgs] = useState<FieldState>({});
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<Array<{ tool: string; args: any; result: any; ts: string }>>([]);

  useEffect(() => {
    api
      .get<ToolMeta[]>('/tools')
      .then((t) => {
        setTools(t);
        if (t.length > 0) setSelected(t[0].name);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    setArgs({});
    setResult(null);
  }, [selected]);

  async function handleExecute() {
    if (!selected || executing) return;
    const tool = tools.find((t) => t.name === selected);
    if (!tool) return;

    const payload: Record<string, unknown> = {};
    for (const f of tool.schema) {
      const v = args[f.name];
      if (f.required && (!v || v.length === 0)) {
        toast({ type: 'warning', title: t('tools.missingRequired'), message: t('tools.requiredField', { name: f.name }) });
        return;
      }
      if (v && v.length > 0) {
        if (f.type === 'number') {
          const n = Number(v);
          payload[f.name] = Number.isNaN(n) ? 0 : n;
        } else if (f.type === 'string[]') {
          payload[f.name] = v.split(',').map((s) => s.trim()).filter(Boolean);
        } else {
          payload[f.name] = v;
        }
      }
    }

    setExecuting(true);
    setResult(null);
    try {
      const res = await api.post('/tools/execute', { tool: selected, args: payload });
      setResult(res);
      setHistory((prev) => [{ tool: selected, args: payload, result: res, ts: new Date().toISOString() }, ...prev].slice(0, 20));
    } catch (err) {
      setResult({ success: false, error: String(err) });
      toast({ type: 'error', title: t('tools.executeFailed'), message: String(err) });
    } finally {
      setExecuting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-fg-mute">{t('tools.loadingList')}</div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">{t('tools.browserTitle')}</h1>
        <p className="text-sm text-fg-mute mt-1">{t('tools.browserSub')}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
        {tools.map((tool) => {
          const Icon = ICON_MAP[tool.name] ?? Wrench;
          const isActive = selected === tool.name;
          return (
            <button
              key={tool.name}
              onClick={() => setSelected(tool.name)}
              className={cn(
                'p-3 rounded-lg border text-left transition-all',
                isActive
                  ? 'border-brand/60 bg-brand/8 shadow-soft'
                  : 'border-border bg-bg-elev hover:border-border-strong hover:bg-bg-soft',
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'h-8 w-8 rounded-md flex items-center justify-center shrink-0',
                    isActive ? 'bg-brand/15 text-brand' : 'bg-bg-soft text-fg-soft',
                  )}
                >
                  <Icon size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono font-medium truncate">{tool.name}</div>
                  <div className="text-[10.5px] text-fg-mute">{t('tools.argsCount', { n: tool.schema.length })}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="text-sm font-semibold flex items-center gap-2">
              {(() => {
                const tool = tools.find((x) => x.name === selected);
                if (!tool) return null;
                const Icon = ICON_MAP[tool.name] ?? Wrench;
                return <Icon size={14} />;
              })()}
              {selected ?? '—'}
            </div>
            <span className="text-[10.5px] text-fg-mute font-mono">
              {t('tools.argsCount', { n: tools.find((tool) => tool.name === selected)?.schema.length ?? 0 })}
            </span>
          </CardHeader>
          <CardBody className="space-y-3">
            {tools.find((tool) => tool.name === selected)?.description && (
              <p className="text-xs text-fg-soft">
                {tools.find((tool) => tool.name === selected)?.description}
              </p>
            )}
            {tools
              .find((tool) => tool.name === selected)
              ?.schema.map((f) => (
                <div key={f.name}>
                  <label className="block text-xs font-medium text-fg-soft mb-1.5 flex items-center gap-1.5">
                    {f.name}
                    {f.required && <Badge variant="danger" size="sm">{t('tools.required')}</Badge>}
                    <span className="text-fg-mute text-[10.5px]">· {f.type}</span>
                  </label>
                  {f.type === 'string[]' ? (
                    <Input
                      value={args[f.name] ?? ''}
                      onChange={(e) => setArgs((p) => ({ ...p, [f.name]: e.target.value }))}
                      placeholder="tag1, tag2, tag3"
                    />
                  ) : f.name === 'content' || f.name === 'text' || f.name === 'command' || f.name === 'prompt' || f.name === 'context' || f.name === 'previousOutput' ? (
                    <Textarea
                      value={args[f.name] ?? ''}
                      onChange={(e) => setArgs((p) => ({ ...p, [f.name]: e.target.value }))}
                      placeholder={f.description}
                      rows={4}
                    />
                  ) : (
                    <Input
                      value={args[f.name] ?? ''}
                      onChange={(e) => setArgs((p) => ({ ...p, [f.name]: e.target.value }))}
                      placeholder={f.description}
                    />
                  )}
                  <p className="text-[10.5px] text-fg-mute mt-1">{f.description}</p>
                </div>
              ))}
            <Button
              variant="primary"
              onClick={handleExecute}
              disabled={executing || !selected}
              loading={executing}
              className="w-full"
              leftIcon={executing ? <Loader2 size={14} /> : <Send size={14} />}
            >
              {executing ? t('tools.executing') : t('tools.executeTool')}
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="text-sm font-semibold">{t('tools.resultTitle')}</div>
            {result && (
              <Badge variant={result.success ? 'success' : 'danger'}>
                {result.success ? <Check size={10} /> : <AlertCircle size={10} />}
                {result.success ? t('common.success') : t('common.failed')}
              </Badge>
            )}
          </CardHeader>
          <CardBody>
            {executing && (
              <div className="flex items-center gap-2 text-sm text-fg-soft">
                <Loader2 size={14} className="animate-spin" /> {t('tools.executingHint')}
              </div>
            )}
            {!executing && !result && (
              <div className="text-sm text-fg-mute text-center py-12">
                {t('tools.fillArgsHint')}
              </div>
            )}
            {result && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-xs text-fg-soft">
                  <span>{t('tools.duration')}: <span className="font-mono">{result.durationMs}ms</span></span>
                  {result.tool && <span>· {t('tools.toolLabel')}: <span className="font-mono">{result.tool}</span></span>}
                </div>
                {result.error && (
                  <div className="bg-danger/10 border border-danger/20 text-danger rounded-md p-3 text-xs">
                    {result.error}
                  </div>
                )}
                {result.output !== undefined && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10.5px] text-fg-mute">{t('tools.outputLabel')}</span>
                      <button
                        onClick={async () => {
                          await copyToClipboard(String(result.output));
                          toast({ type: 'success', title: t('common.copied') });
                        }}
                        className="text-[10.5px] text-fg-soft hover:text-fg"
                      >
                        {t('tools.copyHint')}
                      </button>
                    </div>
                    <pre className="bg-bg-soft border border-border rounded-md p-3 text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap break-all">
                      {typeof result.output === 'string'
                        ? result.output
                        : JSON.stringify(result.output, null, 2)}
                    </pre>
                  </div>
                )}
                <details className="text-xs">
                  <summary className="cursor-pointer text-fg-mute hover:text-fg-soft">{t('tools.fullJson')}</summary>
                  <pre className="mt-2 bg-bg-soft rounded-md p-3 text-[11px] font-mono overflow-auto max-h-48">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {history.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <div className="text-sm font-semibold">{t('tools.historyTitle')}</div>
            <span className="text-xs text-fg-mute">{t('tools.historyCount', { n: history.length })}</span>
          </CardHeader>
          <CardBody className="p-0">
            <div className="divide-y divide-border">
              {history.map((h, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setSelected(h.tool);
                    const arr: FieldState = {};
                    for (const [k, v] of Object.entries(h.args)) arr[k] = String(v);
                    setArgs(arr);
                    setResult(h.result);
                  }}
                  className="w-full px-5 py-2.5 text-left flex items-center gap-3 hover:bg-bg-soft/50 text-sm"
                >
                  <Badge variant={h.result.success ? 'success' : 'danger'} size="sm">
                    {h.tool}
                  </Badge>
                  <span className="flex-1 truncate text-fg-soft font-mono text-xs">
                    {JSON.stringify(h.args).slice(0, 60)}
                  </span>
                  <span className="text-[10.5px] text-fg-mute shrink-0">
                    {formatTime(h.ts)}
                  </span>
                </button>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
