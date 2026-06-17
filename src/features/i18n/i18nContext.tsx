import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import { translations, Language, TranslationKey } from "./translations";

type I18nContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: TranslationKey;
};

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("chatVRM_language");
      if (saved === "en" || saved === "zh") {
        setLanguageState(saved);
      }
    } catch {
      // localStorage may be unavailable (private browsing, etc.)
    }
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem("chatVRM_language", lang);
    } catch {
      // Ignore write failures (quota, private browsing, etc.)
    }
  }, []);

  const t = translations[language];

  // Keep <html lang> in sync with the active language for a11y/SEO.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    }
  }, [language]);

  const value = useMemo<I18nContextType>(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t]
  );

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
