import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  MessageSquare,
  Bot,
  Code2,
  Brain,
  Wrench,
  GitBranch,
  Compass,
  Settings,
  Sun,
  Moon,
  Zap,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAppStore } from '@/app/store';

const navItems = [
  { to: '/chat', icon: MessageSquare, label: 'Chat' },
  { to: '/agent', icon: Bot, label: 'Agent' },
  { to: '/review', icon: Code2, label: 'Review' },
  { to: '/memory', icon: Brain, label: 'Memory' },
  { to: '/tools', icon: Wrench, label: 'Tools' },
  { to: '/git', icon: GitBranch, label: 'Git' },
  { to: '/explore', icon: Compass, label: 'Explore' },
];

interface MobileSidebarProps {
  open: boolean;
  onClose: () => void;
}

function SidebarContent({ onClose }: { onClose: () => void }) {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  return (
    <>
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 h-14 border-b border-border shrink-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-white">
          <Zap size={18} />
        </div>
        <span className="text-sm font-bold text-text tracking-tight">DevFlow</span>
        <button
          onClick={onClose}
          className="ml-auto p-1 rounded-md text-text-muted hover:text-text hover:bg-surface transition-colors"
          aria-label="Close navigation"
        >
          <X size={16} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5" aria-label="Main navigation">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-secondary hover:text-text hover:bg-surface',
              )
            }
          >
            <Icon size={18} className="shrink-0" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-border p-2 space-y-0.5">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 w-full rounded-lg px-2.5 py-2 text-sm font-medium text-text-secondary hover:text-text hover:bg-surface transition-colors"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>

        <NavLink
          to="/settings"
          onClick={onClose}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-text-secondary hover:text-text hover:bg-surface',
            )
          }
        >
          <Settings size={18} className="shrink-0" />
          <span>Settings</span>
        </NavLink>
      </div>
    </>
  );
}

export function MobileSidebar({ open, onClose }: MobileSidebarProps) {
  // Lock body scroll & close on Escape
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 md:hidden transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-56 flex flex-col border-r border-border bg-bg-secondary md:hidden',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Mobile navigation"
        aria-hidden={!open}
      >
        <SidebarContent onClose={onClose} />
      </aside>
    </>
  );
}
