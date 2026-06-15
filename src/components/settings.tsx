import React, { useCallback, useState } from "react";
import { IconButton } from "./iconButton";
import { TextButton } from "./textButton";
import { Message } from "@/features/messages/messages";
import {
  KoeiroParam,
  PRESET_A,
  PRESET_B,
  PRESET_C,
  PRESET_D,
} from "@/features/constants/koeiroParam";
import { Link } from "./link";
import { useI18n } from "@/features/i18n/i18nContext";
import type { LLMSettings } from "@/features/llm/types";
import { LLM_PROVIDERS, findProvider } from "@/features/llm/providers";
import { streamChat } from "@/features/llm/llmChat";
import type { TTSSettings } from "@/features/tts/types";
import { TTS_PROVIDERS, findTTSProvider } from "@/features/tts/providers";
import { synthesizeSpeech } from "@/features/tts/tts";

type Props = {
  llmSettings: LLMSettings;
  ttsSettings: TTSSettings;
  systemPrompt: string;
  chatLog: Message[];
  koeiroParam: KoeiroParam;
  koeiromapKey: string;
  onClickClose: () => void;
  onChangeLlmSettings: (settings: LLMSettings) => void;
  onChangeTtsSettings: (settings: TTSSettings) => void;
  onChangeSystemPrompt: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onChangeChatLog: (index: number, text: string) => void;
  onChangeKoeiroParam: (x: number, y: number) => void;
  onClickOpenVrmFile: () => void;
  onClickResetChatLog: () => void;
  onClickResetSystemPrompt: () => void;
  onChangeKoeiromapKey: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

type TestState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

export const Settings = ({
  llmSettings,
  ttsSettings,
  chatLog,
  systemPrompt,
  koeiroParam,
  koeiromapKey,
  onClickClose,
  onChangeSystemPrompt,
  onChangeLlmSettings,
  onChangeTtsSettings,
  onChangeChatLog,
  onChangeKoeiroParam,
  onClickOpenVrmFile,
  onClickResetChatLog,
  onClickResetSystemPrompt,
  onChangeKoeiromapKey,
}: Props) => {
  const { t, language, setLanguage } = useI18n();
  const [testState, setTestState] = useState<TestState>({ kind: "idle" });
  const [ttsTestState, setTtsTestState] = useState<TestState>({
    kind: "idle",
  });

  const provider = findProvider(llmSettings.providerId);
  const showBaseURL = provider.customBaseURL || provider.id === "custom";

  const ttsProvider = findTTSProvider(ttsSettings.providerId);
  const ttsShowBaseURL =
    ttsProvider.customBaseURL || ttsProvider.id === "custom";

  const handleChangeProvider = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const next = findProvider(event.target.value);
      onChangeLlmSettings({
        providerId: next.id,
        model: next.defaultModel,
        baseURL: next.baseURL,
        apiKey: llmSettings.apiKey,
      });
      setTestState({ kind: "idle" });
    },
    [llmSettings.apiKey, onChangeLlmSettings]
  );

  const handleChangeModel = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangeLlmSettings({ ...llmSettings, model: event.target.value });
      setTestState({ kind: "idle" });
    },
    [llmSettings, onChangeLlmSettings]
  );

  const handleChangeBaseURL = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangeLlmSettings({ ...llmSettings, baseURL: event.target.value });
      setTestState({ kind: "idle" });
    },
    [llmSettings, onChangeLlmSettings]
  );

  const handleChangeApiKey = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangeLlmSettings({ ...llmSettings, apiKey: event.target.value });
      setTestState({ kind: "idle" });
    },
    [llmSettings, onChangeLlmSettings]
  );

  const handleTestConnection = useCallback(async () => {
    setTestState({ kind: "running" });
    let received = "";
    let done = false;
    let errorMsg: string | undefined;
    try {
      await streamChat(
        llmSettings,
        [{ role: "user", content: "ping" }],
        (chunk) => {
          if (chunk.type === "text") {
            received += chunk.text;
          } else if (chunk.type === "done") {
            done = true;
            if (chunk.reason === "error") {
              errorMsg = chunk.error;
            }
          }
        }
      );
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
    if (errorMsg) {
      setTestState({ kind: "error", message: errorMsg });
    } else if (!done) {
      setTestState({
        kind: "error",
        message: t.settings.testFailed,
      });
    } else {
      setTestState({
        kind: "ok",
        message: `${t.settings.testOk} (${received.length} ${t.settings.testChars})`,
      });
    }
  }, [llmSettings, t.settings.testOk, t.settings.testFailed, t.settings.testChars]);

  const handleChangeTtsProvider = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const next = findTTSProvider(event.target.value);
      onChangeTtsSettings({
        ...ttsSettings,
        providerId: next.id,
        voice: next.defaultVoice,
        baseURL: next.baseURL,
        apiKey: "",
      });
      setTtsTestState({ kind: "idle" });
    },
    [ttsSettings, onChangeTtsSettings]
  );

  const handleChangeTtsVoice = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      onChangeTtsSettings({ ...ttsSettings, voice: event.target.value });
      setTtsTestState({ kind: "idle" });
    },
    [ttsSettings, onChangeTtsSettings]
  );

  const handleChangeTtsModel = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangeTtsSettings({ ...ttsSettings, model: event.target.value });
      setTtsTestState({ kind: "idle" });
    },
    [ttsSettings, onChangeTtsSettings]
  );

  const handleChangeTtsBaseURL = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangeTtsSettings({ ...ttsSettings, baseURL: event.target.value });
      setTtsTestState({ kind: "idle" });
    },
    [ttsSettings, onChangeTtsSettings]
  );

  const handleChangeTtsApiKey = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangeTtsSettings({ ...ttsSettings, apiKey: event.target.value });
      setTtsTestState({ kind: "idle" });
    },
    [ttsSettings, onChangeTtsSettings]
  );

  const handleTestTts = useCallback(async () => {
    setTtsTestState({ kind: "running" });
    try {
      const result = await synthesizeSpeech(ttsSettings, {
        text: "Hello! This is a test of the text-to-speech engine.",
        voice: ttsSettings.voice,
        model: ttsSettings.model,
      });
      // Play the audio once to confirm the bytes are valid.
      const audio = new Audio();
      audio.src = URL.createObjectURL(
        new Blob([result.audio], { type: result.mime })
      );
      try {
        await audio.play();
      } catch {
        /* user-gesture / autoplay — not a failure */
      }
      setTtsTestState({
        kind: "ok",
        message: `${t.settings.testOk} (${result.audio.byteLength} B)`,
      });
    } catch (e) {
      setTtsTestState({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [ttsSettings, t.settings.testOk]);

  return (
    <div className="absolute z-40 w-full h-full bg-white/80 backdrop-blur ">
      <div className="absolute m-4 sm:m-24">
        <IconButton
          iconName="24/Close"
          isProcessing={false}
          onClick={onClickClose}
        ></IconButton>
      </div>
      <div className="max-h-full overflow-auto">
        <div className="text-text1 max-w-3xl mx-auto px-4 sm:px-24 py-16 sm:py-64 ">
          <div className="my-6 sm:my-24 typography-32 font-bold">{t.settings.title}</div>

          {/* Language Selection */}
          <div className="my-4 sm:my-24">
            <div className="my-4 sm:my-16 typography-20 font-bold">{t.settings.language}</div>
            <div className="flex gap-4">
              <button
                onClick={() => setLanguage("en")}
                className={`px-4 py-2 rounded-8 ${
                  language === "en"
                    ? "bg-secondary text-white"
                    : "bg-surface1 hover:bg-surface1-hover"
                }`}
              >
                English
              </button>
              <button
                onClick={() => setLanguage("zh")}
                className={`px-4 py-2 rounded-8 ${
                  language === "zh"
                    ? "bg-secondary text-white"
                    : "bg-surface1 hover:bg-surface1-hover"
                }`}
              >
                中文
              </button>
            </div>
          </div>

          {/* LLM Provider */}
          <div className="my-6 sm:my-24">
            <div className="my-4 sm:my-16 typography-20 font-bold">
              {t.settings.llmProvider}
            </div>
            <select
              className="px-4 sm:px-16 py-2 sm:py-8 w-full bg-surface1 hover:bg-surface1-hover rounded-8 text-sm sm:text-base"
              value={llmSettings.providerId}
              onChange={handleChangeProvider}
            >
              {LLM_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.region === "china" ? " · CN" : p.region === "local" ? " · Local" : ""}
                </option>
              ))}
            </select>
            {provider.notes && (
              <div className="my-2 sm:my-4 text-sm sm:text-base text-text2">
                {provider.notes}
              </div>
            )}
            {provider.docsURL && (
              <div className="text-sm sm:text-base">
                <Link url={provider.docsURL} label={t.settings.docs} />
              </div>
            )}
          </div>

          {/* Model */}
          <div className="my-6 sm:my-24">
            <div className="my-4 sm:my-16 typography-20 font-bold">
              {t.settings.llmModel}
            </div>
            <input
              list="llm-model-list"
              className="text-ellipsis px-4 sm:px-16 py-2 sm:py-8 w-full bg-surface1 hover:bg-surface1-hover rounded-8 text-sm sm:text-base"
              type="text"
              placeholder={provider.defaultModel}
              value={llmSettings.model}
              onChange={handleChangeModel}
            />
            {provider.models.length > 0 && (
              <datalist id="llm-model-list">
                {provider.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.hint ? ` — ${m.hint}` : ""}
                  </option>
                ))}
              </datalist>
            )}
          </div>

          {/* Base URL */}
          {showBaseURL && (
            <div className="my-6 sm:my-24">
              <div className="my-4 sm:my-16 typography-20 font-bold">
                {t.settings.llmBaseURL}
              </div>
              <input
                className="text-ellipsis px-4 sm:px-16 py-2 sm:py-8 w-full bg-surface1 hover:bg-surface1-hover rounded-8 text-sm sm:text-base"
                type="text"
                placeholder={provider.baseURL}
                value={llmSettings.baseURL}
                onChange={handleChangeBaseURL}
              />
            </div>
          )}

          {/* API Key */}
          <div className="my-6 sm:my-24">
            <div className="my-4 sm:my-16 typography-20 font-bold">
              {t.settings.llmApiKey}
            </div>
            <input
              className="text-ellipsis px-4 sm:px-16 py-2 sm:py-8 w-full bg-surface1 hover:bg-surface1-hover rounded-8 text-sm sm:text-base"
              type="password"
              autoComplete="off"
              placeholder="sk-…"
              value={llmSettings.apiKey}
              onChange={handleChangeApiKey}
            />
            {provider.apiKeyHint && (
              <div className="my-2 sm:my-4 text-sm sm:text-base text-text2">
                {provider.apiKeyHint}
              </div>
            )}
            <div className="my-2 sm:my-8 flex items-center gap-2 sm:gap-4 flex-wrap">
              <TextButton
                onClick={handleTestConnection}
                disabled={testState.kind === "running"}
              >
                {testState.kind === "running"
                  ? t.settings.testing
                  : t.settings.testConnection}
              </TextButton>
              {testState.kind === "ok" && (
                <span className="text-sm sm:text-base text-green-700">
                  {testState.message}
                </span>
              )}
              {testState.kind === "error" && (
                <span className="text-sm sm:text-base text-red-700 break-all">
                  {testState.message}
                </span>
              )}
            </div>
          </div>

          {/* Legacy OpenAI notice kept in case old users want to know */}
          <div className="my-6 sm:my-24">
            <div className="my-4 sm:my-16 text-sm sm:text-base text-text2">
              {t.settings.llmNotice}
            </div>
          </div>

          <div className="my-10 sm:my-40">
            <div className="my-4 sm:my-16 typography-20 font-bold">
              {t.settings.characterModel}
            </div>
            <div className="my-2 sm:my-8">
              <TextButton onClick={onClickOpenVrmFile}>{t.settings.openVrm}</TextButton>
            </div>
          </div>
          <div className="my-10 sm:my-40">
            <div className="my-2 sm:my-8">
              <div className="my-4 sm:my-16 typography-20 font-bold">
                {t.settings.characterSettings}
              </div>
              <TextButton onClick={onClickResetSystemPrompt}>
                {t.settings.resetCharacterSettings}
              </TextButton>
            </div>

            <textarea
              value={systemPrompt}
              onChange={onChangeSystemPrompt}
              className="px-4 sm:px-16 py-2 sm:py-8 bg-surface1 hover:bg-surface1-hover h-40 sm:h-168 rounded-8 w-full text-sm sm:text-base"
            ></textarea>
          </div>
          {/* TTS Provider */}
          <div className="my-10 sm:my-40">
            <div className="my-4 sm:my-16 typography-20 font-bold">
              {t.settings.voiceAdjustment}
            </div>
            <div className="my-2 sm:my-8">
              <div className="my-2 sm:my-4 typography-16 font-bold">
                {t.settings.ttsProvider}
              </div>
              <select
                className="px-4 sm:px-16 py-2 sm:py-8 w-full bg-surface1 hover:bg-surface1-hover rounded-8 text-sm sm:text-base"
                value={ttsSettings.providerId}
                onChange={handleChangeTtsProvider}
              >
                {TTS_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {ttsProvider.notes && (
                <div className="my-2 sm:my-4 text-sm sm:text-base text-text2">
                  {ttsProvider.notes}
                </div>
              )}
              {ttsProvider.docsURL && (
                <div className="text-sm sm:text-base">
                  <Link url={ttsProvider.docsURL} label={t.settings.docs} />
                </div>
              )}
            </div>

            <div className="my-2 sm:my-8">
              <div className="my-2 sm:my-4 typography-16 font-bold">
                {t.settings.ttsVoice}
              </div>
              <select
                className="px-4 sm:px-16 py-2 sm:py-8 w-full bg-surface1 hover:bg-surface1-hover rounded-8 text-sm sm:text-base"
                value={ttsSettings.voice}
                onChange={handleChangeTtsVoice}
              >
                {ttsProvider.voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            {ttsProvider.protocol === "openai-tts" && (
              <div className="my-2 sm:my-8">
                <div className="my-2 sm:my-4 typography-16 font-bold">
                  {t.settings.ttsModel}
                </div>
                <input
                  className="text-ellipsis px-4 sm:px-16 py-2 sm:py-8 w-full bg-surface1 hover:bg-surface1-hover rounded-8 text-sm sm:text-base"
                  type="text"
                  placeholder="tts-1"
                  value={ttsSettings.model ?? ""}
                  onChange={handleChangeTtsModel}
                />
              </div>
            )}

            {ttsShowBaseURL && (
              <div className="my-2 sm:my-8">
                <div className="my-2 sm:my-4 typography-16 font-bold">
                  {t.settings.ttsBaseURL}
                </div>
                <input
                  className="text-ellipsis px-4 sm:px-16 py-2 sm:py-8 w-full bg-surface1 hover:bg-surface1-hover rounded-8 text-sm sm:text-base"
                  type="text"
                  placeholder={ttsProvider.baseURL}
                  value={ttsSettings.baseURL}
                  onChange={handleChangeTtsBaseURL}
                />
              </div>
            )}

            {ttsProvider.protocol !== "edge" && (
              <div className="my-2 sm:my-8">
                <div className="my-2 sm:my-4 typography-16 font-bold">
                  {t.settings.ttsApiKey}
                </div>
                <input
                  className="text-ellipsis px-4 sm:px-16 py-2 sm:py-8 w-full bg-surface1 hover:bg-surface1-hover rounded-8 text-sm sm:text-base"
                  type="password"
                  autoComplete="off"
                  placeholder="..."
                  value={ttsSettings.apiKey}
                  onChange={handleChangeTtsApiKey}
                />
                {ttsProvider.apiKeyHint && (
                  <div className="my-2 sm:my-4 text-sm sm:text-base text-text2">
                    {ttsProvider.apiKeyHint}
                  </div>
                )}
                <div className="my-2 sm:my-8 flex items-center gap-2 sm:gap-4 flex-wrap">
                  <TextButton
                    onClick={handleTestTts}
                    disabled={ttsTestState.kind === "running"}
                  >
                    {ttsTestState.kind === "running"
                      ? t.settings.testing
                      : t.settings.testConnection}
                  </TextButton>
                  {ttsTestState.kind === "ok" && (
                    <span className="text-sm sm:text-base text-green-700">
                      {ttsTestState.message}
                    </span>
                  )}
                  {ttsTestState.kind === "error" && (
                    <span className="text-sm sm:text-base text-red-700 break-all">
                      {ttsTestState.message}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="my-2 sm:my-8 text-sm sm:text-base text-text2">
              {t.settings.ttsNotice}
            </div>

            {/* Legacy Koeiromap X/Y sliders — only meaningful for the
                Koeiromap provider. Hidden for other providers. */}
            {ttsProvider.protocol === "koeiromap" && (
              <>
                <div className="mt-4 sm:mt-16 font-bold">{t.settings.preset}</div>
                <div className="my-2 sm:my-8 grid grid-cols-2 gap-[8px]">
                  <TextButton
                    onClick={() =>
                      onChangeKoeiroParam(PRESET_A.speakerX, PRESET_A.speakerY)
                    }
                  >
                    {t.settings.cute}
                  </TextButton>
                  <TextButton
                    onClick={() =>
                      onChangeKoeiroParam(PRESET_B.speakerX, PRESET_B.speakerY)
                    }
                  >
                    {t.settings.energetic}
                  </TextButton>
                  <TextButton
                    onClick={() =>
                      onChangeKoeiroParam(PRESET_C.speakerX, PRESET_C.speakerY)
                    }
                  >
                    {t.settings.cool}
                  </TextButton>
                  <TextButton
                    onClick={() =>
                      onChangeKoeiroParam(PRESET_D.speakerX, PRESET_D.speakerY)
                    }
                  >
                    {t.settings.mature}
                  </TextButton>
                </div>
                <div className="my-6 sm:my-24">
                  <div className="select-none">x : {koeiroParam.speakerX}</div>
                  <input
                    type="range"
                    min={-10}
                    max={10}
                    step={0.001}
                    value={koeiroParam.speakerX}
                    className="mt-2 sm:mt-8 mb-4 sm:mb-16 input-range"
                    onChange={(e) => {
                      onChangeKoeiroParam(
                        Number(e.target.value),
                        koeiroParam.speakerY
                      );
                    }}
                  ></input>
                  <div className="select-none">y : {koeiroParam.speakerY}</div>
                  <input
                    type="range"
                    min={-10}
                    max={10}
                    step={0.001}
                    value={koeiroParam.speakerY}
                    className="mt-2 sm:mt-8 mb-4 sm:mb-16 input-range"
                    onChange={(e) => {
                      onChangeKoeiroParam(
                        koeiroParam.speakerX,
                        Number(e.target.value)
                      );
                    }}
                  ></input>
                </div>
                {/* Legacy koeiromap key field — kept for the free
                    endpoint that accepts the key in the body. */}
                <div className="mt-4 sm:mt-16 font-bold">
                  {t.settings.apiKey} ({t.settings.legacyKeyHint || "Koeiromap"})
                </div>
                <div className="mt-2 sm:mt-8">
                  <input
                    className="text-ellipsis px-4 sm:px-16 py-2 sm:py-8 w-col-span-2 bg-surface1 hover:bg-surface1-hover rounded-8"
                    type="text"
                    placeholder="..."
                    value={koeiromapKey}
                    onChange={onChangeKoeiromapKey}
                  />
                </div>
                <div className="text-sm sm:text-base my-2 sm:my-4">
                  {t.settings.koeiromapDescription}
                  <Link
                    url="https://koemotion.rinna.co.jp"
                    label="https://koemotion.rinna.co.jp"
                  />
                </div>
              </>
            )}
          </div>
          {chatLog.length > 0 && (
            <div className="my-10 sm:my-40">
              <div className="my-2 sm:my-8 grid-cols-2">
                <div className="my-4 sm:my-16 typography-20 font-bold">{t.settings.chatHistory}</div>
                <TextButton onClick={onClickResetChatLog}>
                  {t.settings.resetChatHistory}
                </TextButton>
              </div>
              <div className="my-2 sm:my-8">
                {chatLog.map((value, index) => {
                  return (
                    <div
                      key={index}
                      className="my-2 sm:my-8 grid grid-flow-col grid-cols-[min-content_1fr] gap-x-4"
                    >
                      <div className="w-[64px] py-2 sm:py-8 text-sm sm:text-base">
                        {value.role === "assistant" ? t.chatLog.character : t.chatLog.you}
                      </div>
                      <input
                        key={index}
                        className="bg-surface1 hover:bg-surface1-hover rounded-8 w-full px-4 sm:px-16 py-2 sm:py-8 text-sm sm:text-base"
                        type="text"
                        value={value.content}
                        onChange={(event) => {
                          onChangeChatLog(index, event.target.value);
                        }}
                      ></input>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
