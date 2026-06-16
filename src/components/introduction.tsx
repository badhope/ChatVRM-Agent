import { useState } from "react";
import { Link } from "./link";
import { useI18n } from "@/features/i18n/i18nContext";

type Props = {
  onClose?: () => void;
};
export const Introduction = ({
  onClose,
}: Props) => {
  const [opened, setOpened] = useState(true);
  const { t } = useI18n();

  const handleClose = () => {
    setOpened(false);
    onClose?.();
  };

  return opened ? (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4 sm:px-6 py-6 sm:py-10 bg-black/30 font-M_PLUS_2 overflow-y-auto">
      <div className="mx-auto w-full max-w-lg sm:max-w-2xl max-h-[85vh] sm:max-h-[80vh] p-4 sm:p-8 overflow-y-auto bg-white rounded-2xl shadow-xl">
        <div className="my-3 sm:my-6">
          <div className="my-2 sm:my-4 font-bold typography-20 text-secondary">
            {t.introduction.title}
          </div>
          <div className="text-sm sm:text-base">{t.introduction.description}</div>
        </div>
        <div className="my-3 sm:my-6">
          <div className="my-2 sm:my-4 font-bold typography-20 text-secondary">
            {t.introduction.techTitle}
          </div>
          <div className="text-sm sm:text-base">
            {t.introduction.techDescription}
            <Link
              url="https://inside.pixiv.blog/2023/04/28/160000"
              label={t.introduction.techLink}
            />
          </div>
          <div className="my-3 sm:my-6 text-sm sm:text-base">
            {t.introduction.githubNotice}
            <br />
            {t.introduction.repoLabel}
            <Link
              url="https://github.com/badhope/ChatVRM-Agent"
              label="https://github.com/badhope/ChatVRM-Agent"
            />
          </div>
        </div>

        <div className="my-3 sm:my-6">
          <div className="my-2 sm:my-4 font-bold typography-20 text-secondary">
            {t.introduction.usageTitle}
          </div>
          <div className="text-sm sm:text-base">{t.introduction.usageDescription}</div>
        </div>

        <div className="my-4 sm:my-6">
          <button
            onClick={handleClose}
            className="font-bold bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled text-white px-6 py-2.5 rounded-full text-sm sm:text-base w-full sm:w-auto"
          >
            {t.introduction.startButton}
          </button>
        </div>
      </div>
    </div>
  ) : null;
};