import React from "react";
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

type Props = {
  openAiKey: string;
  systemPrompt: string;
  chatLog: Message[];
  koeiroParam: KoeiroParam;
  koeiromapKey: string;
  onClickClose: () => void;
  onChangeAiKey: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onChangeSystemPrompt: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onChangeChatLog: (index: number, text: string) => void;
  onChangeKoeiroParam: (x: number, y: number) => void;
  onClickOpenVrmFile: () => void;
  onClickResetChatLog: () => void;
  onClickResetSystemPrompt: () => void;
  onChangeKoeiromapKey: (event: React.ChangeEvent<HTMLInputElement>) => void;
};
export const Settings = ({
  openAiKey,
  chatLog,
  systemPrompt,
  koeiroParam,
  koeiromapKey,
  onClickClose,
  onChangeSystemPrompt,
  onChangeAiKey,
  onChangeChatLog,
  onChangeKoeiroParam,
  onClickOpenVrmFile,
  onClickResetChatLog,
  onClickResetSystemPrompt,
  onChangeKoeiromapKey,
}: Props) => {
  const { t, language, setLanguage } = useI18n();

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

          <div className="my-6 sm:my-24">
            <div className="my-4 sm:my-16 typography-20 font-bold">{t.settings.openaiKey}</div>
            <input
              className="text-ellipsis px-4 sm:px-16 py-2 sm:py-8 w-col-span-2 bg-surface1 hover:bg-surface1-hover rounded-8"
              type="text"
              placeholder="sk-..."
              value={openAiKey}
              onChange={onChangeAiKey}
            />
            <div className="text-sm sm:text-base">
              {t.settings.openaiDescription}
              <Link
                url="https://platform.openai.com/account/api-keys"
                label={t.settings.openaiSite}
              />
            </div>
            <div className="my-4 sm:my-16 text-sm sm:text-base">
              {t.settings.openaiNotice}
              <br />
              {t.settings.openaiModel}
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
          <div className="my-10 sm:my-40">
            <div className="my-4 sm:my-16 typography-20 font-bold">{t.settings.voiceAdjustment}</div>
            <div className="text-sm sm:text-base">
              {t.settings.koeiromapDescription}
              <Link
                url="https://koemotion.rinna.co.jp"
                label="https://koemotion.rinna.co.jp"
              />
            </div>
            <div className="mt-4 sm:mt-16 font-bold">{t.settings.apiKey}</div>
            <div className="mt-2 sm:mt-8">
              <input
                className="text-ellipsis px-4 sm:px-16 py-2 sm:py-8 w-col-span-2 bg-surface1 hover:bg-surface1-hover rounded-8"
                type="text"
                placeholder="..."
                value={koeiromapKey}
                onChange={onChangeKoeiromapKey}
              />
            </div>

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
