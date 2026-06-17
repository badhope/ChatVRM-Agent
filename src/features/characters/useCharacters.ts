import { useCallback, useEffect, useRef, useState } from "react";
import type { Character } from "./types";
import { isBlobSource, blobIdFromSource } from "./types";
import type { KoeiroParam } from "@/features/constants/koeiroParam";
import {
  loadCharacters,
  saveCharacters,
  loadActiveId,
  saveActiveId,
  saveVrmBlob,
  loadVrmBlob,
  deleteVrmBlob,
} from "./storage";

/**
 * React hook that owns the character list and the active character.
 *
 * The hook is intentionally "dumb" about the 3D viewer — it only
 * manages data. The host component (index.tsx) is responsible for
 * applying a character's VRM/prompt/voice to the viewer and to the
 * LLM/TTS settings when `activeId` changes.
 *
 * Persistence:
 *   - metadata list  → localStorage (debounced via effect)
 *   - active id      → localStorage (immediate)
 *   - VRM file blobs → IndexedDB (only when adding/replacing a model)
 */
export function useCharacters() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  // SSR guard: don't pretend we've loaded until we actually have.
  const [ready, setReady] = useState(false);

  // Track object URLs we've minted so we can revoke them on swap/unmount.
  const objectUrlsRef = useRef<Set<string>>(new Set());

  // ---- initial load (client-only) ----
  useEffect(() => {
    const list = loadCharacters();
    setCharacters(list);
    let id = loadActiveId();
    if (!id || !list.some((c) => c.id === id)) {
      id = list[0]?.id ?? null;
    }
    setActiveIdState(id);
    setReady(true);
    // We intentionally do NOT save here — if the list was just seeded
    // from builtins, writing immediately would persist builtin metadata
    // that's already re-merged on load. Save on first real mutation.
    // Capture the current ref value so the cleanup runs against the
    // same set even if the ref was mutated later.
    const urlsToRevoke = objectUrlsRef.current;
    return () => {
      // Revoke any object URLs we created so we don't leak blob URLs
      // across hot reloads / Strict Mode remounts.
      for (const url of urlsToRevoke) {
        URL.revokeObjectURL(url);
      }
      urlsToRevoke.clear();
    };
  }, []);

  // ---- persist metadata whenever it changes (after ready) ----
  useEffect(() => {
    if (!ready) return;
    saveCharacters(characters);
  }, [characters, ready]);

  const setActiveId = useCallback((id: string) => {
    setActiveIdState(id);
    saveActiveId(id);
  }, []);

  const active = characters.find((c) => c.id === activeId) ?? null;

  // ---- mutations ----

  /**
   * Update the active character's fields. Pass a partial; the hook
   * merges it, bumps updatedAt, and persists.
   */
  const updateActive = useCallback(
    (patch: Partial<Omit<Character, "id" | "createdAt" | "builtin">>) => {
      setCharacters((prev) => {
        if (!activeId) return prev;
        return prev.map((c) =>
          c.id === activeId
            ? { ...c, ...patch, updatedAt: Date.now() }
            : c
        );
      });
    },
    [activeId]
  );

  /**
   * Update any character by id (used by the rename UI on non-active
   * cards, etc.).
   */
  const updateCharacter = useCallback(
    (id: string, patch: Partial<Omit<Character, "id" | "createdAt">>) => {
      setCharacters((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c
        )
      );
    },
    []
  );

  /**
   * Create a new character from the given seed and switch to it.
   * If `vrmFile` is provided, it's stored in IndexedDB and the new
   * character's vrmSource points to it.
   */
  const createCharacter = useCallback(
    async (opts: {
      name: string;
      systemPrompt: string;
      koeiroParam: KoeiroParam;
      vrmFile?: File;
      vrmSource?: string; // use existing source if no new file
    }) => {
      let vrmSource = opts.vrmSource ?? "/AvatarSample_B.vrm";
      if (opts.vrmFile) {
        const blobId = await saveVrmBlob(opts.vrmFile);
        vrmSource = `blob:${blobId}`;
      }
      const now = Date.now();
      const id = `char_${now}_${Math.random().toString(36).slice(2, 8)}`;
      const character: Character = {
        id,
        name: opts.name,
        vrmSource,
        systemPrompt: opts.systemPrompt,
        koeiroParam: opts.koeiroParam,
        builtin: false,
        createdAt: now,
        updatedAt: now,
      };
      setCharacters((prev) => [...prev, character]);
      setActiveId(id);
      return character;
    },
    [setActiveId]
  );

  /**
   * Replace the active character's VRM with an uploaded file. The
   * previous blob (if any) is deleted from IndexedDB.
   */
  const setActiveVrmFile = useCallback(
    async (file: File) => {
      if (!activeId) return;
      const blobId = await saveVrmBlob(file);
      const newSource = `blob:${blobId}`;
      setCharacters((prev) => {
        const cur = prev.find((c) => c.id === activeId);
        if (cur && isBlobSource(cur.vrmSource)) {
          // best-effort cleanup of the old blob
          void deleteVrmBlob(blobIdFromSource(cur.vrmSource));
        }
        return prev.map((c) =>
          c.id === activeId
            ? { ...c, vrmSource: newSource, updatedAt: Date.now() }
            : c
        );
      });
    },
    [activeId]
  );

  /**
   * Delete a character. Built-ins cannot be deleted. The active
   * character's blob is removed from IndexedDB; if the deleted char
   * was active, the first remaining character becomes active.
   */
  const deleteCharacter = useCallback(
    (id: string) => {
      setCharacters((prev) => {
        const target = prev.find((c) => c.id === id);
        if (!target || target.builtin) return prev;
        if (isBlobSource(target.vrmSource)) {
          void deleteVrmBlob(blobIdFromSource(target.vrmSource));
        }
        const next = prev.filter((c) => c.id !== id);
        // If we're deleting the active one, fall back to the first
        // remaining character (built-ins first by sort order).
        if (activeId === id) {
          const fallback = next[0]?.id ?? null;
          if (fallback) {
            setActiveIdState(fallback);
            saveActiveId(fallback);
          } else {
            setActiveIdState(null);
          }
        }
        return next;
      });
    },
    [activeId]
  );

  /**
   * Resolve a character's vrmSource to a loadable URL.
   *   - "/path"      → returned as-is (served from /public)
   *   - "blob:<id>"  → fetched from IndexedDB and turned into an
   *                    object URL. The caller does NOT need to revoke
   *                    it; the hook tracks and revokes on swap/unmount.
   */
  const resolveVrmUrl = useCallback(
    async (source: string): Promise<string | null> => {
      if (!isBlobSource(source)) return source;
      const blob = await loadVrmBlob(blobIdFromSource(source));
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      objectUrlsRef.current.add(url);
      return url;
    },
    []
  );

  return {
    ready,
    characters,
    activeId,
    active,
    setActiveId,
    updateActive,
    updateCharacter,
    createCharacter,
    deleteCharacter,
    setActiveVrmFile,
    resolveVrmUrl,
  };
}
