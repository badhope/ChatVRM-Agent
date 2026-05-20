import { useLocation } from 'react-router-dom';
import { Search, Bell, Menu } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { Tooltip } from '../ui/Tooltip';

const pageTitles: Record<string, string> = {
  '/chat': 'Chat',
  '/agent': 'Agent',
  '/review': 'Code Review',
  '/memory': 'Memory',
  '/tools': 'Tools',
  '/git': 'Git',
  '/settings': 'Settings',
  '/explore': 'Explore',
};

interface HeaderProps {
  onMobileMenuToggle: () => void;
}

export function Header({ onMobileMenuToggle }: HeaderProps) {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'DevFlow';

  return (
    <header className="flex items-center justify-between h-14 px-4 border-b border-border bg-bg-secondary/50 backdrop-blur-sm shrink-0">
      <div className="flex items-center gap-2">
        {/* Mobile menu button */}
        <button
          onClick={onMobileMenuToggle}
          className="flex md:hidden p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu size={18} />
        </button>
        <h1 className="text-base font-semibold text-text">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative hidden sm:block">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search..."
            aria-label="Search"
            className="h-8 w-56 rounded-lg border border-border bg-surface pl-8 pr-3 text-xs text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        {/* Notifications */}
        <Tooltip content="Notifications">
          <button
            className="relative p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface transition-colors"
            aria-label="Notifications"
          >
            <Bell size={16} />
            <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
          </button>
        </Tooltip>

        {/* User */}
        <Avatar alt="User" size="sm" fallback="DF" />
      </div>
    </header>
  );
}
