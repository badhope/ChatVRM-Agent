import { useI18n } from "@/features/i18n/i18nContext";

interface AssistantBubbleProps {
  text: string;
  isThinking: boolean;
  isSpeaking: boolean;
}

export function AssistantBubble({ text, isThinking, isSpeaking }: AssistantBubbleProps) {
  const { t } = useI18n();
  if (!text && !isThinking) return null;

  return (
    <div className="fixed bottom-24 sm:bottom-28 left-0 right-0 z-10 pointer-events-none">
      <div className="max-w-2xl mx-auto px-4 sm:px-5">
        <div
          className="glass-strong rounded-2xl px-4 py-3 shadow-2xl animate-slide-in-up pointer-events-auto"
          role="status"
          aria-live="polite"
        >
          {isThinking && !text ? (
            <div className="flex items-center gap-1.5 text-white/50 text-sm">
              <span className="text-xs font-semibold">{t.chatInput.thinking}</span>
              <TypingDots />
            </div>
          ) : (
            <>
              <div className="text-sm sm:text-base text-white/95 leading-relaxed line-clamp-3 font-medium">
                {text}
              </div>
              {isSpeaking && (
                <div className="flex items-center gap-1.5 mt-1.5 text-[10px] uppercase tracking-wider text-white/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-soft"></span>
                  {t.assistantBubble.speaking}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-end gap-0.5 h-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-1 h-1 rounded-full bg-white/60"
          style={{
            animation: `typing-bounce 1.2s ease-in-out infinite`,
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}
