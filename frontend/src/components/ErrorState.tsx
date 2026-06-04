import { Button } from './Button';
import { AlertCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import type { AppError } from '@/utils/errors';
import { useTranslation } from 'react-i18next';

interface ErrorStateProps {
  error: AppError;
  onRetry?: () => void;
  /** Compact mode is a one-line strip; full mode is a card. */
  variant?: 'compact' | 'full';
  /**
   * Optional section-specific message shown as the primary text.
   * If omitted, we use the error's classified message (the most specific
   * thing we know — e.g. "Network error — check your connection" rather
   * than the generic "Failed to load").
   */
  message?: string;
}

const ICON_FOR_KIND: Record<string, JSX.Element> = {
  network: <AlertTriangle size={14} className="text-warning" />,
  notFound: <AlertCircle size={14} className="text-danger" />,
  unauthorized: <AlertCircle size={14} className="text-danger" />,
  client: <AlertCircle size={14} className="text-danger" />,
  server: <AlertTriangle size={14} className="text-warning" />,
  parse: <AlertCircle size={14} className="text-danger" />,
  validation: <AlertCircle size={14} className="text-danger" />,
  rateLimit: <AlertTriangle size={14} className="text-warning" />,
  timeout: <AlertTriangle size={14} className="text-warning" />,
  aborted: <AlertCircle size={14} className="text-fg-mute" />,
  unknown: <AlertCircle size={14} className="text-danger" />,
};

/**
 * Inline error display used inside Cards. Renders a one-line strip in compact
 * mode and a card with a retry button in full mode. The parent owns the
 * retry action so we can call the same `useAsyncState.retry()`.
 */
export function ErrorState({ error, onRetry, variant = 'compact', message }: ErrorStateProps) {
  const { t } = useTranslation();
  const icon = ICON_FOR_KIND[error.kind] ?? ICON_FOR_KIND.unknown;
  // Prefer the section-specific message when given, but always show the
  // classified reason below it so the user can act on it.
  const headline = message ?? error.message;
  const detail = message ? error.message : null;
  const kindLabel = t(`errors.kind.${error.kind}`, error.kind);

  if (variant === 'full') {
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-danger/8 border border-danger/20">
        <div className="shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-fg">{headline}</div>
          <div className="text-[10.5px] text-fg-mute mt-0.5 font-mono flex items-center gap-1.5">
            <span className="px-1 py-0.5 rounded bg-bg-soft border border-border">{kindLabel}</span>
            {error.status && <span>HTTP {error.status}</span>}
            {detail && <span className="truncate">· {detail}</span>}
          </div>
        </div>
        {onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            leftIcon={<RefreshCw size={12} />}
          >
            {t('errors.retry')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-fg-soft flex-wrap">
      {icon}
      <span className="truncate">{headline}</span>
      <span className="px-1 py-0.5 rounded bg-bg-soft border border-border text-[10px] font-mono text-fg-mute">
        {kindLabel}
      </span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-brand hover:underline ml-1 inline-flex items-center gap-1"
        >
          <RefreshCw size={11} /> {t('errors.retry')}
        </button>
      )}
    </div>
  );
}
