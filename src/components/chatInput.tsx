import { useState, useRef, useEffect } from "react";
import { useI18n } from "@/features/i18n/i18nContext";

interface ChatInputProps {
  onSend: (text: string) => void;
  isProcessing: boolean;
  onStop?: () => void;
}

export function ChatInput({ onSend, isProcessing, onStop }: ChatInputProps) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = () => {
    const v = text.trim();
    if (!v || isProcessing) return;
    onSend(v);
    setText("");
    inputRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // Mock mic toggle — actual speech recognition not wired in this pass
  const toggleMic = () => {
    setRecording((v) => !v);
    if (!recording) {
      setTimeout(() => setRecording(false), 4000);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 px-3 sm:px-5 pb-3 sm:pb-4 pointer-events-none">
      <div className="max-w-3xl mx-auto pointer-events-auto">
        <div
          className={`glass rounded-2xl flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 transition-all ${
            recording ? "ring-2 ring-rose-400/50 shadow-lg shadow-rose-500/10" : ""
          }`}
        >
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            disabled={isProcessing}
            placeholder={recording ? t.chatInput.recording : t.chatInput.placeholder}
            className="flex-1 min-w-0 bg-transparent outline-none text-sm sm:text-base text-white/95 placeholder:text-white/40 px-1.5 sm:px-2 py-1.5 disabled:opacity-50"
          />

          <button
            onClick={toggleMic}
            className={`flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all active:scale-90 ${
              recording
                ? "bg-rose-500/30 text-rose-200"
                : "text-white/60 hover:text-white hover:bg-white/10"
            }`}
            aria-label="mic"
          >
            {recording ? <VoiceOrb /> : <MicIcon />}
          </button>

          {isProcessing ? (
            <button
              onClick={onStop}
              className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-rose-500/80 hover:bg-rose-500 text-white transition-all active:scale-90"
              aria-label="stop"
            >
              <StopIcon />
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!text.trim()}
              className={`flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                text.trim()
                  ? "icon-gradient-fill text-white shadow-lg shadow-purple-500/20"
                  : "bg-white/5 text-white/30"
              }`}
              aria-label="send"
            >
              <SendIcon />
            </button>
          )}
        </div>
        <div className="text-center text-[10px] sm:text-[11px] text-white/30 mt-1.5 select-none">
          {isProcessing ? t.chatInput.thinking + "…" : "VRoid"}
        </div>
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="3" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 12l14-7-5 7 5 7-14-7z"
        fill="currentColor"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function VoiceOrb() {
  return (
    <div className="flex items-end gap-0.5 h-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="w-0.5 bg-rose-300 rounded-full"
          style={{
            height: "100%",
            transformOrigin: "bottom",
            animation: `wave-bar 0.${4 + i * 2}s ease-in-out infinite`,
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}
