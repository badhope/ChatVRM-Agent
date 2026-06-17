import type { Character } from "./types";
import { BUILTIN_CHARACTERS } from "./defaults";

/**
 * Two-tier persistence for characters:
 *
 *   - localStorage  → character metadata list + active id
 *                     (small JSON, fast to read on every render)
 *   - IndexedDB     → raw VRM file blobs
 *                     (VRM files are typically 2–10 MB, well over
 *                      localStorage's 5 MB quota)
 *
 * The dead code in vrmViewer/localStorage.ts tried to base64 VRM
 * files into localStorage — that path was never wired up and would
 * blow the quota on any real model. This module replaces it.
 */

const META_KEY = "chatVRM_characters";
const ACTIVE_KEY = "chatVRM_active_character";
const DB_NAME = "chatvrm-agent";
const DB_VERSION = 1;
const BLOB_STORE = "vrm_blobs";

// ---------------------------------------------------------------------------
// localStorage: character metadata
// ---------------------------------------------------------------------------

function safeReadMeta(): Character[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Character[];
  } catch {
    return [];
  }
}

function safeWriteMeta(chars: Character[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(META_KEY, JSON.stringify(chars));
  } catch (e) {
    // Quota exceeded — most likely the user has many characters with
    // very long prompts. Drop the oldest non-builtin and retry once.
    console.warn("[characters] metadata write failed, retrying", e);
    const trimmed = chars.filter((c, i) => c.builtin || i < chars.length - 1);
    try {
      localStorage.setItem(META_KEY, JSON.stringify(trimmed));
    } catch {
      // give up silently — the in-memory state still works for this session
    }
  }
}

/**
 * Load all characters, seeding built-ins on first run. Built-ins are
 * merged in by id so user edits to builtin characters persist.
 */
export function loadCharacters(): Character[] {
  const stored = safeReadMeta();
  const byId = new Map<string, Character>();
  // Seed built-ins first so user overrides win.
  for (const b of BUILTIN_CHARACTERS) {
    byId.set(b.id, { ...b });
  }
  for (const c of stored) {
    byId.set(c.id, c);
  }
  return Array.from(byId.values()).sort((a, b) => {
    // built-ins first, then by createdAt
    if (a.builtin && !b.builtin) return -1;
    if (!a.builtin && b.builtin) return 1;
    return a.createdAt - b.createdAt;
  });
}

export function saveCharacters(chars: Character[]): void {
  // Only persist non-builtin metadata; built-ins are re-seeded on load.
  // (If a builtin was edited, we DO persist the override — that's fine
  //  because loadCharacters merges by id with builtins as the base.)
  safeWriteMeta(chars);
}

export function loadActiveId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// IndexedDB: VRM file blobs
// ---------------------------------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Store a VRM file blob, returning the id to reference it by. */
export async function saveVrmBlob(blob: Blob): Promise<string> {
  const id = `blob_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const db = await openDb();
  try {
    const tx = db.transaction(BLOB_STORE, "readwrite");
    tx.objectStore(BLOB_STORE).put(blob, id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return id;
  } finally {
    db.close();
  }
}

/** Fetch a stored VRM blob by id, or null if missing. */
export async function loadVrmBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(BLOB_STORE, "readonly");
      const req = tx.objectStore(BLOB_STORE).get(id);
      return await new Promise<Blob | null>((resolve, reject) => {
        req.onsuccess = () => resolve((req.result as Blob) ?? null);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

/** Delete a stored VRM blob. Safe to call with an unknown id. */
export async function deleteVrmBlob(id: string): Promise<void> {
  try {
    const db = await openDb();
    try {
      const tx = db.transaction(BLOB_STORE, "readwrite");
      tx.objectStore(BLOB_STORE).delete(id);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch {
    // ignore — best-effort cleanup
  }
}
