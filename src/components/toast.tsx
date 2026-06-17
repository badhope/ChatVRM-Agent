import { useState, useCallback, useRef, useEffect, useMemo, createContext, useContext } from "react";

export type ToastKind = "info" | "warn" | "error" | "success";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  durationMs: number;
}

interface ToastApi {
  show: (t: Omit<ToastItem, "id" | "durationMs">, durationMs?: number) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show: ToastApi["show"] = useCallback(
    (t, durationMs = 5000) => {
      const id = nextId++;
      setItems((prev) => [...prev, { ...t, id, durationMs }]);
      const timer = setTimeout(() => dismiss(id), durationMs);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  useEffect(() => {
    const timersRef = timers.current;
    return () => {
      timersRef.forEach((t) => clearTimeout(t));
      timersRef.clear();
    };
  }, []);

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const colorClass = {
    info: "from-cyan-500/20 to-blue-500/20 border-cyan-300/30",
    warn: "from-amber-500/20 to-orange-500/20 border-amber-300/30",
    error: "from-rose-500/25 to-red-500/25 border-rose-300/30",
    success: "from-emerald-500/20 to-teal-500/20 border-emerald-300/30",
  }[item.kind];

  const icon = {
    info: "ⓘ",
    warn: "⚠",
    error: "✕",
    success: "✓",
  }[item.kind];

  const iconColor = {
    info: "text-cyan-300",
    warn: "text-amber-300",
    error: "text-rose-300",
    success: "text-emerald-300",
  }[item.kind];

  return (
    <div
      className={`glass-strong rounded-xl px-4 py-3 min-w-[280px] max-w-[360px] flex items-start gap-3 pointer-events-auto animate-slide-in-right border bg-gradient-to-br ${colorClass}`}
      onClick={onDismiss}
      role="alert"
    >
      <span className={`text-lg font-bold ${iconColor}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm text-white/95">{item.title}</div>
        {item.body && <div className="text-xs text-white/70 mt-0.5">{item.body}</div>}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="text-white/50 hover:text-white text-sm leading-none"
        aria-label="dismiss"
      >
        ×
      </button>
    </div>
  );
}
