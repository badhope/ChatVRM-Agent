import { useEffect, useRef } from "react";
import { Message } from "@/features/messages/messages";
import { useI18n } from "@/features/i18n/i18nContext";

type Props = {
  messages: Message[];
};
export const ChatLog = ({ messages }: Props) => {
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
    <div className="absolute w-col-span-6 max-w-full h-[100svh] pb-64">
      <div className="max-h-full px-4 sm:px-16 pt-24 sm:pt-104 pb-16 sm:pb-64 overflow-y-auto scroll-hidden">
        {messages.map((msg, i) => {
          return (
            <div key={i} ref={messages.length - 1 === i ? chatScrollRef : null}>
              <Chat role={msg.role} message={msg.content} t={t} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Chat = ({ role, message, t }: { role: string; message: string; t: any }) => {
  const roleColor =
    role === "assistant" ? "bg-secondary text-white " : "bg-base text-primary";
  const roleText = role === "assistant" ? "text-secondary" : "text-primary";
  const offsetX = role === "user" ? "pl-8 sm:pl-40" : "pr-8 sm:pr-40";

  return (
    <div className={`mx-auto max-w-sm my-4 sm:my-16 ${offsetX}`}>
      <div
        className={`px-6 sm:px-24 py-2 sm:py-8 rounded-t-8 font-bold tracking-wider text-sm sm:text-base ${roleColor}`}
      >
        {role === "assistant" ? t.chatLog.character : t.chatLog.you}
      </div>
      <div className="px-6 sm:px-24 py-4 sm:py-16 bg-white rounded-b-8">
        <div className={`typography-16 font-bold ${roleText}`}>{message}</div>
      </div>
    </div>
  );
};
