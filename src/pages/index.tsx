import { ViewerContext } from "../features/vrmViewer/viewerContext";
import VrmViewer from "../components/vrmViewer";
import { VrmStoreProvider } from "@/features/messages/vrmStoreContext";
import { generateResponse } from "@/features/messages/generateResponse";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { SYSTEM_PROMPT } from "@/features/constants/systemPromptConstants";
import { type Message } from "@/features/messages/messages";
import {
  KoeiroParam,
  DEFAULT_PARAM,
} from "@/features/constants/koeiroParam";
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

export default function Home() {
  const { viewer } = useContext(ViewerContext);
  const { t } = useI18n();

  const [systemPrompt, setSystemPrompt] = useState(SYSTEM_PROMPT);
  const [chatLog, setChatLog] = useState<Message[]>([]);
  const [assistantMessage, setAssistantMessage] = useState("");
  const [koeiroParam, setKoeiroParam] = useState<KoeiroParam>(DEFAULT_PARAM);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [llmSettings, setLlmSettings] = useState<LLMSettings>(loadLLMSettings);
  const [ttsSettings, setTtsSettings] = useState<TTSSettings>(loadTTSSettings);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerInitial, setDrawerInitial] = useState<"root" | "chat">("root");

  // ---- persist to localStorage ----
  useEffect(() => {
    saveLLMSettings(llmSettings);
  }, [llmSettings]);
  useEffect(() => {
    saveTTSSettings(ttsSettings);
  }, [ttsSettings]);

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
          streamChat
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
                setAssistantMessage(
                  t.errors.ttsFailed ? `${t.errors.ttsFailed}: ${err}` : `[TTS error] ${err}`
                );
                resolve();
              }
            );
          });
        }
      } catch (err: unknown) {
        setAssistantMessage(
          err instanceof Error ? err.message : "Stream error"
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, chatLog, systemPrompt, llmSettings, koeiroParam, ttsSettings, t.errors.ttsFailed, t.errors.apiKeyNotSet, viewer]
  );

  const handleStop = useCallback(() => {
    // The viewer audio chain doesn't expose a public abort hook —
    // flipping these flags stops new utterances from being enqueued
    // and tells the UI to leave the speaking state.
    setIsProcessing(false);
    setIsSpeaking(false);
  }, []);

  const handlePickVrm = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      viewer.loadVrm(url);
    },
    [viewer]
  );

  const handleResetVrm = useCallback(() => {
    viewer.loadVrm(buildUrl("/AvatarSample_B.vrm"));
  }, [viewer]);

  const handleResetAll = useCallback(() => {
    setLlmSettings(loadLLMSettings());
    setTtsSettings(loadTTSSettings());
    setSystemPrompt(SYSTEM_PROMPT);
    setKoeiroParam(DEFAULT_PARAM);
    setChatLog([]);
    setAssistantMessage("");
  }, []);

  const openMenu = () => {
    setDrawerInitial("root");
    setDrawerOpen(true);
  };

  const openChat = () => {
    setDrawerInitial("chat");
    setDrawerOpen(true);
  };

  return (
    <div className="font-M_PLUS_2">
      <VrmViewer />
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
        onChangeSystemPrompt={setSystemPrompt}
        koeiroParam={koeiroParam}
        onChangeKoeiro={setKoeiroParam}
        messages={chatLog}
        onClearMessages={() => setChatLog([])}
        onPickVrm={handlePickVrm}
        onResetVrm={handleResetVrm}
        onResetAll={handleResetAll}
        showVoicePos={showVoicePos}
      />
      {viewer && <VrmStoreProvider viewer={viewer} />}
    </div>
  );
}
