import { useEffect, useRef } from "react";
import { Message } from "@/features/messages/messages";
import { useI18n } from "@/features/i18n/i18nContext";

type Props = {
  messages: Message[];
  onClose?: () => void;
};
export const ChatLog = ({ messages, onClose }: Props) => {
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({
      behavior: "auto",
      block: "center",
    });
  }, []);

  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [messages]);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center p-4 sm:p-8" onClick={onClose}>
      <div className="w-full max-w-sm sm:max-w-md max-h-[80vh] bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-secondary text-white font-bold text-sm sm:text-base rounded-t-2xl flex-shrink-0 flex justify-between items-center">
          <span>{t.menu.chatLog}</span>
          {onClose && (
            <button onClick={onClose} className="text-white/80 hover:text-white text-lg font-bold ml-2">
              ×
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto scroll-hidden px-3 sm:px-5 py-2 sm:py-4">
          {messages.map((msg, i) => {
            return (
              <div key={i} ref={messages.length - 1 === i ? chatScrollRef : null}>
                <Chat role={msg.role} message={msg.content} t={t} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const Chat = ({ role, message, t }: { role: string; message: string; t: any }) => {
  const isUser = role === "user";
  return (
    <div className={`flex flex-col mb-3 sm:mb-4 ${isUser ? "items-end" : "items-start"}`}>
      <div className={`text-xs sm:text-sm font-bold mb-1 ${isUser ? "text-primary" : "text-secondary"}`}>
        {isUser ? t.chatLog.you : t.chatLog.character}
      </div>
      <div className={`max-w-[85%] sm:max-w-[75%] px-3 sm:px-4 py-2 sm:py-3 rounded-2xl text-sm sm:text-base font-medium ${
        isUser
          ? "bg-secondary text-white rounded-br-sm"
          : "bg-surface1 text-text1 rounded-bl-sm"
      }`}>
        {message}
      </div>
    </div>
  );
};
