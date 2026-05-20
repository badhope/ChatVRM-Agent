import { useState, useRef, useEffect, forwardRef } from 'react';
import { Send, Paperclip, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ChatInputProps {
  onSend?: (message: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const ChatInput = forwardRef<HTMLTextAreaElement, ChatInputProps>(
  function ChatInput({ onSend, placeholder = 'Type a message...', className, disabled }, ref) {
    const [value, setValue] = useState('');
    const internalRef = useRef<HTMLTextAreaElement | null>(null);
    const textareaRef = (ref as React.RefObject<HTMLTextAreaElement>) || internalRef;

    // Auto-resize textarea
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }, [value, textareaRef]);

    // Reset height when value is cleared
    useEffect(() => {
      const el = textareaRef.current;
      if (el && !value) {
        el.style.height = 'auto';
      }
    }, [value, textareaRef]);

    const handleSend = () => {
      const trimmed = value.trim();
      if (!trimmed) return;
      onSend?.(trimmed);
      setValue('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    };

    return (
      <div className={cn('border-t border-border bg-bg-secondary/50 p-4', className)}>
        <div className="flex items-end gap-2 rounded-xl border border-border bg-surface p-2">
          <button
            className="shrink-0 p-2 rounded-lg text-text-muted hover:text-text hover:bg-bg-tertiary transition-colors"
            aria-label="Attach file"
          >
            <Paperclip size={16} />
          </button>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-text placeholder:text-text-muted focus:outline-none min-h-[36px] max-h-[120px] py-2"
          />
          <button
            onClick={handleSend}
            disabled={!value.trim() || disabled}
            className={cn(
              'shrink-0 p-2 rounded-lg transition-colors',
              value.trim()
                ? 'bg-primary text-white hover:bg-primary-hover'
                : 'text-text-muted cursor-not-allowed',
            )}
            aria-label="Send message"
          >
            {disabled ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
      </div>
    );
  },
);
