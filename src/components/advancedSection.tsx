import { useState } from "react";
import { useI18n } from "@/features/i18n/i18nContext";
import { Accordion } from "./drawer";
import { useCustomLLM, useCustomTTS } from "@/features/providers/customProviders";
import { useToast } from "./toast";
import { CustomProviderDialog } from "./llmSection";

interface AdvancedSectionProps {
  onBack: () => void;
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
    <div className="py-2">
      <Accordion title={t.advanced.customLLM} defaultOpen>
        {llm.list.length === 0 ? (
          <div className="text-sm text-white/40 py-2">{t.advanced.noCustom}</div>
        ) : (
          <div className="space-y-1.5">
            {llm.list.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5"
              >
                <div className="w-7 h-7 rounded-lg icon-gradient-fill flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {c.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white/90 truncate">{c.name}</div>
                  <div className="text-[10px] text-white/40 truncate">
                    {c.protocol} · {c.baseURL}
                  </div>
                </div>
                <button
                  onClick={() => setEditingLlm(c.id)}
                  className="text-xs text-white/60 hover:text-white px-2 py-1"
                >
                  {t.custom.edit}
                </button>
                <button
                  onClick={() => {
                    if (confirm(t.custom.remove + "?")) llm.remove(c.id);
                  }}
                  className="text-xs text-rose-300/80 hover:text-rose-200 px-2 py-1"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => setAddLlm(true)}
          className="mt-2 w-full py-2.5 rounded-xl border border-dashed border-white/15 text-sm text-white/70 hover:border-white/30 hover:text-white/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          <span className="icon-gradient font-bold">+</span>
          {t.advanced.addNew}
        </button>
      </Accordion>

      <Accordion title={t.advanced.customTTS}>
        {tts.list.length === 0 ? (
          <div className="text-sm text-white/40 py-2">{t.advanced.noCustom}</div>
        ) : (
          <div className="space-y-1.5">
            {tts.list.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5"
              >
                <div className="w-7 h-7 rounded-lg icon-gradient-fill flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {c.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white/90 truncate">{c.name}</div>
                  <div className="text-[10px] text-white/40 truncate">
                    {c.protocol} · {c.baseURL}
                  </div>
                </div>
                <button
                  onClick={() => setEditingTts(c.id)}
                  className="text-xs text-white/60 hover:text-white px-2 py-1"
                >
                  {t.custom.edit}
                </button>
                <button
                  onClick={() => {
                    if (confirm(t.custom.remove + "?")) tts.remove(c.id);
                  }}
                  className="text-xs text-rose-300/80 hover:text-rose-200 px-2 py-1"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => setAddTts(true)}
          className="mt-2 w-full py-2.5 rounded-xl border border-dashed border-white/15 text-sm text-white/70 hover:border-white/30 hover:text-white/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          <span className="icon-gradient font-bold">+</span>
          {t.advanced.addNew}
        </button>
      </Accordion>

      <Accordion title={t.advanced.about}>
        <div className="space-y-1.5 text-xs text-white/60 leading-relaxed">
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

      <div className="my-4">
        <button
          onClick={doReset}
          className="w-full py-2.5 rounded-xl text-sm font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-200"
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
