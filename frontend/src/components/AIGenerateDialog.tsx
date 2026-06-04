import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input, Textarea } from './Input';
import { Badge } from './Badge';
import { api } from '@/api/client';
import { toast } from './Toast';
import { classifyError } from '@/utils/errors';
import { useConfigStore } from '@/stores/config';
import { cn } from '@/utils';

export type AIGeneratorType = 'personality' | 'tool' | 'skill' | 'agent' | 'memory' | 'emotion' | 'json';

export interface AIGenerateResult {
  content: string;
  parsed: unknown;
  parsedError?: string;
  model: string;
  provider: string;
  latencyMs: number;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Default generator type. User can switch from the dropdown. */
  type: AIGeneratorType;
  /** What the user is asking for. The dialog fills this in or accepts a free-form rewrite. */
  defaultPrompt: string;
  /** Optional: allow choosing a different generator type. Default true. */
  allowTypeSwitch?: boolean;
  /** Optional: when true, "Apply" calls this and closes the dialog. */
  onApply?: (parsed: unknown, raw: AIGenerateResult) => void;
  /** Title override. */
  title?: string;
}

export function AIGenerateDialog({
  open,
  onClose,
  type,
  defaultPrompt,
  allowTypeSwitch = true,
  onApply,
  title,
}: Props) {
  const { t } = useTranslation();
  const snapshot = useConfigStore((s) => s.snapshot);

  const [activeType, setActiveType] = useState<AIGeneratorType>(type);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [model, setModel] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AIGenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset when the dialog opens with a new default prompt/type
  const key = `${open}-${type}-${defaultPrompt.slice(0, 40)}`;

  const hasKey = snapshot ? Object.values(snapshot.hasKey).some(Boolean) : false;

  async function run() {
    if (!prompt.trim()) {
      setError('Prompt is required');
      return;
    }
    if (!hasKey) {
      toast({ type: 'warning', title: t('aiGen.configureKeyFirst') });
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    const started = Date.now();
    try {
      const body: Record<string, unknown> = {
        type: activeType,
        prompt: prompt.trim(),
        temperature,
        maxTokens,
      };
      if (model.trim()) body.model = model.trim();
      const r = await api.post<{
        ok: boolean;
        content: string;
        parsed?: unknown;
        parseError?: string;
        model: string;
        provider: string;
        latencyMs: number;
        usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
        error?: string;
      }>('/ai/generate', body);
      if (!r.ok) {
        setError(r.error ?? 'Generation failed');
        setResult(null);
        return;
      }
      const latency = r.latencyMs ?? Date.now() - started;
      setResult({
        content: r.content,
        parsed: r.parsed,
        parsedError: r.parseError,
        model: r.model,
        provider: r.provider,
        latencyMs: latency,
        usage: r.usage,
      });
    } catch (raw) {
      const err = classifyError(raw);
      const msg = t(`errors.kind.${err.kind}`, err.message);
      setError(msg);
      toast({ type: 'error', title: t('aiGen.runFailed'), message: msg });
    } finally {
      setRunning(false);
    }
  }

  function apply() {
    if (!result || !onApply) return;
    onApply(result.parsed, result);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={title ?? t('aiGen.title')}
    >
      <div key={key} className="space-y-4">
        <p className="text-xs text-fg-mute">{t('aiGen.subtitle')}</p>

        {allowTypeSwitch && (() => {
          const typesObj = t('aiGen.types', { returnObjects: true }) as unknown as Record<string, string>;
          const typeIds = Object.keys(typesObj);
          return (
            <div>
              <label className="block text-xs font-medium text-fg-soft mb-1.5">
                {t('aiGen.type')}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {typeIds.map((k) => (
                  <button
                    key={k}
                    onClick={() => setActiveType(k as AIGeneratorType)}
                    className={cn(
                      'h-7 px-2.5 rounded-full text-[11px] border transition-colors',
                      activeType === k
                        ? 'border-brand/60 bg-brand/10 text-brand'
                        : 'border-border text-fg-soft hover:bg-bg-soft',
                    )}
                  >
                    {String(typesObj[k] ?? k)}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        <div>
          <label className="block text-xs font-medium text-fg-soft mb-1.5">
            {t('aiGen.prompt')}
          </label>
          <Textarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('aiGen.promptPlaceholder')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label={t('aiGen.model')}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={snapshot?.chat?.model ?? 'default'}
            hint={t('aiGen.modelHint')}
          />
          <div>
            <label className="block text-xs font-medium text-fg-soft mb-1.5">
              {t('aiGen.temperature')}: {temperature.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-fg-soft mb-1.5">
              {t('aiGen.maxTokens')}
            </label>
            <Input
              type="number"
              min={64}
              max={4096}
              step={64}
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 1024)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Badge variant={hasKey ? 'success' : 'warning'}>
            {hasKey ? t('status.ready') : t('errors.configKeyFirst')}
          </Badge>
          <Button
            variant="primary"
            leftIcon={running ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            loading={running}
            disabled={running || !prompt.trim()}
            onClick={run}
          >
            {running ? t('aiGen.running') : t('aiGen.run')}
          </Button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-danger/8 text-danger text-xs">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span className="whitespace-pre-wrap">{error}</span>
          </div>
        )}

        {result && (
          <div className="rounded-md border border-border bg-bg-soft p-3 space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-fg flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-success" /> {t('aiGen.result')}
              </span>
              <span className="text-fg-mute font-mono">
                {result.model} · {t('aiGen.latency', { ms: result.latencyMs })}
              </span>
            </div>

            {result.parsed !== null && result.parsed !== undefined ? (
              <div>
                <div className="text-[10.5px] uppercase tracking-wide text-fg-mute mb-1">
                  {t('aiGen.parsed')}
                </div>
                <pre className="max-h-60 overflow-auto text-[11px] font-mono whitespace-pre-wrap break-all bg-bg p-2.5 rounded border border-border">
                  {JSON.stringify(result.parsed, null, 2)}
                </pre>
              </div>
            ) : (
              <>
                {result.parsedError && (
                  <div className="text-[10.5px] text-warning flex items-center gap-1">
                    <AlertCircle size={10} /> {result.parsedError}
                  </div>
                )}
                <div>
                  <div className="text-[10.5px] uppercase tracking-wide text-fg-mute mb-1">
                    {t('aiGen.raw')}
                  </div>
                  <pre className="max-h-60 overflow-auto text-[11px] font-mono whitespace-pre-wrap break-all bg-bg p-2.5 rounded border border-border">
                    {result.content}
                  </pre>
                </div>
              </>
            )}

            {onApply && result.parsed !== null && result.parsed !== undefined && (
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={onClose}>{t('aiGen.dismiss')}</Button>
                <Button variant="primary" onClick={apply}>
                  {t('aiGen.apply')}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
