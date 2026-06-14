import { useState, useCallback } from "react";
import { Link } from "./link";
import { useI18n } from "@/features/i18n/i18nContext";

type Props = {
  openAiKey: string;
  koeiroMapKey: string;
  onChangeAiKey: (openAiKey: string) => void;
  onChangeKoeiromapKey: (koeiromapKey: string) => void;
};
export const Introduction = ({
  openAiKey,
  koeiroMapKey,
  onChangeAiKey,
  onChangeKoeiromapKey,
}: Props) => {
  const [opened, setOpened] = useState(true);
  const { t } = useI18n();

  const handleAiKeyChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangeAiKey(event.target.value);
    },
    [onChangeAiKey]
  );

  const handleKoeiromapKeyChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChangeKoeiromapKey(event.target.value);
    },
    [onChangeKoeiromapKey]
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
              url="https://github.com/pixiv/ChatVRM"
              label="https://github.com/pixiv/ChatVRM"
            />
          </div>
        </div>

        <div className="my-4 sm:my-24">
          <div className="my-2 sm:my-8 font-bold typography-20 text-secondary">
            {t.introduction.usageTitle}
          </div>
          <div>{t.introduction.usageDescription}</div>
        </div>

        <div className="my-4 sm:my-24">
          <div className="my-2 sm:my-8 font-bold typography-20 text-secondary">
            {t.introduction.koeiromapTitle}
          </div>
          <input
            type="text"
            placeholder="XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            value={koeiroMapKey}
            onChange={handleKoeiromapKeyChange}
            className="my-1 sm:my-4 px-4 sm:px-16 py-2 sm:py-8 w-full h-10 sm:h-40 bg-surface3 hover:bg-surface3-hover rounded-4 text-ellipsis"
          />
          <div>
            {t.introduction.koeiromapDescription}
            <Link
              url="https://developers.rinna.co.jp/product/#product=koeiromap-free"
              label={t.introduction.koeiromapLink}
            />
          </div>
        </div>
        <div className="my-4 sm:my-24">
          <div className="my-2 sm:my-8 font-bold typography-20 text-secondary">
            {t.introduction.openaiTitle}
          </div>
          <input
            type="text"
            placeholder="sk-..."
            value={openAiKey}
            onChange={handleAiKeyChange}
            className="my-1 sm:my-4 px-4 sm:px-16 py-2 sm:py-8 w-full h-10 sm:h-40 bg-surface3 hover:bg-surface3-hover rounded-4 text-ellipsis"
          />
          <div>
            {t.introduction.openaiDescription}
            <Link
              url="https://platform.openai.com/account/api-keys"
              label={t.introduction.openaiSite}
            />
          </div>
          <div className="my-4 sm:my-16">
            {t.introduction.openaiNotice}
            <br />
            {t.introduction.openaiModel}
          </div>
        </div>
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
