import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  sidebarOpen: boolean;
  mobileSidebarOpen: boolean;
  theme: 'dark' | 'light';
  toggleSidebar: () => void;
  toggleTheme: () => void;
  setSidebarOpen: (open: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      mobileSidebarOpen: false,
      theme: 'dark',
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
      setMobileSidebarOpen: (open: boolean) => set({ mobileSidebarOpen: open }),
    }),
    {
      name: 'devflow-settings',
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
);
