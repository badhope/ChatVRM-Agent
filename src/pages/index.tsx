import { Viewer } from "../features/vrmViewer/viewer";
import { ViewerContext } from "../features/vrmViewer/viewerContext";
import { MessageInputContainer } from "../components/messageInputContainer";
import { Introduction } from "../components/introduction";
import { Menu } from "../components/menu";
import VrmViewer from "../components/vrmViewer";
import { VrmStoreProvider } from "@/features/messages/vrmStoreContext";
import { generateResponse } from "@/features/messages/generateResponse";
import { useCallback, useContext, useEffect, useState } from "react";
import { SYSTEM_PROMPT } from "@/features/constants/systemPromptConstants";
import { type Message } from "@/features/messages/messages";
import {
  KoeiroParam,
  DEFAULT_PARAM,
} from "@/features/constants/koeiroParam";
import { loadVrmFromLocalStorage } from "@/features/vrmViewer/localStorage";
import { type Screenplay, splitSentence, textsToScreenplay } from "@/features/messages/messages";
import { speakCharacter } from "@/features/messages/speakCharacter";
import { streamChat } from "@/features/llm/llmChat";
import type { LLMSettings } from "@/features/llm/types";
import type { TTSSettings } from "@/features/tts/types";
import { loadLLMSettings, saveLLMSettings } from "@/features/llm/storage";
import { loadTTSSettings, saveTTSSettings } from "@/features/tts/storage";
import { useI18n } from "@/features/i18n/i18nContext";

export default function Home() {
  const { viewer } = useContext(ViewerContext);
  const { t } = useI18n();

  const [systemPrompt, setSystemPrompt] = useState(SYSTEM_PROMPT);
  const [chatLog, setChatLog] = useState<Message[]>([]);
  const [assistantMessage, setAssistantMessage] = useState("");
  const [koeiroParam, setKoeiroParam] = useState<KoeiroParam>(DEFAULT_PARAM);
  const [isProcessing, setIsProcessing] = useState(false);

  // LLM
  const [llmSettings, setLlmSettings] = useState<LLMSettings>(loadLLMSettings);

  // TTS
  const [ttsSettings, setTtsSettings] = useState<TTSSettings>(loadTTSSettings);

  // ---- persist to localStorage ----
  useEffect(() => {
    saveLLMSettings(llmSettings);
  }, [llmSettings]);
  useEffect(() => {
    saveTTSSettings(ttsSettings);
  }, [ttsSettings]);

  const [showIntroduction, setShowIntroduction] = useState(false);

  // ------------------ handlers ------------------
  const handleChangeChatLog = useCallback(
    (targetIndex: number, text: string) => {
      setChatLog((prev) => {
        const newChatLog = prev.map((v, i) =>
          i === targetIndex ? { role: v.role, content: text } : v
        );
        return newChatLog;
      });
    },
    []
  );

  const handleSendChat = useCallback(
    async (message: string) => {
      if (isProcessing || !message.trim()) return;
      if (!llmSettings.apiKey.trim()) {
        setAssistantMessage(t.errors.apiKeyNotSet);
        return;
      }

      setIsProcessing(true);
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
          await handleSpeakAi(
            screenplay,
            isFirst ? () => (isFirst = false) : undefined,
            isLast ? () => setIsProcessing(false) : undefined
          );
        }
      } catch (err: unknown) {
        setAssistantMessage(
          err instanceof Error ? err.message : "Stream error"
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, chatLog, systemPrompt, llmSettings, koeiroParam, t.errors.apiKeyNotSet]
  );

  const handleSpeakAi = useCallback(
    async (
      screenplay: Screenplay,
      onStart?: () => void,
      onEnd?: () => void
    ) => {
      speakCharacter(
        screenplay,
        viewer,
        ttsSettings,
        onStart,
        onEnd,
        (err) => {
          setAssistantMessage(
            t.errors.ttsFailed ? `${t.errors.ttsFailed}: ${err}` : `[TTS error] ${err}`
          );
        }
      );
    },
    [viewer, ttsSettings, t.errors.ttsFailed]
  );

  // Load VRM from local storage on mount.
  useEffect(() => {
    const blobUrl = loadVrmFromLocalStorage();
    if (blobUrl) {
      viewer.loadVrm(blobUrl);
    }
  }, [viewer]);

  return (
    <div className="font-M_PLUS_2">
      {showIntroduction && <Introduction />}
      <VrmViewer />
      <Menu
        llmSettings={llmSettings}
        onChangeLlmSettings={setLlmSettings}
        ttsSettings={ttsSettings}
        onChangeTtsSettings={setTtsSettings}
        systemPrompt={systemPrompt}
        chatLog={chatLog}
        koeiroParam={koeiroParam}
        assistantMessage={assistantMessage}
        koeiromapKey=""
        onChangeSystemPrompt={setSystemPrompt}
        onChangeChatLog={handleChangeChatLog}
        onChangeKoeiromapParam={setKoeiroParam}
        handleClickResetChatLog={() => setChatLog([])}
        handleClickResetSystemPrompt={() => setSystemPrompt(SYSTEM_PROMPT)}
        onChangeKoeiromapKey={() => {}}
      />
      <MessageInputContainer
        isChatProcessing={isProcessing}
        onChatProcessStart={handleSendChat}
      />
      {viewer && <VrmStoreProvider viewer={viewer} />}
    </div>
  );
}