import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

function isChineseLocale(lang: string | undefined): boolean {
  return !!lang && lang.toLowerCase().startsWith('zh');
}

function currentLanguage(): string {
  if (typeof document === 'undefined') return 'en';
  return document.documentElement.lang || (typeof localStorage !== 'undefined'
    ? localStorage.getItem('i18nextLng') ?? 'en'
    : 'en');
}

export function formatTime(iso: string, locale?: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const isZh = isChineseLocale(locale ?? currentLanguage());
  if (diff < 60_000) return isZh ? '刚刚' : 'just now';
  if (diff < 3_600_000) {
    const n = Math.floor(diff / 60_000);
    return isZh ? `${n} 分钟前` : `${n} min ago`;
  }
  if (diff < 86_400_000) {
    const n = Math.floor(diff / 3_600_000);
    return isZh ? `${n} 小时前` : `${n} hr ago`;
  }
  if (diff < 7 * 86_400_000) {
    const n = Math.floor(diff / 86_400_000);
    return isZh ? `${n} 天前` : `${n} day${n === 1 ? '' : 's'} ago`;
  }
  return d.toLocaleDateString(isZh ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatDateTime(iso: string, locale?: string): string {
  const isZh = isChineseLocale(locale ?? currentLanguage());
  return new Date(iso).toLocaleString(isZh ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

export function truncate(str: string, n: number): string {
  if (str.length <= n) return str;
  return str.slice(0, n) + '…';
}

export function providerColor(id: string): string {
  const map: Record<string, string> = {
    openai: '#10a37f',
    anthropic: '#d97757',
    google: '#4285f4',
    deepseek: '#5b6cdb',
    siliconflow: '#7c3aed',
    aliyun: '#ff6a00',
    zhipu: '#3b82f6',
    baidu: '#2932e1',
    ollama: '#1a1a1a',
    lmstudio: '#a855f7',
  };
  return map[id] ?? '#6366f1';
}

export function providerInitial(id: string): string {
  return id.slice(0, 1).toUpperCase();
}
