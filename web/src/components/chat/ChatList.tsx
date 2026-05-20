import { useState, useMemo } from 'react';
import { cn } from '@/lib/cn';
import { MessageSquare, Search } from 'lucide-react';

interface ChatItem {
  id: string;
  title: string;
  lastMessage?: string;
  timestamp?: string;
  active?: boolean;
}

interface ChatListProps {
  chats?: ChatItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  className?: string;
}

const placeholderChats: ChatItem[] = [
  { id: '1', title: 'New Chat', lastMessage: 'Start a conversation...', timestamp: 'Now' },
  { id: '2', title: 'Refactor Auth Module', lastMessage: 'Completed refactoring...', timestamp: '2h ago' },
  { id: '3', title: 'Fix Memory Leak', lastMessage: 'Found the issue in...', timestamp: '1d ago' },
  { id: '4', title: 'Add Unit Tests', lastMessage: 'Writing tests for...', timestamp: '3d ago' },
];

export function ChatList({ chats, activeId, onSelect, className }: ChatListProps) {
  const items = chats || placeholderChats;
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.lastMessage && c.lastMessage.toLowerCase().includes(q)),
    );
  }, [items, search]);

  return (
    <div
      className={cn(
        'flex flex-col border-r border-border bg-bg-secondary w-64 shrink-0 max-md:w-full',
        className,
      )}
    >
      {/* New Chat button */}
      <div className="p-3 border-b border-border">
        <button
          onClick={() => onSelect?.('')}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover transition-colors"
          aria-label="Start new chat"
        >
          <MessageSquare size={14} />
          New Chat
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pt-2 pb-1">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search chats..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search chats"
            className="h-8 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-xs text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <Search size={24} className="text-text-muted mb-2" />
            <p className="text-sm text-text-muted">No chats found</p>
          </div>
        ) : (
          filtered.map((chat) => (
            <button
              key={chat.id}
              onClick={() => onSelect?.(chat.id)}
              className={cn(
                'w-full text-left px-3 py-2.5 transition-colors border-l-2',
                activeId === chat.id
                  ? 'bg-primary/10 border-primary text-text'
                  : 'border-transparent text-text-secondary hover:bg-surface hover:text-text',
              )}
            >
              <div className="text-sm font-medium truncate">{chat.title}</div>
              {chat.lastMessage && (
                <div className="text-xs text-text-muted truncate mt-0.5">{chat.lastMessage}</div>
              )}
              {chat.timestamp && (
                <div className="text-xs text-text-muted mt-1">{chat.timestamp}</div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
