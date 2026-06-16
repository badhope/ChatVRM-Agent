import { useState, useEffect, useCallback } from "react";

export type CustomProtocol = "openai" | "anthropic" | "custom";

export interface CustomProvider {
  id: string;
  name: string;
  protocol: CustomProtocol;
  baseURL: string;
  defaultModel: string;
  createdAt: number;
}

const KEY_LLM = "chatvrm:custom-llm:v1";
const KEY_TTS = "chatvrm:custom-tts:v1";
const LIMIT = 20;

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

function write<T>(key: string, list: T[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // quota or private mode — silently drop
  }
}

function uid(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useCustomLLM() {
  const [list, setList] = useState<CustomProvider[]>([]);

  useEffect(() => {
    setList(read<CustomProvider>(KEY_LLM));
  }, []);

  const add = useCallback(
    (input: Omit<CustomProvider, "id" | "createdAt">): { ok: boolean; reason?: string } => {
      const current = read<CustomProvider>(KEY_LLM);
      if (current.length >= LIMIT) return { ok: false, reason: "limit" };
      const item: CustomProvider = { ...input, id: uid(), createdAt: Date.now() };
      const next = [...current, item];
      write(KEY_LLM, next);
      setList(next);
      return { ok: true };
    },
    []
  );

  const update = useCallback(
    (id: string, patch: Partial<Omit<CustomProvider, "id" | "createdAt">>): void => {
      const current = read<CustomProvider>(KEY_LLM);
      const next = current.map((p) => (p.id === id ? { ...p, ...patch } : p));
      write(KEY_LLM, next);
      setList(next);
    },
    []
  );

  const remove = useCallback((id: string): void => {
    const current = read<CustomProvider>(KEY_LLM);
    const next = current.filter((p) => p.id !== id);
    write(KEY_LLM, next);
    setList(next);
  }, []);

  return { list, add, update, remove, limit: LIMIT };
}

export function useCustomTTS() {
  const [list, setList] = useState<CustomProvider[]>([]);

  useEffect(() => {
    setList(read<CustomProvider>(KEY_TTS));
  }, []);

  const add = useCallback(
    (input: Omit<CustomProvider, "id" | "createdAt">): { ok: boolean; reason?: string } => {
      const current = read<CustomProvider>(KEY_TTS);
      if (current.length >= LIMIT) return { ok: false, reason: "limit" };
      const item: CustomProvider = { ...input, id: uid(), createdAt: Date.now() };
      const next = [...current, item];
      write(KEY_TTS, next);
      setList(next);
      return { ok: true };
    },
    []
  );

  const update = useCallback(
    (id: string, patch: Partial<Omit<CustomProvider, "id" | "createdAt">>): void => {
      const current = read<CustomProvider>(KEY_TTS);
      const next = current.map((p) => (p.id === id ? { ...p, ...patch } : p));
      write(KEY_TTS, next);
      setList(next);
    },
    []
  );

  const remove = useCallback((id: string): void => {
    const current = read<CustomProvider>(KEY_TTS);
    const next = current.filter((p) => p.id !== id);
    write(KEY_TTS, next);
    setList(next);
  }, []);

  return { list, add, update, remove, limit: LIMIT };
}
