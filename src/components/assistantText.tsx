import { useI18n } from "@/features/i18n/i18nContext";

export const AssistantText = ({ message }: { message: string }) => {
  const { t } = useI18n();

  return (
    <div className="absolute bottom-0 left-0 mb-24 sm:mb-104 w-full">
      <div className="mx-auto max-w-4xl w-full p-4 sm:p-16">
        <div className="bg-white rounded-8">
          <div className="px-6 sm:px-24 py-2 sm:py-8 bg-secondary rounded-t-8 text-white font-bold tracking-wider text-sm sm:text-base">
            {t.assistantText.character}
          </div>
          <div className="px-6 sm:px-24 py-4 sm:py-16">
            <div className="line-clamp-4 text-secondary typography-16 font-bold">
              {message.replace(/\[([a-zA-Z]*?)\]/g, "")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
