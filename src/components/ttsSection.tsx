import { useState, useMemo } from "react";
import { useI18n } from "@/features/i18n/i18nContext";
import { TTS_PROVIDERS, findTTSProviderWithCustom } from "@/features/tts/providers";
import type { TTSProvider } from "@/features/tts/types";
import type { TTSSettings } from "@/features/tts/types";
import { useCustomTTS, type CustomProvider } from "@/features/providers/customProviders";
import { Accordion } from "./drawer";

interface TTSSectionProps {
  settings: TTSSettings;
  onChange: (s: TTSSettings) => void;
}

export function TTSSection({ settings, onChange }: TTSSectionProps) {
  const { t } = useI18n();
  const { provider } = findTTSProviderWithCustom(settings.providerId);
  const { list: customList } = useCustomTTS();

  const [showPicker, setShowPicker] = useState(false);

  const all: Array<{ p: TTSProvider | CustomProvider; isCustom: boolean }> = useMemo(() => {
    return [
      ...TTS_PROVIDERS.map((p) => ({ p, isCustom: false })),
      ...customList.map((c) => ({ p: c, isCustom: true })),
    ];
  }, [customList]);

  const onPick = (item: typeof all[number]) => {
    const voice = item.isCustom ? "default" : (item.p as TTSProvider).defaultVoice;
    onChange({
      ...settings,
      providerId: item.isCustom ? `custom:${item.p.id}` : item.p.id,
      voice,
      baseURL: item.isCustom ? item.p.baseURL : item.p.baseURL,
    });
    setShowPicker(false);
  };

  const needsKey = provider.protocol !== "edge";
  const isCustom = settings.providerId.startsWith("custom:");

  return (
    <div className="py-2 space-y-4">
      <div className="glass-panel rounded-2xl p-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2">
          {t.tts.current}
        </div>
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl icon-gradient-fill flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-lg shadow-purple-500/20">
            {(provider.name[0] ?? "?").toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold text-white truncate">{provider.name}</div>
            <div className="text-[13px] text-white/50 truncate mt-0.5">
              {settings.voice}
              {!needsKey && <span className="ml-2 text-emerald-300/70">· {t.tts.noKeyNeeded}</span>}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="btn-ghost text-[13px] font-semibold px-4 py-2 rounded-xl w-full"
          >
            {showPicker ? t.menu.close : t.tts.change}
          </button>
        </div>
      </div>

      {showPicker && (
        <div className="glass-panel rounded-2xl p-4 animate-slide-in-up space-y-1">
          {all.map((item) => {
            const isActive = settings.providerId === (item.isCustom ? `custom:${item.p.id}` : item.p.id);
            return (
              <button
                key={item.isCustom ? `c-${item.p.id}` : item.p.id}
                onClick={() => onPick(item)}
                className={`w-full flex items-center gap-3.5 px-3 py-3 rounded-xl transition-all ${
                  isActive ? "bg-white/[0.12]" : "hover:bg-white/[0.05] active:bg-white/[0.08]"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    isActive ? "icon-gradient-fill text-white" : "bg-white/[0.08] text-white/70"
                  }`}
                >
                  {(item.p.name[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-[13px] text-white/95 truncate">{item.p.name}</div>
                  <div className="text-[11px] text-white/40 truncate">
                    {item.isCustom
                      ? (item.p as CustomProvider).baseURL
                      : (item.p as TTSProvider).voices[0]?.label}
                  </div>
                </div>
                {isActive && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="icon-gradient flex-shrink-0">
                    <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!showPicker && (
        <div className="glass-panel rounded-2xl px-4 py-1">
          {!isCustom && provider.voices.length > 0 && (
            <Accordion title={t.tts.voice} defaultOpen>
              <div className="space-y-1">
                {provider.voices.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => onChange({ ...settings, voice: v.id })}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-left ${
                      settings.voice === v.id ? "bg-white/[0.12]" : "hover:bg-white/[0.05] active:bg-white/[0.08]"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] text-white/95 truncate">{v.label}</div>
                      {v.language && (
                        <div className="text-[11px] text-white/40 uppercase">{v.language}</div>
                      )}
                    </div>
                    {settings.voice === v.id && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="icon-gradient flex-shrink-0">
                        <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </Accordion>
          )}

          {needsKey && (
            <Accordion title={t.tts.apiKey}>
              <input
                type="password"
                autoComplete="off"
                value={settings.apiKey}
                onChange={(e) => onChange({ ...settings, apiKey: e.target.value })}
                placeholder="..."
                className="input-dark w-full px-3.5 py-2.5 rounded-xl text-[13px]"
              />
              {provider.apiKeyHint && (
                <div className="text-[12px] text-white/45 mt-2.5 leading-relaxed">
                  {provider.apiKeyHint}
                </div>
              )}
            </Accordion>
          )}

          {(provider.customBaseURL || isCustom) && (
            <Accordion title={t.tts.baseURL}>
              <input
                type="text"
                value={settings.baseURL}
                onChange={(e) => onChange({ ...settings, baseURL: e.target.value })}
                placeholder={provider.baseURL || "https://…"}
                className="input-dark w-full px-3.5 py-2.5 rounded-xl text-[13px]"
              />
            </Accordion>
          )}
        </div>
      )}
    </div>
  );
}
