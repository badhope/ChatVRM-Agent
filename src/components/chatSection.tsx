import { useI18n } from "@/features/i18n/i18nContext";
import type { Message } from "@/features/messages/messages";
import { Accordion } from "./drawer";

interface ChatSectionProps {
  messages: Message[];
  onClear: () => void;
}

export function ChatSection({ messages, onClear }: ChatSectionProps) {
  const { t } = useI18n();
  const recent = messages.slice(-30);

  const exportChat = () => {
    const blob = new Blob([JSON.stringify(messages, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="py-2 space-y-4">
      <div className="glass-panel rounded-2xl px-4 py-1">
        <Accordion title={t.chat.recent} defaultOpen>
          {recent.length === 0 ? (
            <div className="text-[13px] text-white/40 py-4">{t.chat.noMessages}</div>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto scroll-hidden">
              {recent.map((m, i) => (
                <div
                  key={i}
                  className={`text-[12px] px-3 py-2 rounded-lg leading-relaxed ${
                    m.role === "user"
                      ? "bg-white/[0.06] text-white/85"
                      : "bg-white/[0.09] text-white/95"
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 mr-1.5">
                    {m.role === "user" ? "→" : "←"}
                  </span>
                  {m.content}
                </div>
              ))}
            </div>
          )}
        </Accordion>

        <Accordion title={t.chat.export}>
          <button onClick={exportChat} className="btn-ghost w-full py-2.5 rounded-xl text-[13px] font-semibold">
            {t.chat.export}
          </button>
        </Accordion>

        <Accordion title={t.chat.clear}>
          <button
            onClick={() => {
              if (confirm(t.chat.clear + "?")) onClear();
            }}
            className="w-full py-2.5 rounded-xl text-[13px] font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-200"
          >
            {t.chat.clear}
          </button>
        </Accordion>
      </div>
    </div>
  );
}
