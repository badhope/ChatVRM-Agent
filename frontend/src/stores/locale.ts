import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n, { setLanguage, getCurrentLanguage, type LanguageCode } from '@/i18n';

interface LocaleState {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      language: getCurrentLanguage(),
      setLanguage: (code) => {
        setLanguage(code);
        set({ language: code });
      },
    }),
    {
      name: 'pa-locale',
      onRehydrateStorage: () => (state) => {
        if (state?.language) {
          void i18n.changeLanguage(state.language);
        }
      },
    },
  ),
);
