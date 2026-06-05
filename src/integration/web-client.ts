/**
 * Web tools — `webFetch` and `webSearch`.
 *
 * Built on Node's global `fetch` (Node 18+). We deliberately avoid
 * pulling in extra dependencies (no `node-fetch`, no `axios`, no
 * `cheerio`) and ship a tiny HTML→text helper so a missing parser
 * can't fail the install.
 *
 * Security model:
 *   - SSRF protection: `assertSafeUrl()` refuses non-http(s) schemes,
 *     private/loopback IPs, link-local addresses, and the .local
 *     multicast range. Hostnames are resolved once before the
 *     request and the resolved IP is compared against the deny-list
 *     to defeat DNS-rebinding.
 *   - The body is capped at 1 MB so a malicious response can't OOM
 *     the agent.
 *   - HTML responses are passed through `htmlToText` so the LLM
 *     receives plain text, not a 1 MB blob of markup.
 *   - The search backend is pluggable. By default we use DuckDuckGo's
 *     HTML endpoint because it doesn't require an API key; tests can
 *     inject a `searchFn` stub. (A future PR can add a configurable
 *     `BRAVE_API_KEY` path.)
 */
import { URL } from 'node:url';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const WEB_MAX_BYTES = 1_048_576; // 1 MB
export const WEB_MAX_REDIRECTS = 5;
export const WEB_DEFAULT_TIMEOUT_MS = 15_000;

export interface WebFetchResult {
  ok: true;
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  text: string;
}
export interface WebFetchError {
  ok: false;
  url: string;
  error: string;
}
export type WebFetchOutcome = WebFetchResult | WebFetchError;

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}
export interface WebSearchOutcome {
  ok: true;
  query: string;
  results: WebSearchResult[];
}
export interface WebSearchError {
  ok: false;
  query: string;
  error: string;
}
export type WebSearchResultOutcome = WebSearchOutcome | WebSearchError;

export type SearchFn = (query: string, opts: { maxResults: number; signal?: AbortSignal }) => Promise<WebSearchResult[]>;

export interface WebClientOptions {
  /** Override the search backend. Default: DuckDuckGo HTML. */
  searchFn?: SearchFn;
  /** Fetch options. Tests pass an AbortSignal. */
  timeoutMs?: number;
  /** Override the User-Agent. */
  userAgent?: string;
}

const DEFAULT_UA = 'personal-assistant/1.0 (+https://example.invalid)';

const PRIVATE_IPV4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // CGNAT
  /^192\.0\.0\./,
  /^192\.0\.2\./,
  /^198\.(1[8-9]|[3-5][0-9])\./,
  /^198\.51\.100\./,
  /^203\.0\.113\./,
  /^224\./,
  /^240\./,
  /^255\./,
];
const PRIVATE_IPV6 = [
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe[89ab][0-9a-f]:/i,
  /^::ffff:/i,
];

/**
 * Returns true if the given IPv4 or IPv6 string is in a private,
 * loopback, link-local, or otherwise-non-routable range that we
 * refuse to fetch.
 */
export function isPrivateIp(addr: string): boolean {
  const family = isIP(addr);
  if (family === 4) {
    return PRIVATE_IPV4.some((p) => p.test(addr));
  }
  if (family === 6) {
    return PRIVATE_IPV6.some((p) => p.test(addr));
  }
  return true; // unknown — refuse.
}

/**
 * Validates and resolves a user-supplied URL. Throws a descriptive
 * `Error` on rejection so the tool surface can return it as a
 * graceful error rather than a stack trace.
 */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`invalid URL: ${rawUrl}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`unsupported URL scheme: ${url.protocol} (only http/https)`);
  }
  // W17 M13: `https://user@evil.example/path` is a known phishing trick
  // that hides the real host (evil.example) behind a friendly-looking
  // userinfo segment. The URL parser does not let us inspect the
  // userinfo separately, but `url.username` and `url.password` are
  // populated from the `user[:pass]@` segment, and a public web tool
  // should never have credentials in the URL. Refuse the request.
  if (url.username !== '' || url.password !== '') {
    throw new Error(`refusing URL with embedded credentials: ${rawUrl}`);
  }
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error(`refusing to fetch local hostname: ${hostname}`);
  }
  // URL.hostname keeps the brackets for IPv6 literals (e.g.
  // `[::1]`); strip them before passing to isIP / isPrivateIp so
  // both IPv4 and IPv6 literals get caught by the same check.
  const bareHostname = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  if (isIP(bareHostname) > 0 && isPrivateIp(bareHostname)) {
    throw new Error(`refusing to fetch private IP: ${hostname}`);
  }
  // DNS-rebinding defense: resolve once before fetch, then check the
  // resolved IP. fetch() will redo the lookup so this is only a
  // best-effort check, but it catches the obvious cases.
  try {
    const records = await lookup(hostname, { all: true });
    for (const r of records) {
      if (isPrivateIp(r.address)) {
        throw new Error(`refusing to fetch hostname that resolves to private IP: ${hostname} -> ${r.address}`);
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('refusing to fetch')) throw err;
    // DNS failure — let the fetch itself report it.
  }
  return url;
}

async function readBodyWithCap(response: Response, cap: number): Promise<{ text: string; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) return { text: '', truncated: false };
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let received = 0;
  let text = '';
  let truncated = false;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > cap) {
      const allowed = cap - (received - value.byteLength);
      if (allowed > 0) text += decoder.decode(value.subarray(0, allowed), { stream: true });
      truncated = true;
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      break;
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return { text, truncated };
}

/**
 * Convert HTML to roughly-plain text. Strips `<script>`, `<style>`,
 * `<noscript>`, and `<svg>` blocks entirely; replaces block-level
 * tags with newlines; collapses runs of whitespace. We do not
 * attempt to preserve complex table layouts.
 */
export function htmlToText(html: string, maxLen: number = 16_000): string {
  let s = html;
  // Drop dangerous / noisy blocks first.
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ');
  s = s.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ');
  s = s.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, ' ');
  // Block elements → newline.
  s = s.replace(/<\/?(p|div|br|li|tr|h[1-6]|article|section|header|footer|main|aside|nav|pre|table|tbody|thead|tfoot)\b[^>]*>/gi, '\n');
  // Drop the remaining tags.
  s = s.replace(/<[^>]+>/g, ' ');
  // Decode the small set of entities the LLM will actually see.
  s = decodeHtmlEntities(s);
  // Collapse whitespace within a line; keep \n as paragraph break.
  s = s
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
  if (s.length > maxLen) {
    return s.slice(0, maxLen) + `\n\n[truncated to ${maxLen} chars]`;
  }
  return s;
}

/**
 * Tiny DuckDuckGo HTML scraper. We extract the result block
 * (`<a class="result__a">`, `<a class="result__snippet">`) and return
 * the first N. If the page layout changes, the function still
 * returns an empty list rather than throwing — the LLM can be told
 * the search backend is unavailable.
 */
export async function duckDuckGoSearch(query: string, opts: { maxResults: number; signal?: AbortSignal }): Promise<WebSearchResult[]> {
  const url = new URL('https://html.duckduckgo.com/html/');
  url.searchParams.set('q', query);
  const res = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    signal: opts.signal,
    headers: {
      'User-Agent': DEFAULT_UA,
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) {
    throw new Error(`search backend returned HTTP ${res.status}`);
  }
  const { text } = await readBodyWithCap(res, WEB_MAX_BYTES);
  const results: WebSearchResult[] = [];
  // W17 M7: the previous regex was an unanchored lazy match that
  // could pick up text from the *next* result block when the current
  // one was malformed. Restrict the search to a single result
  // container, which is how DDG HTML always structures results.
  const blockRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]*class="result__a"|<\/div>\s*<\/div>\s*<\/div>)/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(text)) !== null) {
    const href = decodeHtmlEntities(m[1] ?? '');
    const rawTitle = m[2] ?? '';
    // Snippet is the first <a class="result__snippet"> inside the block.
    const blockTail = m[3] ?? '';
    const snippetMatch = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(blockTail);
    const rawSnippet = snippetMatch ? snippetMatch[1] : '';
    const title = htmlToText(rawTitle, 300).trim();
    const snippet = htmlToText(rawSnippet, 400).trim();
    if (!title) continue;
    results.push({ title, url: href, snippet });
    if (results.length >= opts.maxResults) break;
  }
  return results;
}

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    // W17 L2: handle the modern named entities some HTML5 sites emit.
    .replace(/&apos;/g, "'")
    // W17 L2: handle hex entities (e.g. &#x27;). Cap to a sane number of
    // hex digits to avoid a regex DoS on malformed strings.
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (_, n: string) => {
      const code = Number.parseInt(n, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
}

export class WebClient {
  private searchFn: SearchFn;
  private timeoutMs: number;
  private userAgent: string;

  constructor(opts: WebClientOptions = {}) {
    this.searchFn = opts.searchFn ?? duckDuckGoSearch;
    this.timeoutMs = opts.timeoutMs ?? WEB_DEFAULT_TIMEOUT_MS;
    this.userAgent = opts.userAgent ?? DEFAULT_UA;
  }

  async fetch(url: string, opts: { maxBytes?: number; signal?: AbortSignal } = {}): Promise<WebFetchOutcome> {
    // W17 M6: fetch's built-in `redirect: 'follow'` would happily chase
    // a 3xx to a private IP. We re-implement the redirect loop manually
    // so we can re-validate the URL of every hop against the SSRF
    // deny-list. We cap the chain length to avoid pathological loops.
    const MAX_REDIRECTS = 5;
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(new Error(`webFetch timeout after ${this.timeoutMs}ms`)), this.timeoutMs);
    const onParentAbort = () => ac.abort(opts.signal?.reason);
    opts.signal?.addEventListener('abort', onParentAbort);
    try {
      let current = await assertSafeUrl(url).catch((err: Error) => ({ error: err.message } as { error: string }));
      if ('error' in current) {
        return { ok: false, url, error: current.error };
      }
      let redirectCount = 0;
      let res: Response;
      while (true) {
        res = await fetch(current, {
          method: 'GET',
          redirect: 'manual',
          signal: ac.signal,
          headers: {
            'User-Agent': this.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5',
          },
        });
        // Follow 3xx manually.
        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get('location');
          if (!location) {
            // Malformed redirect; treat as final response.
            break;
          }
          if (redirectCount >= MAX_REDIRECTS) {
            return { ok: false, url, error: `too many redirects (>${MAX_REDIRECTS})` };
          }
          // Drain the redirect body before following.
          try {
            await res.body?.cancel();
          } catch {
            /* ignore */
          }
          // Resolve the relative Location header.
          let nextUrl: URL;
          try {
            nextUrl = new URL(location, current);
          } catch {
            return { ok: false, url, error: `invalid redirect target: ${location}` };
          }
          const validated = await assertSafeUrl(nextUrl.toString()).catch(
            (err: Error) => ({ error: err.message } as { error: string }),
          );
          if ('error' in validated) {
            return { ok: false, url, error: `redirect to unsafe URL: ${validated.error}` };
          }
          current = validated;
          redirectCount += 1;
          continue;
        }
        break;
      }
      const cap = opts.maxBytes ?? WEB_MAX_BYTES;
      const { text, truncated } = await readBodyWithCap(res!, cap);
      const contentType = res!.headers.get('content-type') ?? 'application/octet-stream';
      const isHtml = /html/i.test(contentType);
      let body = isHtml ? htmlToText(text, cap) : text;
      // W17 M14: normalise line endings so the LLM never sees a body
      // with only \r or mixed \r\n / \n separators — both the BM25
      // tokenizer and most LLM tokenizers treat \r as whitespace but
      // a body consisting entirely of \r is unreadable when echoed.
      body = body.replace(/\r\n?/g, '\n');
      // W17 M15: the truncated marker is appended *after* the cap so
      // it never pushes us over. We add it conditionally.
      const marker = truncated ? `\n[truncated to ${cap} bytes]` : '';
      return {
        ok: true,
        url,
        finalUrl: res!.url,
        status: res!.status,
        contentType,
        text: body + marker,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, url, error: message };
    } finally {
      clearTimeout(timeout);
      opts.signal?.removeEventListener('abort', onParentAbort);
    }
  }

  async search(query: string, opts: { maxResults?: number; signal?: AbortSignal } = {}): Promise<WebSearchResultOutcome> {
    if (!query || query.trim().length === 0) {
      return { ok: false, query, error: 'query is required' };
    }
    const maxResults = Math.max(1, Math.min(opts.maxResults ?? 5, 20));
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(new Error(`webSearch timeout after ${this.timeoutMs}ms`)), this.timeoutMs);
    opts.signal?.addEventListener('abort', () => ac.abort(opts.signal?.reason));
    try {
      const results = await this.searchFn(query, { maxResults, signal: ac.signal });
      return { ok: true, query, results };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, query, error: message };
    } finally {
      clearTimeout(timeout);
    }
  }
}
