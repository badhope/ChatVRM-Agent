import { ChatList } from '@/components/chat/ChatList';
import { ChatInput } from '@/components/chat/ChatInput';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { useState, useRef, useEffect } from 'react';
import { Sparkles, Menu, X } from 'lucide-react';
import { cn } from '@/lib/cn';

const placeholderMessages = [
  { id: '1', role: 'assistant' as const, content: 'Hello! I am DevFlow Agent. How can I help you today?', timestamp: '10:00' },
  { id: '2', role: 'user' as const, content: 'Help me refactor the authentication module.', timestamp: '10:01' },
  { id: '3', role: 'assistant' as const, content: 'I\'ll analyze your authentication module and suggest improvements. Let me start by examining the current code structure...', timestamp: '10:01' },
];

const suggestions = [
  'Refactor my auth module',
  'Explain the codebase structure',
  'Write unit tests for utils',
  'Find potential bugs',
];

export default function ChatPage() {
  const [activeChat, setActiveChat] = useState('1');
  const [showSidebar, setShowSidebar] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeChat]);

  return (
    <div className="flex h-full relative">
      {/* Mobile overlay backdrop */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Chat list sidebar - hidden on mobile, shown as overlay */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-40 transition-transform duration-200 md:relative md:translate-x-0',
          showSidebar ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <ChatList activeId={activeChat} onSelect={(id) => { setActiveChat(id); setShowSidebar(false); }} />
      </div>

      {/* Chat area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile header bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border md:hidden">
          <button
            onClick={() => setShowSidebar(true)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-bg-tertiary transition-colors"
          >
            {showSidebar ? <X size={18} /> : <Menu size={18} />}
          </button>
          <span className="text-sm font-medium text-text">Chat</span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {placeholderMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-4">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary">
                <Sparkles size={28} />
              </div>
              <h2 className="text-xl font-semibold text-text">Start a conversation</h2>
              <p className="text-sm text-text-muted text-center max-w-sm">
                Ask DevFlow Agent to help you refactor, debug, or understand your codebase.
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-tertiary hover:border-primary/30 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto py-4">
              {placeholderMessages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  role={msg.role}
                  content={msg.content}
                  timestamp={msg.timestamp}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <ChatInput onSend={(msg) => console.log('Send:', msg)} />
      </div>
    </div>
  );
}
