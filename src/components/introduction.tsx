import { useState, useCallback } from "react";
import { Link } from "./link";
import { useI18n } from "@/features/i18n/i18nContext";
import type { LLMSettings } from "@/features/llm/types";
import type { TTSSettings } from "@/features/tts/types";
import { findProvider } from "@/features/llm/providers";
import { findTTSProvider } from "@/features/tts/providers";

type Props = {
  llmSettings: LLMSettings;
  ttsSettings: TTSSettings;
  onChangeLlmApiKey: (key: string) => void;
  onChangeTtsApiKey: (key: string) => void;
};
export const Introduction = ({
  llmSettings,
  ttsSettings,
  onChangeLlmApiKey,
  onChangeTtsApiKey,
}: Props) => {
  const [opened, setOpened] = useState(true);
  const { t } = useI18n();

  const provider = findProvider(llmSettings.providerId);
  const ttsProvider = findTTSProvider(ttsSettings.providerId);
  const showTtsKey = ttsProvider.protocol !== "edge";

  const handleLlmApiKeyChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangeLlmApiKey(event.target.value);
    },
    [onChangeLlmApiKey]
  );

  const handleTtsApiKeyChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangeTtsApiKey(event.target.value);
    },
    [onChangeTtsApiKey]
  );

  return opened ? (
    <div className="absolute z-40 w-full h-full px-4 sm:px-24 py-8 sm:py-40 bg-black/30 font-M_PLUS_2 overflow-y-auto">
      <div className="mx-auto my-auto max-w-3xl max-h-full p-4 sm:p-24 overflow-auto bg-white rounded-16">
        <div className="my-4 sm:my-24">
          <div className="my-2 sm:my-8 font-bold typography-20 text-secondary">
            {t.introduction.title}
          </div>
          <div>{t.introduction.description}</div>
        </div>
        <div className="my-4 sm:my-24">
          <div className="my-2 sm:my-8 font-bold typography-20 text-secondary">
            {t.introduction.techTitle}
          </div>
          <div>
            {t.introduction.techDescription}
            <Link
              url="https://inside.pixiv.blog/2023/04/28/160000"
              label={t.introduction.techLink}
            />
          </div>
          <div className="my-4 sm:my-16">
            {t.introduction.githubNotice}
            <br />
            {t.introduction.repoLabel}
            <Link
              url="https://github.com/badhope/ChatVRM-Agent"
              label="https://github.com/badhope/ChatVRM-Agent"
            />
          </div>
        </div>

        <div className="my-4 sm:my-24">
          <div className="my-2 sm:my-8 font-bold typography-20 text-secondary">
            {t.introduction.usageTitle}
          </div>
          <div>{t.introduction.usageDescription}</div>
        </div>

        {/* LLM API Key */}
        <div className="my-4 sm:my-24">
          <div className="my-2 sm:my-8 font-bold typography-20 text-secondary">
            {provider.name} API Key
          </div>
          <input
            type="password"
            autoComplete="off"
            placeholder="sk-…"
            value={llmSettings.apiKey}
            onChange={handleLlmApiKeyChange}
            className="my-1 sm:my-4 px-4 sm:px-16 py-2 sm:py-8 w-full h-10 sm:h-40 bg-surface3 hover:bg-surface3-hover rounded-4 text-ellipsis"
          />
          {provider.apiKeyHint && (
            <div className="text-sm text-gray-500">{provider.apiKeyHint}</div>
          )}
          {provider.docsURL && (
            <div>
              <Link url={provider.docsURL} label={t.settings.docs} />
            </div>
          )}
        </div>

        {/* TTS API Key */}
        {showTtsKey && (
          <div className="my-4 sm:my-24">
            <div className="my-2 sm:my-8 font-bold typography-20 text-secondary">
              {ttsProvider.name} API Key
            </div>
            <input
              type="password"
              autoComplete="off"
              placeholder="..."
              value={ttsSettings.apiKey}
              onChange={handleTtsApiKeyChange}
              className="my-1 sm:my-4 px-4 sm:px-16 py-2 sm:py-8 w-full h-10 sm:h-40 bg-surface3 hover:bg-surface3-hover rounded-4 text-ellipsis"
            />
            {ttsProvider.apiKeyHint && (
              <div className="text-sm text-gray-500">{ttsProvider.apiKeyHint}</div>
            )}
            {ttsProvider.docsURL && (
              <div>
                <Link url={ttsProvider.docsURL} label={t.settings.docs} />
              </div>
            )}
          </div>
        )}

        <div className="my-4 sm:my-24">
          <button
            onClick={() => {
              setOpened(false);
            }}
            className="font-bold bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled text-white px-6 sm:px-24 py-2 sm:py-8 rounded-oval text-sm sm:text-base"
          >
            {t.introduction.startButton}
          </button>
        </div>
      </div>
    </div>
  ) : null;
};