import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
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
