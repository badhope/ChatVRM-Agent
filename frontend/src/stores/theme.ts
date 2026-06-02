import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      toggle: () => set((s: ThemeState) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
    }),
    { name: 'pa-theme' },
  ),
);
