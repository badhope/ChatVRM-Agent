import { useI18n } from "@/features/i18n/i18nContext";

export const AssistantText = ({ message }: { message: string }) => {
  const { t } = useI18n();

  return (
    <div className="fixed bottom-16 sm:bottom-20 left-0 w-full z-10 pointer-events-none">
      <div className="mx-auto max-w-2xl sm:max-w-4xl w-full px-3 sm:px-6 py-2 sm:py-4">
        <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg pointer-events-auto">
          <div className="px-4 sm:px-6 py-1.5 sm:py-2 bg-secondary rounded-t-xl text-white font-bold tracking-wider text-xs sm:text-sm">
            {t.assistantText.character}
          </div>
          <div className="px-4 sm:px-6 py-2 sm:py-3">
            <div className="line-clamp-3 text-secondary typography-14 sm:typography-16 font-bold text-sm sm:text-base">
              {message.replace(/\[([a-zA-Z]*?)\]/g, "")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
