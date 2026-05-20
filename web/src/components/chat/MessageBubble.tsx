import { cn } from '@/lib/cn';
import { Avatar } from '../ui/Avatar';

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  className?: string;
}

export function MessageBubble({ role, content, timestamp, className }: MessageBubbleProps) {
  const isUser = role === 'user';
  const isSystem = role === 'system';

  // System messages: centered, muted divider style
  if (isSystem) {
    return (
      <div
        className={cn('flex items-center justify-center py-2 px-4', className)}
        role="log"
        aria-live="polite"
      >
        <div className="flex items-center gap-3 w-full max-w-md">
          <div className="flex-1 border-t border-border" />
          <span className="text-xs text-text-muted whitespace-nowrap">{content}</span>
          <div className="flex-1 border-t border-border" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex gap-3 px-4 py-3 animate-in fade-in slide-in-from-bottom-2 duration-300',
        isUser ? 'flex-row-reverse' : '',
        className,
      )}
      role="log"
      aria-live="polite"
    >
      <Avatar
        alt={isUser ? 'You' : 'Agent'}
        size="sm"
        fallback={isUser ? 'U' : 'AI'}
        className="shrink-0 mt-0.5"
      />
      <div className={cn('flex flex-col gap-1 max-w-[75%]', isUser && 'items-end')}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-secondary">
            {isUser ? 'You' : 'DevFlow Agent'}
          </span>
          {timestamp && <span className="text-xs text-text-muted">{timestamp}</span>}
        </div>
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-primary text-white rounded-tr-md relative overflow-hidden'
              : 'bg-surface border border-border text-text rounded-tl-md',
          )}
        >
          {/* Subtle gradient shine on user messages */}
          {isUser && (
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          )}
          <span className="relative">{content}</span>
        </div>
      </div>
    </div>
  );
}
