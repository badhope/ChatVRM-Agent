import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './en.json';
import zh from './zh.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'zh', label: '中文', short: '中' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

const STORAGE_KEY = 'pa-locale';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: STORAGE_KEY,
      caches: ['localStorage'],
    },
    interpolation: {
      prefix: '{',
      suffix: '}',
      escapeValue: false,
    },
    returnNull: false,
  });

export function setLanguage(code: LanguageCode): void {
  void i18n.changeLanguage(code);
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* localStorage unavailable */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code;
  }
}

export function getCurrentLanguage(): LanguageCode {
  const lng = i18n.language;
  return (lng.startsWith('zh') ? 'zh' : 'en') as LanguageCode;
}

export default i18n;
