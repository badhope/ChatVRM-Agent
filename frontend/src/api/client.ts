const BASE = '/api';

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${txt || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(p: string) => http<T>(p),
  post: <T>(p: string, body?: unknown) =>
    http<T>(p, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(p: string) => http<T>(p, { method: 'DELETE' }),
  put: <T>(p: string, body?: unknown) =>
    http<T>(p, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(p: string, body?: unknown) =>
    http<T>(p, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
};

export interface SSEMessage {
  event: string;
  data: string;
}

export async function* sseStream(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<SSEMessage> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`SSE ${res.status}: ${text || res.statusText}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const ev of events) {
        const lines = ev.split('\n');
        let eventName = 'message';
        let dataLines: string[] = [];
        for (const line of lines) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        }
        yield { event: eventName, data: dataLines.join('\n') };
      }
    }
  } finally {
    reader.releaseLock();
  }
}
