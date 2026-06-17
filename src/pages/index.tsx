import { ViewerContext } from "../features/vrmViewer/viewerContext";
import VrmViewer from "../components/vrmViewer";
import { VrmStoreProvider } from "@/features/messages/vrmStoreContext";
import { generateResponse } from "@/features/messages/generateResponse";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SYSTEM_PROMPT } from "@/features/constants/systemPromptConstants";
import { type Message } from "@/features/messages/messages";
import {
  DEFAULT_PARAM,
} from "@/features/constants/koeiroParam";
import type { KoeiroParam } from "@/features/constants/koeiroParam";
import { splitSentence, textsToScreenplay } from "@/features/messages/messages";
import { speakCharacter } from "@/features/messages/speakCharacter";
import { streamChat } from "@/features/llm/llmChat";
import type { LLMSettings } from "@/features/llm/types";
import type { TTSSettings } from "@/features/tts/types";
import { loadLLMSettings, saveLLMSettings } from "@/features/llm/storage";
import { loadTTSSettings, saveTTSSettings } from "@/features/tts/storage";
import { useI18n } from "@/features/i18n/i18nContext";
import { TopBar } from "@/components/topbar";
import { AppDrawer } from "@/components/appDrawer";
import { ChatInput } from "@/components/chatInput";
import { AssistantBubble } from "@/components/assistantBubble";
import { findTTSProviderWithCustom } from "@/features/tts/providers";
import { buildUrl } from "@/utils/buildUrl";
import { useCharacters } from "@/features/characters/useCharacters";

export default function Home() {
  const { viewer } = useContext(ViewerContext);
  const { t, language } = useI18n();
  const isZh = language === "zh";

  // ---- character roster (owns systemPrompt + koeiroParam + vrmSource) ----
  const {
    ready: charactersReady,
    characters,
    activeId,
    active,
    setActiveId,
    updateActive,
    updateCharacter,
    createCharacter,
    deleteCharacter,
    setActiveVrmFile,
    resolveVrmUrl,
  } = useCharacters();

  // Derived values for the active character. These replace the old
  // standalone systemPrompt/koeiroParam useState — the source of truth
  // is now the character object, so switching characters atomically
  // swaps the prompt and voice along with the model.
  const systemPrompt = active?.systemPrompt ?? SYSTEM_PROMPT;
  const koeiroParam = active?.koeiroParam ?? DEFAULT_PARAM;

  const [chatLog, setChatLog] = useState<Message[]>([]);
  const [assistantMessage, setAssistantMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [llmSettings, setLlmSettings] = useState<LLMSettings>(loadLLMSettings);
  const [ttsSettings, setTtsSettings] = useState<TTSSettings>(loadTTSSettings);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerInitial, setDrawerInitial] = useState<"root" | "chat">("root");
  const [viewerReady, setViewerReady] = useState(false);

  // AbortController for the in-flight conversation (LLM stream + TTS queue).
  const abortRef = useRef<AbortController | null>(null);

  // ---- persist to localStorage ----
  useEffect(() => {
    saveLLMSettings(llmSettings);
  }, [llmSettings]);
  useEffect(() => {
    saveTTSSettings(ttsSettings);
  }, [ttsSettings]);

  // ---- load VRM when the active character changes (or viewer becomes ready) ----
  // We intentionally depend on activeId (not active.vrmSource) so that
  // in-place VRM swaps (handlePickVrm) don't double-load — those are
  // handled by the pick handler itself.
  useEffect(() => {
    if (!viewerReady || !viewer || !active) return;
    let cancelled = false;
    resolveVrmUrl(active.vrmSource).then((url) => {
      if (cancelled || !url || !viewer) return;
      viewer.loadVrm(url);
    });
    return () => {
      cancelled = true;
    };
  }, [activeId, viewerReady, active, viewer, resolveVrmUrl]);

  // Voice position sliders only meaningful for koeiromap-style voice.
  const { provider: ttsProvider } = useMemo(
    () => findTTSProviderWithCustom(ttsSettings.providerId),
    [ttsSettings.providerId]
  );
  const showVoicePos = ttsProvider.protocol === "koeiromap";

  // ------------------ handlers ------------------
  const handleSendChat = useCallback(
    async (message: string) => {
      if (isProcessing || !message.trim()) return;
      if (!llmSettings.apiKey.trim()) {
        setAssistantMessage(t.errors.apiKeyNotSet);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      setIsProcessing(true);
      setAssistantMessage("");
      const newLog: Message[] = [
        ...chatLog,
        { role: "user", content: message },
      ];
      setChatLog(newLog);

      try {
        const response = await generateResponse(
          systemPrompt,
          newLog.slice(-15),
          llmSettings,
          (text: string) => setAssistantMessage(text),
          streamChat,
          controller.signal
        );
        setChatLog([
          ...newLog,
          { role: "assistant", content: response },
        ]);

        const screenplays = textsToScreenplay(
          splitSentence(response),
          koeiroParam
        );
        let isFirst = true;
        let isLast = false;
        for (let i = 0; i < screenplays.length; i++) {
          if (controller.signal.aborted) break;
          if (i === screenplays.length - 1) isLast = true;
          const screenplay = screenplays[i];
          await new Promise<void>((resolve) => {
            setIsSpeaking(true);
            speakCharacter(
              screenplay,
              viewer,
              ttsSettings,
              isFirst ? () => (isFirst = false) : undefined,
              () => {
                setIsSpeaking(false);
                if (isLast) setIsProcessing(false);
                resolve();
              },
              (err) => {
                setIsSpeaking(false);
                console.warn("[TTS playback error]", err);
                resolve();
              }
            );
          });
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // keep whatever text was already streamed
        } else {
          setAssistantMessage(
            err instanceof Error ? err.message : "Stream error"
          );
        }
      } finally {
        setIsProcessing(false);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [isProcessing, chatLog, systemPrompt, llmSettings, koeiroParam, ttsSettings, t.errors.apiKeyNotSet, viewer]
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsProcessing(false);
    setIsSpeaking(false);
  }, []);

  // Pick a VRM file: load into viewer immediately for instant feedback,
  // and persist it to the active character (IndexedDB blob + metadata).
  const handlePickVrm = useCallback(
    (file: File) => {
      if (!viewer) return;
      const url = URL.createObjectURL(file);
      viewer.loadVrm(url, () => URL.revokeObjectURL(url));
      void setActiveVrmFile(file);
    },
    [viewer, setActiveVrmFile]
  );

  const handleResetVrm = useCallback(() => {
    if (!viewer || !active) return;
    viewer.loadVrm(buildUrl("/AvatarSample_B.vrm"));
    updateActive({ vrmSource: "/AvatarSample_B.vrm" });
  }, [viewer, active, updateActive]);

  const handleAddCharacter = useCallback(async () => {
    await createCharacter({
      name: isZh ? "新角色" : "New Character",
      // Seed from the current active character so the user can branch
      // off an existing persona — they can edit afterwards.
      systemPrompt: active?.systemPrompt ?? SYSTEM_PROMPT,
      koeiroParam: active?.koeiroParam ?? DEFAULT_PARAM,
      vrmSource: "/AvatarSample_B.vrm",
    });
  }, [createCharacter, active, isZh]);

  const handleRenameCharacter = useCallback(
    (id: string, name: string) => {
      updateCharacter(id, { name });
    },
    [updateCharacter]
  );

  const handleDeleteCharacter = useCallback(
    (id: string) => {
      deleteCharacter(id);
    },
    [deleteCharacter]
  );

  const handleResetAll = useCallback(() => {
    setLlmSettings(loadLLMSettings());
    setTtsSettings(loadTTSSettings());
    // Reset the active character's prompt + voice to defaults. We do
    // NOT delete user-created characters here — that's a destructive
    // action reserved for the per-character delete button.
    updateActive({ systemPrompt: SYSTEM_PROMPT, koeiroParam: DEFAULT_PARAM });
    setChatLog([]);
    setAssistantMessage("");
  }, [updateActive]);

  const openMenu = () => {
    setDrawerInitial("root");
    setDrawerOpen(true);
  };

  const openChat = () => {
    setDrawerInitial("chat");
    setDrawerOpen(true);
  };

  return (
    <div className="font_M_PLUS_2">
      <VrmViewer
        onReady={() => setViewerReady(true)}
        onVrmFile={handlePickVrm}
      />
      <TopBar
        onOpenMenu={openMenu}
        onOpenChat={openChat}
        hasMessages={chatLog.length > 0}
      />
      <AssistantBubble
        text={assistantMessage}
        isThinking={isProcessing && !assistantMessage}
        isSpeaking={isSpeaking}
      />
      <ChatInput
        onSend={handleSendChat}
        isProcessing={isProcessing}
        onStop={handleStop}
      />
      <AppDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        initialSection={drawerInitial}
        llmSettings={llmSettings}
        onChangeLlm={setLlmSettings}
        ttsSettings={ttsSettings}
        onChangeTts={setTtsSettings}
        systemPrompt={systemPrompt}
        onChangeSystemPrompt={(s) => updateActive({ systemPrompt: s })}
        koeiroParam={koeiroParam}
        onChangeKoeiro={(p: KoeiroParam) => updateActive({ koeiroParam: p })}
        messages={chatLog}
        onClearMessages={() => setChatLog([])}
        onPickVrm={handlePickVrm}
        onResetVrm={handleResetVrm}
        onResetAll={handleResetAll}
        showVoicePos={showVoicePos}
        characters={characters}
        activeCharacterId={activeId}
        onSelectCharacter={setActiveId}
        onAddCharacter={handleAddCharacter}
        onRenameCharacter={handleRenameCharacter}
        onDeleteCharacter={handleDeleteCharacter}
      />
      {viewer && <VrmStoreProvider viewer={viewer} />}
      {/* charactersReady is referenced here so the hook's initial load
          is treated as part of the render tree's lifecycle — keeps
          SSR/hydration honest even though we don't render a fallback. */}
      {charactersReady ? null : null}
    </div>
  );
}
