import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  Globe,
  SlidersHorizontal,
  Smile,
  Heart,
} from 'lucide-react';
import { cn } from '@/utils';
import { ToastContainer } from './Toast';
import { useConfigStore } from '@/stores/config';
import { useThemeStore } from '@/stores/theme';
import { useLocaleStore } from '@/stores/locale';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '@/i18n';
import { Dot } from './Badge';

export function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const location = useLocation();
  const { t } = useTranslation();
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const snapshot = useConfigStore((s) => s.snapshot);
  const loadAll = useConfigStore((s) => s.loadAll);
  const language = useLocaleStore((s) => s.language);
  const setLanguage = useLocaleStore((s) => s.setLanguage);

  useEffect(() => {
    loadAll().catch(() => undefined);
  }, [loadAll]);

  useEffect(() => {
    setDrawerOpen(false);
    setLangMenuOpen(false);
  }, [location.pathname]);

  const ready = snapshot ? Object.values(snapshot.hasKey).some(Boolean) : false;

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
                {ready
                  ? `${snapshot?.defaultProvider ?? ''} · ${t('status.ready')}`
                  : t('status.noKey')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="relative">
              <button
                onClick={() => setLangMenuOpen((v) => !v)}
                className="p-1.5 rounded-md text-fg-soft hover:text-fg hover:bg-bg-soft inline-flex items-center gap-1 text-xs"
                aria-label="switch language"
                title={t('common.language')}
              >
                <Globe size={14} />
                <span className="font-mono">
                  {SUPPORTED_LANGUAGES.find((l) => l.code === language)?.short ?? 'EN'}
                </span>
              </button>
              {langMenuOpen && (
                <div className="absolute right-0 top-full mt-1 min-w-[120px] rounded-md border border-border bg-bg-elev shadow-elev py-1 z-50">
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => setLanguage(lang.code as LanguageCode)}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-xs hover:bg-bg-soft transition-colors',
                        language === lang.code && 'text-brand font-medium',
                      )}
                    >
                      <span className="inline-block w-6 font-mono text-fg-mute">
                        {lang.short}
                      </span>
                      {lang.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={toggle}
              className="p-1.5 rounded-md text-fg-soft hover:text-fg hover:bg-bg-soft"
              aria-label="toggle theme"
              title={t('common.theme')}
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
  const { t } = useTranslation();
  const items = [
    { to: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { to: '/chat', label: t('nav.chat'), icon: MessageSquare },
    { to: '/agent', label: t('nav.agent'), icon: Wand2 },
    { to: '/tools', label: t('nav.tools'), icon: Wrench },
    { to: '/memory', label: t('nav.memory'), icon: Brain },
    { to: '/personality', label: t('nav.personality'), icon: Smile },
    { to: '/emotion', label: t('nav.emotion'), icon: Heart },
    { to: '/graph', label: t('nav.graph'), icon: Share2 },
    { to: '/config', label: t('nav.config'), icon: SlidersHorizontal },
  ];
  return (
    <>
      <div className="h-14 px-4 flex items-center gap-2 border-b border-border">
        <div className="h-7 w-7 rounded-md bg-brand flex items-center justify-center text-brand-fg font-bold text-sm shadow-soft">
          P
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-semibold text-sm tracking-tight">
            {t('app.name')}
          </span>
          <span className="text-[10px] text-fg-mute mt-0.5 font-mono">v2.0 / web</span>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {items.map((item) => {
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
          <span>{t('nav.settings')}</span>
        </NavLink>
        <p className="mt-3 px-3 text-[10.5px] text-fg-mute leading-relaxed">
          {t('app.tagline')}
        </p>
      </div>
    </>
  );
}
