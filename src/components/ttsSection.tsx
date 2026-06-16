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
  onBack: () => void;
}

export function TTSSection({ settings, onChange, onBack }: TTSSectionProps) {
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
    <div className="py-2">
      <div className="glass rounded-2xl p-4 my-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1.5">
          {t.tts.current}
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl icon-gradient-fill flex items-center justify-center text-white font-bold text-base flex-shrink-0">
            {(provider.name[0] ?? "?").toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white/95 truncate">{provider.name}</div>
            <div className="text-xs text-white/50 truncate">
              {settings.voice}
              {!needsKey && <span className="ml-2 text-emerald-300/70">· {t.tts.noKeyNeeded}</span>}
            </div>
          </div>
        </div>
        <div className="mt-3">
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="btn-ghost text-xs font-semibold px-3 py-1.5 rounded-lg w-full"
          >
            {showPicker ? t.menu.close : t.tts.change}
          </button>
        </div>
      </div>

      {showPicker && (
        <div className="space-y-1 animate-slide-in-up">
          {all.map((item) => {
            const isActive = settings.providerId === (item.isCustom ? `custom:${item.p.id}` : item.p.id);
            return (
              <button
                key={item.isCustom ? `c-${item.p.id}` : item.p.id}
                onClick={() => onPick(item)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                  isActive ? "bg-white/10" : "hover:bg-white/5 active:bg-white/8"
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    isActive ? "icon-gradient-fill text-white" : "bg-white/8 text-white/70"
                  }`}
                >
                  {(item.p.name[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm text-white/90 truncate">{item.p.name}</div>
                  <div className="text-[10px] text-white/40 truncate">
                    {item.isCustom
                      ? (item.p as CustomProvider).baseURL
                      : (item.p as TTSProvider).voices[0]?.label}
                  </div>
                </div>
                {isActive && <span className="icon-gradient text-sm font-bold">✓</span>}
              </button>
            );
          })}
        </div>
      )}

      {!showPicker && (
        <div className="mt-2">
          {!isCustom && provider.voices.length > 0 && (
            <Accordion title={t.tts.voice} defaultOpen>
              <div className="space-y-1">
                {provider.voices.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => onChange({ ...settings, voice: v.id })}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left ${
                      settings.voice === v.id ? "bg-white/10" : "hover:bg-white/5 active:bg-white/8"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm text-white/90 truncate">{v.label}</div>
                      {v.language && (
                        <div className="text-[10px] text-white/40 uppercase">{v.language}</div>
                      )}
                    </div>
                    {settings.voice === v.id && (
                      <span className="icon-gradient text-xs font-bold">✓</span>
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
                className="input-dark w-full px-3.5 py-2.5 rounded-xl text-sm"
              />
              {provider.apiKeyHint && (
                <div className="text-[11px] text-white/45 mt-2 leading-relaxed">
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
                className="input-dark w-full px-3.5 py-2.5 rounded-xl text-sm"
              />
            </Accordion>
          )}
        </div>
      )}
    </div>
  );
}
