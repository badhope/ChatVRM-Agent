import { useEffect } from 'react';
import { useAppStore } from '../app/store';

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      const stored = localStorage.getItem('devflow-settings');
      if (!stored) {
        useAppStore.setState({ theme: e.matches ? 'dark' : 'light' });
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Initialize from system preference if no stored value
  useEffect(() => {
    const stored = localStorage.getItem('devflow-settings');
    if (!stored) {
      useAppStore.setState({ theme: getSystemTheme() });
    }
  }, []);

  return { theme, toggleTheme, isDark: theme === 'dark' };
}
