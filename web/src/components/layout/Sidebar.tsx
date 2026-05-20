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
  PanelLeftClose,
  PanelLeftOpen,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Tooltip } from '../ui/Tooltip';
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

export function Sidebar() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col h-full border-r border-border bg-bg-secondary transition-all duration-300',
        sidebarOpen ? 'w-56' : 'w-14',
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 h-14 border-b border-border shrink-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-white">
          <Zap size={18} />
        </div>
        {sidebarOpen && (
          <span className="text-sm font-bold text-text tracking-tight">DevFlow</span>
        )}
        <button
          onClick={toggleSidebar}
          className="ml-auto p-1 rounded-md text-text-muted hover:text-text hover:bg-surface transition-colors"
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-expanded={sidebarOpen}
        >
          {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5" aria-label="Main navigation">
        {navItems.map(({ to, icon: Icon, label }) => {
          const link = (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-secondary hover:text-text hover:bg-surface',
                  !sidebarOpen && 'justify-center px-0',
                )
              }
            >
              <Icon size={18} className="shrink-0" />
              {sidebarOpen && <span>{label}</span>}
            </NavLink>
          );

          if (!sidebarOpen) {
            return (
              <Tooltip key={to} content={label} side="right">
                {link}
              </Tooltip>
            );
          }
          return link;
        })}
      </nav>

      {/* Separator */}
      <div className="mx-3 border-t border-border" />

      {/* Bottom actions */}
      <div className="p-2 space-y-0.5">
        <button
          onClick={toggleTheme}
          className={cn(
            'flex items-center gap-3 w-full rounded-lg px-2.5 py-2 text-sm font-medium text-text-secondary',
            'hover:text-text hover:bg-surface transition-colors',
            !sidebarOpen && 'justify-center px-0',
          )}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          {sidebarOpen && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>

        {(() => {
          const settingsLink = (
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-secondary hover:text-text hover:bg-surface',
                  !sidebarOpen && 'justify-center px-0',
                )
              }
            >
              <Settings size={18} className="shrink-0" />
              {sidebarOpen && <span>Settings</span>}
            </NavLink>
          );

          if (!sidebarOpen) {
            return (
              <Tooltip content="Settings" side="right">
                {settingsLink}
              </Tooltip>
            );
          }
          return settingsLink;
        })()}
      </div>
    </aside>
  );
}
