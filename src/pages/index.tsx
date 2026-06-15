import { useCallback, useContext, useEffect, useState } from "react";
import VrmViewer from "@/components/vrmViewer";
import { ViewerContext } from "@/features/vrmViewer/viewerContext";
import {
  Message,
  textsToScreenplay,
  Screenplay,
} from "@/features/messages/messages";
import { speakCharacter } from "@/features/messages/speakCharacter";
import { MessageInputContainer } from "@/components/messageInputContainer";
import { SYSTEM_PROMPT } from "@/features/constants/systemPromptConstants";
import { KoeiroParam, DEFAULT_PARAM } from "@/features/constants/koeiroParam";
import { streamChat } from "@/features/llm/llmChat";
import { Introduction } from "@/components/introduction";
import { Menu } from "@/components/menu";
import { GitHubLink } from "@/components/githubLink";
import { Meta } from "@/components/meta";
import { useI18n } from "@/features/i18n/i18nContext";
import { loadLLMSettings, saveLLMSettings } from "@/features/llm/storage";
import type { LLMSettings } from "@/features/llm/types";
import { loadTTSSettings, saveTTSSettings } from "@/features/tts/storage";
import type { TTSSettings } from "@/features/tts/types";

export default function Home() {
  const { viewer } = useContext(ViewerContext);
  const { t } = useI18n();

  const [systemPrompt, setSystemPrompt] = useState(SYSTEM_PROMPT);
  const [llmSettings, setLlmSettings] = useState<LLMSettings>(() =>
    loadLLMSettings()
  );
  const [ttsSettings, setTtsSettings] = useState<TTSSettings>(() =>
    loadTTSSettings()
  );
  const [koeiromapKey, setKoeiromapKey] = useState("");
  const [koeiroParam, setKoeiroParam] = useState<KoeiroParam>(DEFAULT_PARAM);
  const [chatProcessing, setChatProcessing] = useState(false);
  const [chatLog, setChatLog] = useState<Message[]>([]);
  const [assistantMessage, setAssistantMessage] = useState("");

  useEffect(() => {
    if (window.localStorage.getItem("chatVRMParams")) {
      const params = JSON.parse(
        window.localStorage.getItem("chatVRMParams") as string
      );
      setSystemPrompt(params.systemPrompt ?? SYSTEM_PROMPT);
      setKoeiroParam(params.koeiroParam ?? DEFAULT_PARAM);
      setChatLog(params.chatLog ?? []);
    }
  }, []);

  useEffect(() => {
    process.nextTick(() =>
      window.localStorage.setItem(
        "chatVRMParams",
        JSON.stringify({ systemPrompt, koeiroParam, chatLog })
      )
    );
  }, [systemPrompt, koeiroParam, chatLog]);

  // Persist LLM settings whenever they change.
  useEffect(() => {
    saveLLMSettings(llmSettings);
  }, [llmSettings]);

  // Persist TTS settings whenever they change.
  useEffect(() => {
    saveTTSSettings(ttsSettings);
  }, [ttsSettings]);

  const handleChangeChatLog = useCallback(
    (targetIndex: number, text: string) => {
      const newChatLog = chatLog.map((v: Message, i) => {
        return i === targetIndex ? { role: v.role, content: text } : v;
      });

      setChatLog(newChatLog);
    },
    [chatLog]
  );

  /**
   * Stream TTS for each screenplay line. The actual provider selection
   * happens inside `speakCharacter`, which routes through the TTS
   * abstraction layer.
   */
  const handleSpeakAi = useCallback(
    async (
      screenplay: Screenplay,
      onStart?: () => void,
      onEnd?: () => void
    ) => {
      // The legacy free Koeiromap endpoint also accepts a key in the
      // body. We forward the user-entered koeiromapKey so the free
      // endpoint can still be used if the user has not yet entered
      // an API key in the TTS panel.
      const merged: TTSSettings = {
        ...ttsSettings,
        apiKey: ttsSettings.apiKey || koeiromapKey,
      };
      speakCharacter(screenplay, viewer, merged, onStart, onEnd);
    },
    [viewer, ttsSettings, koeiromapKey]
  );

  /**
   * Send a user message to the configured LLM, stream the response,
   * and split it into sentences for TTS playback.
   */
  const handleSendChat = useCallback(
    async (text: string) => {
      if (!llmSettings.apiKey?.trim()) {
        setAssistantMessage(t.errors.apiKeyNotSet);
        return;
      }

      const newMessage = text;
      if (newMessage == null) return;

      setChatProcessing(true);
      const messageLog: Message[] = [
        ...chatLog,
        { role: "user", content: newMessage },
      ];
      setChatLog(messageLog);

      const messages: Message[] = [
        { role: "system", content: systemPrompt },
        ...messageLog,
      ];

      let receivedMessage = "";
      let aiTextLog = "";
      let tag = "";
      const sentences = new Array<string>();

      try {
        await streamChat(
          llmSettings,
          messages.map((m) => ({ role: m.role, content: m.content })),
          (chunk) => {
            if (chunk.type === "text") {
              receivedMessage += chunk.text;

              const tagMatch = receivedMessage.match(/^\[(.*?)\]/);
              if (tagMatch && tagMatch[0]) {
                tag = tagMatch[0];
                receivedMessage = receivedMessage.slice(tag.length);
              }

              const sentenceMatch = receivedMessage.match(
                /^(.+[。．！？\n]|.{10,}[、,])/
              );
              if (sentenceMatch && sentenceMatch[0]) {
                const sentence = sentenceMatch[0];
                sentences.push(sentence);
                receivedMessage = receivedMessage
                  .slice(sentence.length)
                  .trimStart();

                if (
                  !sentence.replace(
                    /^[\s\[\(\{「［（【『〈《〔｛«‹〘〚〛〙›»〕》〉』】）］」\}\)\]]+$/g,
                    ""
                  )
                ) {
                  return;
                }

                const aiText = `${tag} ${sentence}`;
                const aiTalks = textsToScreenplay([aiText], koeiroParam);
                aiTextLog += aiText;

                const currentAssistantMessage = sentences.join(" ");
                handleSpeakAi(aiTalks[0], () => {
                  setAssistantMessage(currentAssistantMessage);
                });
              }
            } else if (chunk.type === "done") {
              if (chunk.reason === "error" && chunk.error) {
                console.error("[LLM error]", chunk.error);
                setAssistantMessage(chunk.error);
              }
            }
          }
        );
      } catch (e) {
        console.error(e);
        setChatProcessing(false);
        return;
      }

      const messageLogAssistant: Message[] = [
        ...messageLog,
        { role: "assistant", content: aiTextLog },
      ];

      setChatLog(messageLogAssistant);
      setChatProcessing(false);
    },
    [
      systemPrompt,
      chatLog,
      handleSpeakAi,
      llmSettings,
      koeiroParam,
      t.errors.apiKeyNotSet,
    ]
  );

  return (
    <div className={"font-M_PLUS_2"}>
      <Meta />
      <Introduction
        openAiKey={llmSettings.apiKey}
        koeiroMapKey={koeiromapKey}
        onChangeAiKey={(v) => setLlmSettings((s) => ({ ...s, apiKey: v }))}
        onChangeKoeiromapKey={setKoeiromapKey}
      />
      <VrmViewer />
      <MessageInputContainer
        isChatProcessing={chatProcessing}
        onChatProcessStart={handleSendChat}
      />
      <Menu
        llmSettings={llmSettings}
        onChangeLlmSettings={setLlmSettings}
        ttsSettings={ttsSettings}
        onChangeTtsSettings={setTtsSettings}
        systemPrompt={systemPrompt}
        chatLog={chatLog}
        koeiroParam={koeiroParam}
        assistantMessage={assistantMessage}
        koeiromapKey={koeiromapKey}
        onChangeSystemPrompt={setSystemPrompt}
        onChangeChatLog={handleChangeChatLog}
        onChangeKoeiromapParam={setKoeiroParam}
        handleClickResetChatLog={() => setChatLog([])}
        handleClickResetSystemPrompt={() => setSystemPrompt(SYSTEM_PROMPT)}
        onChangeKoeiromapKey={setKoeiromapKey}
      />
      <GitHubLink />
    </div>
  );
}
