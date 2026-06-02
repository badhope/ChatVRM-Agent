import { useEffect, useState } from 'react';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/utils';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

let listeners: Array<(t: ToastItem) => void> = [];

export function toast(t: Omit<ToastItem, 'id'>) {
  const item: ToastItem = { ...t, id: Math.random().toString(36).slice(2) };
  listeners.forEach((l) => l(item));
}

const iconMap: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={16} className="text-success" />,
  error: <AlertCircle size={16} className="text-danger" />,
  info: <Info size={16} className="text-info" />,
  warning: <AlertTriangle size={16} className="text-warning" />,
};

export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (item: ToastItem) => {
      setItems((prev) => [...prev, item]);
      setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
      }, 4000);
    };
    listeners.push(handler);
    return () => {
      listeners = listeners.filter((l) => l !== handler);
    };
  }, []);

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            'pointer-events-auto glass border border-border rounded-lg shadow-elev',
            'p-3 flex items-start gap-2.5 animate-slide-up',
          )}
        >
          <div className="mt-0.5">{iconMap[item.type]}</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{item.title}</div>
            {item.message && (
              <div className="text-xs text-fg-soft mt-0.5">{item.message}</div>
            )}
          </div>
          <button
            onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
            className="text-fg-mute hover:text-fg p-0.5"
            aria-label="dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
