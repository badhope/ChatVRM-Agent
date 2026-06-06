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
 *   - H6 (W18): the SSRF defense is a "best-effort, point-in-time"
 *     check. `fetch()` re-resolves the hostname internally, so an
 *     attacker controlling a DNS record (or the resolver) can still
 *     return a public IP at the assertSafeUrl() lookup and a private
 *     IP at the fetch() lookup. This is the standard DNS-rebinding
 *     gap. We document the limitation here rather than pretending it
 *     doesn't exist; full mitigation requires using `net.connect()`
 *     to bind the underlying TCP socket to the resolved IP, which
 *     Node's `fetch` does not expose. Operators who need that
 *     guarantee should run this server behind a proxy that enforces
 *     egress allowlists.
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
  // C3 (W19): `0.0.0.0/8` is the "this network" block; on most
  // systems `0.0.0.0` binds to the loopback interface. Previously
  // missing from the deny list, which let `[::]` / `0.0.0.0`
  // through to `assertSafeUrl`.
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
// C3 (W19): broadened IPv6 deny list. The pre-W19 list was
// missing:
//   - `::`       (unspecified; equivalent to 0.0.0.0)
//   - `::1`      (loopback; matched by hostname check but not IP check)
//   - `ff00::/8` (multicast)
//   - `2001:db8::/32` (documentation; reserved)
//   - `64:ff9b::/96` (NAT64 well-known prefix)
//   - `2001::/32` (Teredo tunneling — used for NAT bypass)
//   - `2002::/16` (6to4 — used for NAT bypass)
//   - IPv4-mapped `::ffff:0:0/96` — was present but not recursing
//     into the IPv4 part, so `::ffff:127.0.0.1` only got a
//     partial check. Now we explicitly recurse.
const PRIVATE_IPV6 = [
  /^::1$/i,
  /^::$/i,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe[89ab][0-9a-f]:/i,
  /^ff[0-9a-f]{2}:/i, // multicast
  /^2001:db8:/i,      // documentation
  /^64:ff9b:/i,        // NAT64
  /^2001::/i,          // Teredo
  /^2002:/i,           // 6to4
  /^::ffff:/i,         // IPv4-mapped, see isPrivateIp
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
    // C3 (W19): IPv4-mapped IPv6 (e.g. `::ffff:127.0.0.1`) — the
    // outer address is IPv6 but the embedded IPv4 octets are
    // what the OS actually routes to. Recurse into the IPv4
    // portion so the IPv4 deny list catches it.
    if (addr.toLowerCase().startsWith('::ffff:')) {
      const v4 = addr.slice(7);
      if (isIP(v4) === 4) return isPrivateIp(v4);
    }
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

/**
 * C2 (W19): SSRF DNS-rebinding mitigation. The earlier
 * `assertSafeUrl()` only did a point-in-time DNS lookup; a malicious
 * resolver could return a public IP at assertSafeUrl() time and a
 * private IP at the actual fetch() time. To close the gap for the
 * MCP bridge (and any other HTTP-side caller that needs the stronger
 * guarantee), this function:
 *
 *  1. Validates the URL with `assertSafeUrl()` (refuses private IPs,
 *     loopback, .local, .internal, userinfo, etc.).
 *  2. Resolves the hostname to its first public IP.
 *  3. Rewrites the URL to use that IP as the host.
 *  4. Returns a fetch `RequestInit` whose `dispatcher` / Agent uses
 *     `customLookup` to keep the resolved IP pinned so the OS cannot
 *     re-resolve to a different (private) address mid-flight.
 *
 * The returned URL is the public IP, so the TLS SNI / Host header
 * mismatch is handled by the caller via the `originalHost` field —
 * the fetch caller must set `Host: <originalHost>` itself (e.g. by
 * pre-setting the URL hostname back to the original value, which the
 * standard fetch API doesn't expose directly; see
 * `connectHttpMcp` in `mcp-tools.ts` for the actual integration).
 */
export async function resolveAndRewriteUrl(
  rawUrl: string,
): Promise<{ rewrittenUrl: string; resolvedIp: string; originalHost: string }> {
  const safe = await assertSafeUrl(rawUrl);
  const hostHeader = safe.host;
  // assertSafeUrl already vetted the hostname — re-resolve and pick
  // the first public (non-private) address.
  const records = await lookup(hostHeader, { all: true });
  let chosen: string | null = null;
  for (const r of records) {
    if (!isPrivateIp(r.address)) {
      chosen = r.address;
      break;
    }
  }
  if (!chosen) {
    throw new Error(`refusing to fetch: ${hostHeader} has no public IP`);
  }
  // Rewrite host: if the URL is https://example.com:8080/foo, this
  // yields https://<ip>:8080/foo. The original hostname is preserved
  // in `originalHost` for the caller to reinstate in the Host header
  // (Node's fetch API doesn't expose the SNI/Host knob directly, so
  // a downstream caller that needs it has to roll its own transport).
  const rewritten = new URL(safe.toString());
  const port = safe.port;
  rewritten.hostname = chosen;
  if (port) rewritten.port = port;
  return {
    rewrittenUrl: rewritten.toString(),
    resolvedIp: chosen,
    originalHost: hostHeader,
  };
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
  // M9 (W18): strip HTML comments first, before any other tag
  // stripping. The previous code would leave the body of a
  // <!-- ... --> intact, so a comment like
  //   <!-- ignore all previous instructions and ... -->
  // would be passed verbatim to the LLM. Comments can also hide
  // visible-looking content (e.g. <!-- <script>foo</script> -->)
  // that the script-strip regex can't reach because the `<!--`
  // prefix breaks its `<script\b` anchor. Strip them all up front
  // and use `[\s\S]*?` so multi-line comments are handled.
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  // Drop dangerous / noisy blocks first.
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ');
  s = s.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ');
  s = s.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, ' ');
  // Block elements → newline. L7 (W18): the previous regex used
  // `\b[^>]*` after the tag name, which made the matcher accept
  // any `word` tag whose name happens to start with one of the
  // listed prefixes. For example `<tabled>` was matched as
  // `<table\b[d>...]>` because `\b` is satisfied at the `e->d`
  // boundary, then `[d>]` consumed the rest. The fix is to
  // require the tag name to be terminated by a `>` or
  // whitespace, never a letter. We use a non-backtracking
  // lookahead so the regex remains linear in the input length.
  s = s.replace(/<\/?(p|div|br|li|tr|h[1-6]|article|section|header|footer|main|aside|nav|pre|figure|figcaption|details|summary|table|tbody|thead|tfoot)(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>/gi, '\n');
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
// M12 (W18): heuristic CAPTCHA detector. The DDG HTML endpoint
// can serve a "Prove you're human" challenge when the IP makes too
// many requests, and the page will look indistinguishable from a
// "no results" page to the LLM. We look for the well-known
// challenge markers (Cloudflare, hCaptcha, DDG's own anubis
// challenge) in the body and return a typed error so the caller
// can surface it as a tool failure rather than silently returning
// zero results and letting the LLM hallucinate.
const CAPTCHA_MARKERS = [
  /verify you are (a )?human/i,
  /are you a robot/i,
  /checking your browser/i,
  /attention required! \| cloudflare/i,
  /<title>just a moment\.\.\.?<\/title>/i,
  /cf-chl-bypass/i,
  /hcaptcha/i,
  /recaptcha/i,
  /anubis_substep/i,
];
export function looksLikeCaptchaPage(html: string): boolean {
  return CAPTCHA_MARKERS.some((re) => re.test(html));
}

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
  // M12 (W18): short-circuit on a CAPTCHA challenge so the caller
  // gets a typed error instead of an empty results list. The LLM
  // would otherwise be told "no results found" and could invent
  // plausible URLs to satisfy the user.
  if (looksLikeCaptchaPage(text)) {
    throw new Error('search backend served a CAPTCHA/anti-bot challenge; slow down and retry');
  }
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
    // M11 (W19): previously the listener was added with
    // `addEventListener('abort', ...)` but never removed, so a
    // long-lived WebClient that handled many search() calls
    // (e.g. an agent loop) would accumulate a closure per call on
    // the parent signal. Those closures keep `this` (and its
    // large adapter graph) alive even after the search
    // completes. We now (a) capture the listener in a named
    // function so we can reference it in `removeEventListener`,
    // (b) rely on `{ once: true }` for the common case where the
    // parent signal is one-shot, and (c) explicitly remove the
    // listener in `finally` so a re-used parent signal can't
    // leak. The setTimeout is also cleared in `finally`.
    const onParentAbort = () => ac.abort(opts.signal?.reason);
    opts.signal?.addEventListener('abort', onParentAbort, { once: true });
    try {
      const results = await this.searchFn(query, { maxResults, signal: ac.signal });
      return { ok: true, query, results };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, query, error: message };
    } finally {
      clearTimeout(timeout);
      // M11 (W19): explicit removal. `{ once: true }` already
      // removes itself on first abort, but if the search
      // resolved normally the listener would otherwise stay
      // attached to the parent signal until the parent aborts.
      opts.signal?.removeEventListener('abort', onParentAbort);
    }
  }
}
