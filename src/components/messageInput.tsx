import { IconButton } from "./iconButton";
import { useI18n } from "@/features/i18n/i18nContext";

type Props = {
  userMessage: string;
  isMicRecording: boolean;
  isChatProcessing: boolean;
  onChangeUserMessage: (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  onClickSendButton: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onClickMicButton: (event: React.MouseEvent<HTMLButtonElement>) => void;
};
export const MessageInput = ({
  userMessage,
  isMicRecording,
  isChatProcessing,
  onChangeUserMessage,
  onClickMicButton,
  onClickSendButton,
}: Props) => {
  const { t } = useI18n();

  return (
    <div className="fixed bottom-0 z-20 w-full">
      <div className="bg-base text-black">
        <div className="mx-auto max-w-2xl sm:max-w-4xl px-3 sm:px-6 py-2 sm:py-3">
          <div className="grid grid-flow-col gap-2 grid-cols-[min-content_1fr_min-content]">
            <IconButton
              iconName="24/Microphone"
              className="bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled"
              isProcessing={isMicRecording}
              disabled={isChatProcessing}
              onClick={onClickMicButton}
            />
            <input
              type="text"
              placeholder={t.messageInput.placeholder}
              onChange={onChangeUserMessage}
              disabled={isChatProcessing}
              className="bg-surface1 hover:bg-surface1-hover focus:bg-surface1 disabled:bg-surface1-disabled disabled:text-primary-disabled rounded-xl w-full px-3 sm:px-4 py-2 text-sm sm:text-base text-text-primary font-bold"
              value={userMessage}
            ></input>

            <IconButton
              iconName="24/Send"
              className="bg-secondary hover:bg-secondary-hover active:bg-secondary-press disabled:bg-secondary-disabled"
              isProcessing={isChatProcessing}
              disabled={isChatProcessing || !userMessage}
              onClick={onClickSendButton}
            />
          </div>
        </div>
        <div className="py-1.5 sm:py-2 bg-[#413D43] text-center text-white font-Montserrat text-[10px] sm:text-xs">
          {t.messageInput.poweredBy}
        </div>
      </div>
    </div>
  );
};
