/** Join a base URL with a path, normalising slashes. */
export function joinURL(base: string, path: string): string {
  if (!base) throw new Error("Base URL is required");
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}