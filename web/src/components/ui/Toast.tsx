import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/cn';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration: number;
}

interface ToastContextValue {
  toast: (params: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const TYPE_STYLES: Record<ToastType, string> = {
  success: 'border-l-success text-success',
  error: 'border-l-error text-error',
  warning: 'border-l-warning text-warning',
  info: 'border-l-info text-info',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [exiting, setExiting] = useState(false);
  const Icon = ICONS[toast.type];

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(onDismiss, 200);
    }, toast.duration);
    return () => clearTimeout(timer);
  }, [toast.duration, onDismiss]);

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border border-border bg-surface p-4 shadow-lg',
        'border-l-4 transition-all duration-200',
        exiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0 animate-fade-in',
        TYPE_STYLES[toast.type],
      )}
      role="alert"
      aria-live="polite"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text">{toast.title}</p>
        {toast.description && (
          <p className="mt-1 text-xs text-text-secondary">{toast.description}</p>
        )}
      </div>
      <button
        onClick={() => { setExiting(true); setTimeout(onDismiss, 200); }}
        className="shrink-0 rounded p-0.5 text-text-muted hover:text-text transition-colors-fast"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (params: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { ...params, id, duration: params.duration ?? 4000 }]);
    },
    [],
  );

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80" aria-label="Notifications">
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
