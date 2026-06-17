import { useRef } from "react";
import { useI18n } from "@/features/i18n/i18nContext";
import { Accordion } from "./drawer";
import {
  KoeiroParam,
  DEFAULT_PARAM,
  PRESET_A,
  PRESET_B,
  PRESET_C,
  PRESET_D,
} from "@/features/constants/koeiroParam";

interface CharacterSectionProps {
  systemPrompt: string;
  onChangePrompt: (s: string) => void;
  koeiroParam: KoeiroParam;
  onChangeKoeiro: (p: KoeiroParam) => void;
  onPickVrm: (file: File) => void;
  onResetVrm: () => void;
  showVoicePos: boolean;
}

export function CharacterSection({
  systemPrompt,
  onChangePrompt,
  koeiroParam,
  onChangeKoeiro,
  onPickVrm,
  onResetVrm,
  showVoicePos,
}: CharacterSectionProps) {
  const { t, language } = useI18n();
  const isZh = language === "zh";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onPickVrm(f);
  };

  const applyPreset = (x: number, y: number) => onChangeKoeiro({ ...koeiroParam, speakerX: x, speakerY: y });
  const resetKoeiro = () => onChangeKoeiro(DEFAULT_PARAM);

  return (
    <div className="py-2 space-y-4">
      <div className="glass-panel rounded-2xl px-4 py-1">
        <Accordion title={t.character.model} defaultOpen>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) onPickVrm(f);
            }}
            className="border-2 border-dashed border-white/15 hover:border-white/30 active:bg-white/5 rounded-2xl py-6 px-4 text-center cursor-pointer transition-colors"
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="mx-auto mb-2 icon-gradient">
              <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="text-[13px] text-white/80">{t.character.dropHere}</div>
            <div className="text-[11px] text-white/40 mt-1">.vrm</div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".vrm"
            className="hidden"
            onChange={onFileChange}
          />
          <button
            onClick={onResetVrm}
            className="mt-3 text-[12px] text-white/50 hover:text-white/80 underline underline-offset-2"
          >
            {t.character.resetVRM}
          </button>
        </Accordion>

        <Accordion title={t.character.prompt} defaultOpen>
          <div className="text-[11px] text-white/45 mb-2.5 leading-relaxed">
            {t.character.promptHint}
          </div>
          <textarea
            value={systemPrompt}
            onChange={(e) => onChangePrompt(e.target.value)}
            className="input-dark w-full px-3.5 py-2.5 rounded-xl text-[13px] h-32 resize-none"
          />
          <button
            onClick={() => onChangePrompt("")}
            className="mt-3 text-[12px] text-white/50 hover:text-white/80 underline underline-offset-2"
          >
            {t.character.resetPrompt}
          </button>
        </Accordion>

        {showVoicePos && (
          <Accordion title={t.character.voicePos}>
            <div className="text-[11px] text-white/45 mb-3">{t.character.voicePosHint}</div>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { p: PRESET_A, label: isZh ? "可爱" : "Cute" },
                { p: PRESET_B, label: isZh ? "活力" : "Energetic" },
                { p: PRESET_C, label: isZh ? "帅气" : "Cool" },
                { p: PRESET_D, label: isZh ? "成熟" : "Mature" },
              ].map((preset, i) => (
                <button
                  key={i}
                  onClick={() => applyPreset(preset.p.speakerX, preset.p.speakerY)}
                  className="btn-ghost text-[12px] font-semibold py-2 rounded-lg"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="space-y-4">
              <SliderRow
                label="X"
                value={koeiroParam.speakerX}
                onChange={(v) => onChangeKoeiro({ ...koeiroParam, speakerX: v })}
              />
              <SliderRow
                label="Y"
                value={koeiroParam.speakerY}
                onChange={(v) => onChangeKoeiro({ ...koeiroParam, speakerY: v })}
              />
            </div>
            <button
              onClick={resetKoeiro}
              className="mt-4 text-[12px] text-white/50 hover:text-white/80 underline underline-offset-2"
            >
              {isZh ? "还原默认" : "Reset"}
            </button>
          </Accordion>
        )}
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-white/70 mb-1.5">
        <span className="font-semibold">{label}</span>
        <span className="font-mono">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={-10}
        max={10}
        step={0.1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="input-range"
      />
    </div>
  );
}
