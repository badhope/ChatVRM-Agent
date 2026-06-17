import { useState, useEffect, useCallback, useRef, ReactNode } from "react";

interface AccordionProps {
  title: string;
  defaultOpen?: boolean;
  badge?: string;
  children: ReactNode;
}

export function Accordion({ title, defaultOpen = false, badge, children }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/8">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 py-4 px-1 active:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-sm font-semibold text-white/95 truncate">{title}</span>
          {badge && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-white/10 text-white/60">
              {badge}
            </span>
          )}
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          className={`flex-shrink-0 text-white/50 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <div className="pb-5 pt-1 px-1 animate-slide-in-up">{children}</div>}
    </div>
  );
}

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  variant?: "drawer" | "sheet";
}

export function Drawer({ open, onClose, title, children, variant = "drawer" }: DrawerProps) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
    } else if (visible) {
      setClosing(true);
      const t = setTimeout(() => setVisible(false), 250);
      return () => clearTimeout(t);
    }
  }, [open, visible]);

  // Clean up any pending close timer on unmount.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const handleClose = useCallback(() => {
    setClosing(true);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setVisible(false);
      onClose();
      closeTimerRef.current = null;
    }, 250);
  }, [onClose]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, handleClose]);

  if (!visible && !open) return null;

  const backdropClass = closing
    ? "animate-fade-out opacity-0"
    : "animate-fade-in";
  const panelClass = closing
    ? "animate-slide-out-right"
    : "animate-slide-in-right";

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-sm ${backdropClass}`}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={
          variant === "drawer"
            ? `absolute top-0 right-0 bottom-0 w-full sm:w-[420px] sm:max-w-[90vw] glass-strong shadow-2xl flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] ${panelClass}`
            : "absolute inset-0 flex items-end sm:items-center sm:justify-center pointer-events-none"
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={
            variant === "drawer"
              ? "flex-1 flex flex-col min-h-0"
              : "w-full sm:max-w-lg sm:rounded-2xl glass-strong sm:shadow-2xl max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-b-2xl pointer-events-auto animate-slide-in-up"
          }
        >
          <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-white/10 flex-shrink-0">
            <h2 className="text-base font-bold text-white/95">{title}</h2>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 active:scale-90 transition-all"
              aria-label="close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scroll-hidden px-5 sm:px-6 py-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

interface SectionListProps {
  items: Array<{ key: string; title: string; hint: string; icon: ReactNode; onClick: () => void }>;
}

export function SectionList({ items }: SectionListProps) {
  return (
    <div className="py-3 space-y-1">
      {items.map((item) => (
        <button
          key={item.key}
          onClick={item.onClick}
          className="w-full flex items-center gap-4 py-3.5 px-3 -mx-1 rounded-xl active:bg-white/8 hover:bg-white/[0.06] transition-colors text-left group"
        >
          <div className="w-12 h-12 rounded-xl icon-gradient-fill flex items-center justify-center flex-shrink-0 shadow-lg shadow-purple-500/20 group-hover:shadow-purple-500/30 transition-shadow">
            {item.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-white/95">{item.title}</div>
            <div className="text-[13px] text-white/50 mt-0.5 line-clamp-1">{item.hint}</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white/30 flex-shrink-0 group-hover:text-white/50 transition-colors">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ))}
    </div>
  );
}

interface SectionPageProps {
  title: string;
  onBack: () => void;
  children: ReactNode;
}

export function SectionPage({ title, onBack, children }: SectionPageProps) {
  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-2 -ml-1 px-1 py-3 text-sm font-medium text-white/70 hover:text-white active:scale-95 transition-all"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {title}
      </button>
      <div className="mt-1">{children}</div>
    </div>
  );
}
