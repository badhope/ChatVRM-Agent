import { useState, useEffect, ReactNode } from "react";

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
        className="w-full flex items-center justify-between gap-3 py-3.5 px-1 active:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-white/90 truncate">{title}</span>
          {badge && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/10 text-white/60">
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
      {open && <div className="pb-4 pt-1 px-1 animate-slide-in-up">{children}</div>}
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
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className={
          variant === "drawer"
            ? "absolute top-0 bottom-0 left-0 w-full sm:w-[400px] sm:max-w-[90vw] glass-strong shadow-2xl flex flex-col animate-slide-in-left"
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
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 active:scale-90 transition-all"
              aria-label="close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scroll-hidden px-4 sm:px-5">{children}</div>
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
    <div className="py-2">
      {items.map((item) => (
        <button
          key={item.key}
          onClick={item.onClick}
          className="w-full flex items-center gap-3.5 py-3.5 px-2 -mx-2 rounded-xl active:bg-white/5 hover:bg-white/5 transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-xl glass flex items-center justify-center flex-shrink-0">
            {item.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white/95">{item.title}</div>
            <div className="text-xs text-white/50 mt-0.5 line-clamp-1">{item.hint}</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-white/40 flex-shrink-0">
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
        className="flex items-center gap-1.5 -ml-1 px-1 py-2 text-sm text-white/70 hover:text-white active:scale-95 transition-all"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {title}
      </button>
      {children}
    </div>
  );
}
