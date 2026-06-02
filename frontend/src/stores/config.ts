import { create } from 'zustand';
import type { ProviderType } from '@/types';

interface ConfigState {
  defaultProvider: ProviderType | null;
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  configuredKeys: Set<ProviderType>;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  setDefaultProvider: (p: ProviderType) => void;
  setDefaultModel: (m: string) => void;
  setTemperature: (t: number) => void;
  setMaxTokens: (n: number) => void;
  setConfigured: (p: ProviderType, has: boolean) => void;
  refresh: () => Promise<void>;
}

interface ConfigSnapshot {
  defaultProvider: ProviderType;
  apiKeys: Record<string, string>;
  hasKey: Record<string, boolean>;
  chat: { model?: string; temperature?: number; maxTokens?: number };
  sandbox: Record<string, unknown>;
  circuitBreaker: Record<string, unknown>;
}

export const useConfigStore = create<ConfigState>((set) => ({
  defaultProvider: null,
  defaultModel: '',
  temperature: 0.7,
  maxTokens: 2048,
  configuredKeys: new Set(),
  loaded: false,
  loading: false,
  error: null,
  setDefaultProvider: (p) => set({ defaultProvider: p }),
  setDefaultModel: (m) => set({ defaultModel: m }),
  setTemperature: (t) => set({ temperature: t }),
  setMaxTokens: (n) => set({ maxTokens: n }),
  setConfigured: (p, has) =>
    set((s) => {
      const next = new Set(s.configuredKeys);
      if (has) next.add(p);
      else next.delete(p);
      return { configuredKeys: next };
    }),
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const r = await fetch('/api/config/snapshot', { cache: 'no-store' });
      if (!r.ok) throw new Error(`config snapshot HTTP ${r.status}`);
      const data = (await r.json()) as ConfigSnapshot;
      const configured = new Set<ProviderType>(
        Object.entries(data.hasKey ?? {})
          .filter(([, v]) => v === true)
          .map(([k]) => k as ProviderType),
      );
      set({
        defaultProvider: data.defaultProvider,
        defaultModel: data.chat?.model ?? '',
        temperature: typeof data.chat?.temperature === 'number' ? data.chat.temperature : 0.7,
        maxTokens: typeof data.chat?.maxTokens === 'number' ? data.chat.maxTokens : 2048,
        configuredKeys: configured,
        loaded: true,
        loading: false,
        error: null,
      });
    } catch (e) {
      set({ loaded: true, loading: false, error: String(e) });
    }
  },
}));
