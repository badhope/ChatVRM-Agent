/**
 * Load a VRM blob URL from localStorage.
 * Returns the URL if a valid VRM file was previously saved, or null otherwise.
 */
export function loadVrmFromLocalStorage(): string | null {
  try {
    const item = localStorage.getItem("vrmFile");
    if (!item) return null;
    const { data, type } = JSON.parse(item);
    if (!data || !type) return null;
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes.buffer], { type });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/**
 * Save a VRM file to localStorage as a base64 data URL.
 */
export function saveVrmToLocalStorage(blobUrl: string): void {
  try {
    // We can't directly store the blob URL, so we'd need to fetch the blob.
    // For now, this is a placeholder — the actual saving happens in the menu
    // component when a VRM file is dropped.
  } catch {
    // Silently ignore
  }
}