import { useState, useEffect, useCallback, useRef } from "react";
import { useI18n } from "@/features/i18n/i18nContext";
import { useToast } from "./toast";

interface TopBarProps {
  onOpenMenu: () => void;
  onOpenChat: () => void;
  hasMessages: boolean;
}

export function TopBar({ onOpenMenu, onOpenChat, hasMessages }: TopBarProps) {
  const { t, language, setLanguage } = useI18n();
  const [helpOpen, setHelpOpen] = useState(false);
  const toast = useToast();

  const toggleLang = () => {
    setLanguage(language === "en" ? "zh" : "en");
  };

  const showNoChat = () => {
    if (!hasMessages) {
      toast.show({
        kind: "info",
        title: t.toast.noChatTitle,
        body: t.toast.noChatBody,
      });
    } else {
      onOpenChat();
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-30 px-3 sm:px-5 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-[max(1rem,env(safe-area-inset-top))] pointer-events-none">
      <div className="flex items-center justify-between gap-2 max-w-6xl mx-auto pointer-events-auto">
        <button
          onClick={onOpenMenu}
          className="glass rounded-full px-3.5 py-2 flex items-center gap-2 active:scale-95 transition-transform"
          aria-label="menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M3 12h18M3 18h18" stroke="url(#tg1)" strokeWidth="2.2" strokeLinecap="round" />
            <defs>
              <linearGradient id="tg1" x1="0" y1="0" x2="24" y2="24">
                <stop offset="0%" stopColor="#a78bfa" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
          </svg>
          <span className="text-sm font-semibold text-white/90 hidden sm:inline">{t.topbar.menu}</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={showNoChat}
            className="glass rounded-full w-10 h-10 flex items-center justify-center active:scale-95 transition-transform"
            aria-label="chat history"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M21 12a8 8 0 0 1-11.4 7.3L3 21l1.7-6.6A8 8 0 1 1 21 12z"
                stroke="url(#g1)"
                strokeWidth="1.8"
                strokeLinejoin="round"
                fill="rgba(167,139,250,0.15)"
              />
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="24" y2="24">
                  <stop offset="0%" stopColor="#a78bfa" />
                  <stop offset="100%" stopColor="#22d3ee" />
                </linearGradient>
              </defs>
            </svg>
          </button>

          <button
            onClick={toggleLang}
            className="glass rounded-full px-3 py-2 flex items-center gap-1.5 active:scale-95 transition-transform"
            aria-label="language"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="url(#g2)" strokeWidth="1.8" />
              <path
                d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"
                stroke="url(#g2)"
                strokeWidth="1.6"
              />
              <defs>
                <linearGradient id="g2" x1="0" y1="0" x2="24" y2="24">
                  <stop offset="0%" stopColor="#a78bfa" />
                  <stop offset="100%" stopColor="#22d3ee" />
                </linearGradient>
              </defs>
            </svg>
            <span className="text-xs font-bold text-white/90 uppercase">
              {language === "en" ? "EN" : "中"}
            </span>
          </button>

          <button
            onClick={() => setHelpOpen(true)}
            className="glass rounded-full w-10 h-10 flex items-center justify-center active:scale-95 transition-transform"
            aria-label="help"
          >
            <span className="icon-gradient font-bold text-base">?</span>
          </button>
        </div>
      </div>

      {helpOpen && <HelpPopover onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

function HelpPopover({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const items = t.help.steps;
  const closeRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    // Focus the close button on mount for keyboard users.
    closeRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.help.title}
      onKeyDown={handleKeyDown}
    >
      <div
        className="glass-panel rounded-2xl p-6 max-w-sm w-full animate-slide-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-white/95">{t.help.title}</h3>
          <button
            ref={closeRef}
            onClick={onClose}
            className="text-white/60 hover:text-white w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10"
            aria-label="close"
          >
            ×
          </button>
        </div>
        <ol className="space-y-2.5 text-sm text-white/80">
          {items.map((step, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="icon-gradient-fill rounded-full w-5 h-5 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-4 pt-3 border-t border-white/10 text-xs text-white/50 leading-relaxed">
          {t.help.footnote}
        </div>
      </div>
    </div>
  );
}
