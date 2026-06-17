import { useRef, useState } from "react";
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
import type { Character } from "@/features/characters/types";

interface CharacterSectionProps {
  characters: Character[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAddNew: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  systemPrompt: string;
  onChangePrompt: (s: string) => void;
  koeiroParam: KoeiroParam;
  onChangeKoeiro: (p: KoeiroParam) => void;
  onPickVrm: (file: File) => void;
  onResetVrm: () => void;
  showVoicePos: boolean;
}

export function CharacterSection({
  characters,
  activeId,
  onSelect,
  onAddNew,
  onRename,
  onDelete,
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
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onPickVrm(f);
    // reset so picking the same file twice still fires onChange
    e.target.value = "";
  };

  const applyPreset = (x: number, y: number) =>
    onChangeKoeiro({ ...koeiroParam, speakerX: x, speakerY: y });
  const resetKoeiro = () => onChangeKoeiro(DEFAULT_PARAM);

  const startRename = (c: Character) => {
    setRenamingId(c.id);
    setRenameValue(c.name);
  };
  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  };

  const handleDelete = (c: Character) => {
    if (c.builtin) return;
    if (window.confirm(t.character.deleteConfirm)) {
      onDelete(c.id);
    }
  };

  return (
    <div className="py-2 space-y-4">
      <div className="glass-panel rounded-2xl px-4 py-1">
        {/* ---- Character roster ---- */}
        <Accordion title={t.character.roster} defaultOpen>
          <div className="text-[11px] text-white/45 mb-3 leading-relaxed">
            {t.character.rosterHint}
          </div>

          <div className="space-y-2 mb-3">
            {characters.map((c) => {
              const isActive = c.id === activeId;
              const isRenaming = renamingId === c.id;
              return (
                <div
                  key={c.id}
                  className={
                    "rounded-xl border transition-colors " +
                    (isActive
                      ? "border-white/40 bg-white/10"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]")
                  }
                >
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    {/* avatar dot */}
                    <div
                      className={
                        "w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0 " +
                        (isActive
                          ? "bg-gradient-to-br from-fuchsia-400/80 to-cyan-400/80 text-white"
                          : "bg-white/10 text-white/70")
                      }
                    >
                      {c.name.slice(0, 1).toUpperCase()}
                    </div>

                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") {
                            setRenamingId(null);
                            setRenameValue("");
                          }
                        }}
                        className="input-dark flex-1 px-2 py-1 rounded-md text-[13px]"
                      />
                    ) : (
                      <button
                        onClick={() => !isActive && onSelect(c.id)}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-semibold text-white/90 truncate">
                            {c.name}
                          </span>
                          {isActive && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/15 text-white/80 shrink-0">
                              {t.character.active}
                            </span>
                          )}
                          {c.builtin && (
                            <span className="text-[10px] text-white/35 shrink-0">
                              {isZh ? "内置" : "built-in"}
                            </span>
                          )}
                        </div>
                      </button>
                    )}

                    {/* actions */}
                    {!isRenaming && (
                      <div className="flex items-center gap-1 shrink-0">
                        {!isActive && (
                          <button
                            onClick={() => onSelect(c.id)}
                            className="text-[11px] px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white/80"
                          >
                            {t.character.switchTo}
                          </button>
                        )}
                        <button
                          onClick={() => startRename(c)}
                          title={t.character.rename}
                          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/10 text-white/50 hover:text-white/80"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        {!c.builtin && (
                          <button
                            onClick={() => handleDelete(c)}
                            title={t.character.delete}
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-red-500/20 text-white/50 hover:text-red-300"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={onAddNew}
            className="w-full btn-ghost text-[12px] font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t.character.addNew}
          </button>
        </Accordion>

        {/* ---- Active character editor ---- */}
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
