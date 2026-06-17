import { useState } from "react";
import { useI18n } from "@/features/i18n/i18nContext";
import { Accordion } from "./drawer";
import { useCustomLLM, useCustomTTS } from "@/features/providers/customProviders";
import { useToast } from "./toast";
import { CustomProviderDialog } from "./llmSection";

interface AdvancedSectionProps {
  onResetAll: () => void;
}

export function AdvancedSection({ onResetAll }: AdvancedSectionProps) {
  const { t } = useI18n();
  const llm = useCustomLLM();
  const tts = useCustomTTS();
  const toast = useToast();
  const [editingLlm, setEditingLlm] = useState<string | null>(null);
  const [editingTts, setEditingTts] = useState<string | null>(null);
  const [addLlm, setAddLlm] = useState(false);
  const [addTts, setAddTts] = useState(false);

  const doReset = () => {
    if (!confirm(t.advanced.resetConfirm)) return;
    onResetAll();
    toast.show({ kind: "success", title: t.advanced.resetDone });
  };

  return (
    <div className="py-2 space-y-4">
      <div className="glass-panel rounded-2xl px-4 py-1">
        <Accordion title={t.advanced.customLLM} defaultOpen>
          {llm.list.length === 0 ? (
            <div className="text-[13px] text-white/40 py-3">{t.advanced.noCustom}</div>
          ) : (
            <div className="space-y-2">
              {llm.list.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2.5 px-3 py-3 rounded-xl bg-white/[0.05]"
                >
                  <div className="w-8 h-8 rounded-lg icon-gradient-fill flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {c.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-white/95 truncate">{c.name}</div>
                    <div className="text-[11px] text-white/40 truncate">
                      {c.protocol} · {c.baseURL}
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingLlm(c.id)}
                    className="text-[12px] text-white/60 hover:text-white px-2 py-1"
                  >
                    {t.custom.edit}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(t.custom.remove + "?")) llm.remove(c.id);
                    }}
                    className="text-[12px] text-rose-300/80 hover:text-rose-200 px-2 py-1"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => setAddLlm(true)}
            className="mt-3 w-full py-3 rounded-xl border border-dashed border-white/20 text-[13px] text-white/70 hover:border-white/35 hover:text-white/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="icon-gradient">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            {t.advanced.addNew}
          </button>
        </Accordion>

        <Accordion title={t.advanced.customTTS}>
          {tts.list.length === 0 ? (
            <div className="text-[13px] text-white/40 py-3">{t.advanced.noCustom}</div>
          ) : (
            <div className="space-y-2">
              {tts.list.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2.5 px-3 py-3 rounded-xl bg-white/[0.05]"
                >
                  <div className="w-8 h-8 rounded-lg icon-gradient-fill flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {c.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-white/95 truncate">{c.name}</div>
                    <div className="text-[11px] text-white/40 truncate">
                      {c.protocol} · {c.baseURL}
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingTts(c.id)}
                    className="text-[12px] text-white/60 hover:text-white px-2 py-1"
                  >
                    {t.custom.edit}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(t.custom.remove + "?")) tts.remove(c.id);
                    }}
                    className="text-[12px] text-rose-300/80 hover:text-rose-200 px-2 py-1"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => setAddTts(true)}
            className="mt-3 w-full py-3 rounded-xl border border-dashed border-white/20 text-[13px] text-white/70 hover:border-white/35 hover:text-white/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="icon-gradient">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            {t.advanced.addNew}
          </button>
        </Accordion>

        <Accordion title={t.advanced.about}>
          <div className="space-y-2 text-[12px] text-white/60 leading-relaxed">
            <div>ChatVRM-Agent v0.2.0</div>
            <div>
              <a
                href="https://github.com/badhope/ChatVRM-Agent"
                target="_blank"
                rel="noopener noreferrer"
                className="icon-gradient hover:opacity-80"
              >
                github.com/badhope/ChatVRM-Agent
              </a>
            </div>
          </div>
        </Accordion>
      </div>

      <div className="px-1">
        <button
          onClick={doReset}
          className="w-full py-3 rounded-xl text-[13px] font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-200"
        >
          {t.advanced.reset}
        </button>
      </div>

      {addLlm && (
        <CustomProviderDialog
          kind="llm"
          onClose={() => setAddLlm(false)}
          onSaved={() => {
            setAddLlm(false);
            toast.show({ kind: "success", title: t.custom.save });
          }}
        />
      )}
      {addTts && (
        <CustomProviderDialog
          kind="tts"
          onClose={() => setAddTts(false)}
          onSaved={() => {
            setAddTts(false);
            toast.show({ kind: "success", title: t.custom.save });
          }}
        />
      )}
      {editingLlm && (
        <CustomProviderDialog
          kind="llm"
          existing={llm.list.find((c) => c.id === editingLlm)}
          onClose={() => setEditingLlm(null)}
          onSaved={() => setEditingLlm(null)}
        />
      )}
      {editingTts && (
        <CustomProviderDialog
          kind="tts"
          existing={tts.list.find((c) => c.id === editingTts)}
          onClose={() => setEditingTts(null)}
          onSaved={() => setEditingTts(null)}
        />
      )}
    </div>
  );
}
