import { useState, useMemo } from "react";
import { useI18n } from "@/features/i18n/i18nContext";
import { LLM_PROVIDERS, findProviderWithCustom } from "@/features/llm/providers";
import type { LLMProvider } from "@/features/llm/types";
import type { LLMSettings } from "@/features/llm/types";
import { useCustomLLM, useCustomTTS, type CustomProvider, type CustomProtocol } from "@/features/providers/customProviders";
import { useToast } from "./toast";
import { Accordion } from "./drawer";

interface LLMSectionProps {
  settings: LLMSettings;
  onChange: (s: LLMSettings) => void;
  onBack: () => void;
}

const REGION_LABELS_EN: Record<string, string> = {
  global: "Global",
  china: "中国",
  local: "Local / Self-hosted",
  custom: "Custom",
};
const REGION_LABELS_ZH: Record<string, string> = {
  global: "国际",
  china: "中国",
  local: "本地 / 自建",
  custom: "自定义",
};

export function LLMSection({ settings, onChange, onBack }: LLMSectionProps) {
  const { t, language } = useI18n();
  const { provider } = findProviderWithCustom(settings.providerId);
  const { list: customList } = useCustomLLM();
  const toast = useToast();

  const [showPicker, setShowPicker] = useState(false);
  const [showCustomDialog, setShowCustomDialog] = useState(false);

  const allProviders: Array<{ region: string; p: LLMProvider | CustomProvider; isCustom: boolean }> = useMemo(() => {
    const builtins = LLM_PROVIDERS.map((p) => ({ region: p.region ?? "global", p, isCustom: false }));
    const customs = customList.map((c) => ({ region: "custom", p: c, isCustom: true }));
    return [...builtins, ...customs];
  }, [customList]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof allProviders> = {};
    for (const item of allProviders) {
      if (!groups[item.region]) groups[item.region] = [];
      groups[item.region].push(item);
    }
    return groups;
  }, [allProviders]);

  const regionLabels = language === "zh" ? REGION_LABELS_ZH : REGION_LABELS_EN;

  const onPickProvider = (item: typeof allProviders[number]) => {
    onChange({
      ...settings,
      providerId: item.isCustom ? `custom:${item.p.id}` : item.p.id,
      baseURL: item.isCustom ? item.p.baseURL : item.p.baseURL,
      model: item.isCustom ? item.p.defaultModel : (item.p as LLMProvider).defaultModel,
    });
    setShowPicker(false);
  };

  const showAnthropicWarn = provider.id === "anthropic";

  return (
    <div className="py-2 space-y-4">
      {/* Current provider card */}
      <div className="glass-panel rounded-2xl p-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2">
          {t.llm.current}
        </div>
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl icon-gradient-fill flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-lg shadow-purple-500/20">
            {(provider.name[0] ?? "?").toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold text-white truncate">{provider.name}</div>
            <div className="text-[13px] text-white/50 truncate mt-0.5">
              {settings.model || provider.defaultModel || "—"}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="btn-ghost text-[13px] font-semibold px-4 py-2 rounded-xl w-full"
          >
            {showPicker ? t.menu.close : t.llm.change}
          </button>
        </div>
      </div>

      {/* Provider picker */}
      {showPicker && (
        <div className="glass-panel rounded-2xl p-5 animate-slide-in-up space-y-5">
          {Object.entries(grouped).map(([region, items]) => (
            <div key={region}>
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/40 px-1 mb-2.5">
                {regionLabels[region] ?? region}
              </div>
              <div className="flex flex-col gap-2">
                {items.map((item) => {
                  const isActive = settings.providerId === (item.isCustom ? `custom:${item.p.id}` : item.p.id);
                  return (
                    <button
                      key={item.isCustom ? `c-${item.p.id}` : item.p.id}
                      onClick={() => onPickProvider(item)}
                      className={`w-full flex items-center gap-3.5 px-3.5 py-4 rounded-xl transition-all ${
                        isActive
                          ? "bg-white/[0.12] border border-white/25"
                          : "hover:bg-white/[0.05] active:bg-white/[0.08] border border-transparent"
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          isActive ? "icon-gradient-fill text-white" : "bg-white/[0.08] text-white/70"
                        }`}
                      >
                        {(item.p.name[0] ?? "?").toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="text-[13px] text-white/95 truncate">{item.p.name}</div>
                        <div className="text-[11px] text-white/40 truncate mt-0.5">
                          {"defaultModel" in item.p && item.p.defaultModel
                            ? item.p.defaultModel
                            : "baseURL" in item.p && item.p.baseURL
                            ? item.p.baseURL
                            : "—"}
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
            </div>
          ))}
          <button
            onClick={() => setShowCustomDialog(true)}
            className="w-full px-3 py-3 rounded-xl border border-dashed border-white/20 text-[13px] text-white/70 hover:border-white/35 hover:text-white/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="icon-gradient">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            {t.llm.addCustom}
          </button>
        </div>
      )}

      {/* Config accordions (only when not picking) */}
      {!showPicker && (
        <div className="glass-panel rounded-2xl px-4 py-1">
          <Accordion title={t.llm.model} defaultOpen>
            <ModelPicker
              settings={settings}
              onChange={onChange}
              onWarnAnthropic={() => {
                if (!showAnthropicWarn) return;
                toast.show({
                  kind: "warn",
                  title: t.llm.anthropicWarnTitle,
                  body: t.llm.anthropicWarnBody,
                }, 7000);
              }}
            />
          </Accordion>

          <Accordion title={t.llm.apiKey}>
            <input
              type="password"
              autoComplete="off"
              value={settings.apiKey}
              onChange={(e) => onChange({ ...settings, apiKey: e.target.value })}
              placeholder="sk-…"
              className="input-dark w-full px-3.5 py-2.5 rounded-xl text-[13px]"
            />
            {provider.apiKeyHint && (
              <div className="text-[12px] text-white/45 mt-2.5 leading-relaxed">
                {provider.apiKeyHint}
              </div>
            )}
          </Accordion>

          <Accordion title={t.llm.baseURL} badge={provider.customBaseURL ? undefined : "default"}>
            <input
              type="text"
              value={settings.baseURL}
              onChange={(e) => onChange({ ...settings, baseURL: e.target.value })}
              placeholder={provider.baseURL || t.llm.baseURLPlaceholder}
              disabled={!provider.customBaseURL}
              className="input-dark w-full px-3.5 py-2.5 rounded-xl text-[13px] disabled:opacity-50"
            />
          </Accordion>
        </div>
      )}

      {showCustomDialog && (
        <CustomProviderDialog
          kind="llm"
          onClose={() => setShowCustomDialog(false)}
          onSaved={() => {
            setShowCustomDialog(false);
            toast.show({ kind: "success", title: t.custom.save });
          }}
        />
      )}
    </div>
  );
}

function ModelPicker({
  settings,
  onChange,
  onWarnAnthropic,
}: {
  settings: LLMSettings;
  onChange: (s: LLMSettings) => void;
  onWarnAnthropic: () => void;
}) {
  const { t } = useI18n();
  const { provider } = findProviderWithCustom(settings.providerId);
  const presets = provider.models;

  const [open, setOpen] = useState(false);
  const value = settings.model || provider.defaultModel || "";

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl input-dark text-left"
      >
        <span className={`text-[13px] truncate ${value ? "text-white/95" : "text-white/40"}`}>
          {value || t.llm.noModelPicked}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          className={`flex-shrink-0 text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 space-y-1 animate-slide-in-up">
          {presets.length > 0 && (
            <div className="text-[11px] font-bold uppercase tracking-wider text-white/40 px-1 mb-1.5">
              {t.llm.presets}
            </div>
          )}
          {presets.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onChange({ ...settings, model: m.id });
                setOpen(false);
                onWarnAnthropic();
              }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-left ${
                settings.model === m.id
                  ? "bg-white/[0.12]"
                  : "hover:bg-white/[0.05] active:bg-white/[0.08]"
              }`}
            >
              <div className="min-w-0">
                <div className="text-[13px] text-white/95 truncate">{m.label}</div>
                {m.hint && <div className="text-[11px] text-white/40 truncate">{m.hint}</div>}
              </div>
              {settings.model === m.id && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="icon-gradient flex-shrink-0">
                  <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ))}
          <div className="pt-3 border-t border-white/8 mt-2">
            <input
              type="text"
              value={settings.model}
              onChange={(e) => onChange({ ...settings, model: e.target.value })}
              onFocus={onWarnAnthropic}
              placeholder={t.llm.modelPlaceholder}
              className="input-dark w-full px-3.5 py-2.5 rounded-xl text-[13px]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface CustomProviderDialogProps {
  kind: "llm" | "tts";
  onClose: () => void;
  onSaved: () => void;
  existing?: CustomProvider;
}

export function CustomProviderDialog({ kind, onClose, onSaved, existing }: CustomProviderDialogProps) {
  const { t } = useI18n();
  const llm = useCustomLLM();
  const tts = useCustomTTS();
  const store = kind === "llm" ? llm : tts;
  const toast = useToast();

  const [name, setName] = useState(existing?.name ?? "");
  const [protocol, setProtocol] = useState<CustomProtocol>(
    existing?.protocol ?? "openai"
  );
  const [baseURL, setBaseURL] = useState(existing?.baseURL ?? "");
  const [defaultModel, setDefaultModel] = useState(existing?.defaultModel ?? "");

  const submit = () => {
    if (!name.trim() || !baseURL.trim()) {
      toast.show({ kind: "error", title: t.custom.nameRequired });
      return;
    }
    if (existing) {
      store.update(existing.id, { name, protocol, baseURL, defaultModel });
      onSaved();
      return;
    }
    const res = store.add({ name, protocol, baseURL, defaultModel });
    if (!res.ok) {
      if (res.reason === "limit") {
        toast.show({ kind: "error", title: t.custom.limitReached });
      }
      return;
    }
    onSaved();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center sm:justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md glass-strong rounded-t-2xl sm:rounded-2xl p-5 animate-slide-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white/95">{t.custom.title}</h3>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10"
            aria-label="close"
          >
            ×
          </button>
        </div>

        <div className="space-y-3">
          <Field label={t.custom.name}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.custom.namePlaceholder}
              className="input-dark w-full px-3.5 py-2.5 rounded-xl text-sm"
            />
          </Field>

          <Field label={t.custom.protocol}>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(t.custom.protocols) as CustomProtocol[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setProtocol(p)}
                  className={`py-2 px-2 rounded-lg text-xs font-semibold transition-all ${
                    protocol === p
                      ? "icon-gradient-fill text-white"
                      : "bg-white/5 text-white/70 hover:bg-white/10"
                  }`}
                >
                  {t.custom.protocols[p]}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t.custom.baseURL}>
            <input
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder="https://api.example.com"
              className="input-dark w-full px-3.5 py-2.5 rounded-xl text-sm"
            />
            {protocol === "openai" && (
              <div className="text-[10px] text-white/40 mt-1.5">{t.custom.baseURLHint}</div>
            )}
          </Field>

          <Field label={t.custom.defaultModel}>
            <input
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              placeholder="my-model"
              className="input-dark w-full px-3.5 py-2.5 rounded-xl text-sm"
            />
            <div className="text-[10px] text-white/40 mt-1.5">{t.custom.modelHint}</div>
          </Field>
        </div>

        <div className="mt-5 flex gap-2 justify-end">
          <button onClick={onClose} className="btn-ghost px-4 py-2 rounded-lg text-sm font-semibold">
            {t.custom.cancel}
          </button>
          <button onClick={submit} className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold">
            {t.custom.save}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-white/50 mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}
