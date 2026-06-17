import type { KoeiroParam } from "@/features/constants/koeiroParam";

/**
 * A digital character bundles together everything that defines a
 * conversational avatar: the 3D model, the personality prompt, and
 * the voice position. Users can keep several characters and switch
 * between them without re-uploading or re-tuning each time.
 *
 * `vrmSource` is either:
 *   - a URL path served from /public (e.g. "/AvatarSample_B.vrm"), or
 *   - a reference into the IndexedDB blob store, of the form "blob:<id>"
 */
export interface Character {
  id: string;
  name: string;
  vrmSource: string;
  systemPrompt: string;
  koeiroParam: KoeiroParam;
  /** Marks characters that ship with the app and cannot be deleted. */
  builtin?: boolean;
  createdAt: number;
  updatedAt: number;
}

export const BLOB_PREFIX = "blob:";

export function isBlobSource(source: string): boolean {
  return source.startsWith(BLOB_PREFIX);
}

export function blobIdFromSource(source: string): string {
  return source.slice(BLOB_PREFIX.length);
}
