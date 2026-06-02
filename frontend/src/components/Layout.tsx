import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  Wand2,
  Wrench,
  Brain,
  Settings as SettingsIcon,
  Share2,
  Sun,
  Moon,
  Menu,
  X,
  Activity,
} from 'lucide-react';
import { cn } from '@/utils';
import { ToastContainer } from './Toast';
import { useConfigStore } from '@/stores/config';
import { useThemeStore } from '@/stores/theme';
import { Dot } from './Badge';

const nav = [
  { to: '/dashboard', label: '仪表盘', icon: LayoutDashboard },
  { to: '/chat', label: '对话', icon: MessageSquare },
  { to: '/agent', label: 'Agent', icon: Wand2 },
  { to: '/tools', label: '工具', icon: Wrench },
  { to: '/memory', label: '记忆', icon: Brain },
  { to: '/graph', label: '图谱', icon: Share2 },
  { to: '/config', label: '配置', icon: SettingsIcon },
];

export function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const defaultProvider = useConfigStore((s) => s.defaultProvider);
  const configuredKeys = useConfigStore((s) => s.configuredKeys);
  const refresh = useConfigStore((s) => s.refresh);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const ready = configuredKeys.size > 0;

  return (
    <div className="min-h-screen bg-bg text-fg flex">
      <aside
        className={cn(
          'hidden lg:flex flex-col w-60 shrink-0 border-r border-border bg-bg-soft/30 sticky top-0 h-screen',
        )}
      >
        <SidebarContent />
      </aside>

      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside className="relative w-72 max-w-[80vw] bg-bg border-r border-border flex flex-col animate-slide-up">
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute top-3 right-3 p-1.5 text-fg-mute hover:text-fg"
              aria-label="close menu"
            >
              <X size={18} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 px-4 lg:px-6 border-b border-border bg-bg/85 backdrop-blur sticky top-0 z-30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden p-1.5 -ml-1.5 text-fg-soft hover:text-fg"
              aria-label="open menu"
            >
              <Menu size={18} />
            </button>
            <div className="hidden sm:flex items-center gap-2 text-xs text-fg-mute">
              <Dot variant={ready ? 'success' : 'warning'} pulse={ready} />
              <span className="truncate">
                {ready ? `${defaultProvider} · 就绪` : '未配置 API key'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="p-1.5 rounded-md text-fg-soft hover:text-fg hover:bg-bg-soft"
              aria-label="toggle theme"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <a
              href="https://github.com/badhope/Personal-Assistant"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs text-fg-soft hover:text-fg hover:bg-bg-soft"
            >
              <Activity size={13} />
              <span>v2.0</span>
            </a>
          </div>
        </header>

        <main className="flex-1 min-w-0 min-h-0 overflow-auto">
          <Outlet />
        </main>
      </div>

      <ToastContainer />
    </div>
  );
}

function SidebarContent() {
  return (
    <>
      <div className="h-14 px-4 flex items-center gap-2 border-b border-border">
        <div className="h-7 w-7 rounded-md bg-brand flex items-center justify-center text-brand-fg font-bold text-sm shadow-soft">
          P
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-semibold text-sm tracking-tight">Personal-Assistant</span>
          <span className="text-[10px] text-fg-mute mt-0.5 font-mono">v2.0 / web</span>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 h-9 px-3 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-brand/12 text-brand font-medium'
                    : 'text-fg-soft hover:text-fg hover:bg-bg-soft',
                )
              }
            >
              <Icon size={16} strokeWidth={1.75} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="p-3 border-t border-border">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 h-9 px-3 rounded-md text-sm transition-colors',
              isActive
                ? 'bg-brand/12 text-brand font-medium'
                : 'text-fg-soft hover:text-fg hover:bg-bg-soft',
            )
          }
        >
          <SettingsIcon size={16} strokeWidth={1.75} />
          <span>设置</span>
        </NavLink>
        <p className="mt-3 px-3 text-[10.5px] text-fg-mute leading-relaxed">
          真实 LLM / 真实工具 / 真实记忆 · 0 mock
        </p>
      </div>
    </>
  );
}
