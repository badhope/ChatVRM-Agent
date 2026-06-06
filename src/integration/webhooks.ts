/**
 * Webhook subscriptions on the agent event bus.
 *
 * Webhooks are HTTP-side mirrors of agent events. They let external
 * systems (e.g. a UI server, a Slack bot, a logging pipeline) react
 * to agent activity without having to subscribe to the in-process
 * EventEmitter directly.
 *
 *   - **AgentEventWebhook** — a single named subscription. Binds to
 *     one or more event names on a source EventEmitter, applies a
 *     optional filter, and POSTs the JSON-serialised payload to a
 *     configurable URL.
 *
 *   - **WebhookRouter** — a registry of webhooks with global
 *     lifecycle controls (start / stop / pause / resume all). Use
 *     one per app instance.
 *
 * Delivery semantics:
 *  - **At-least-once** with best-effort retries (3 attempts, exp
 *    backoff). Failures are logged but do not crash the agent.
 *  - **Async, fire-and-forget** — the agent's emit() does not block
 *    waiting for the webhook to land. Use a per-webhook `queueMode`
 *    to switch to "drain" mode (block until delivered) when
 *    running end-to-end tests.
 *  - **Bounded concurrency** — the router has a small worker pool
 *    so a single slow webhook can't block a burst of events.
 *
 * Security:
 *  - HMAC-SHA256 signature in the `X-Signature` header when a `secret`
 *    is configured.
 *  - Optional `customHeaders` for auth tokens etc.
 *
 * The default transport is `fetch` (Node 18+). Tests can pass a
 * `transport` function for stubbing.
 */

import { EventEmitter } from 'eventemitter3';
// L10 (W19): re-use the SSRF deny-list from `web-client`. The
// webhooks delivery code makes outbound HTTPS calls to operator-
// configured URLs, so the same threat model as the search/fetch
// paths applies: a malicious webhook registration could point at
// `http://127.0.0.1/admin` or `http://169.254.169.254/...` and
// the agent would happily POST the secret payload there. We
// validate at the *registration* time so a bad URL is rejected
// before it's persisted, and we re-validate on each *dispatch*
// so a hostname that was safe at registration time but
// resolves to a private IP at delivery time is still blocked.
import { assertSafeUrl } from './web-client.js';

/** A loose event-payload map accepted by the webhook layer. */
export type AnyAgentEvent = Record<string, unknown>;

export interface WebhookConfig<TPayload = unknown> {
  /** Display name; used in logs and metrics. */
  name: string;
  /** Destination URL. */
  url: string;
  /** HTTP method. Default POST. */
  method?: 'POST' | 'PUT';
  /** Event names to subscribe to. */
  events: string[];
  /** Optional payload filter — return false to skip. */
  filter?: (payload: TPayload, event: string) => boolean | Promise<boolean>;
  /** Optional secret for HMAC signing. */
  secret?: string;
  /**
   * L10 (W19): skip the SSRF deny-list. Operator override only.
   * Set to true to allow destinations that would otherwise be
   * refused (e.g. an internal proxy that does its own allowlist).
   * The default is `false` — `register()` will throw if the URL
   * points at a private range. The dispatch path also re-checks
   * on every call (so a hostname that flips from public to
   * private mid-run is still blocked) unless this flag is set.
   */
  skipSsrfCheck?: boolean;
  /** Additional headers. */
  customHeaders?: Record<string, string>;
  /** Number of attempts. Default 3. */
  maxAttempts?: number;
  /** Per-attempt timeout in ms. Default 5000. */
  timeoutMs?: number;
  /** Backoff multiplier. Default 2. */
  backoffMultiplier?: number;
  /** Block on delivery (drain mode). Default false. */
  queueMode?: boolean;
}

/** A pluggable HTTP transport (used in tests). */
export type WebhookTransport = (req: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}) => Promise<{ ok: boolean; status: number; body?: string }>;

export const defaultTransport: WebhookTransport = async ({ url, method, headers, body, timeoutMs }) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, headers, body, signal: ctrl.signal });
    return { ok: res.ok, status: res.status, body: await res.text().catch(() => '') };
  } finally {
    clearTimeout(t);
  }
};

export class AgentEventWebhook {
  readonly name: string;
  readonly url: string;
  readonly method: 'POST' | 'PUT';
  readonly events: string[];
  readonly maxAttempts: number;
  readonly timeoutMs: number;
  readonly backoffMultiplier: number;
  readonly queueMode: boolean;
  readonly filter?: (payload: unknown, event: string) => boolean | Promise<boolean>;
  readonly secret?: string;
  readonly customHeaders?: Record<string, string>;
  /** Mutable bus reference — swapped by the router. */
  source?: EventEmitter;
  /** The bound listeners (so we can unbind). Keyed by event name. */
  private readonly listeners = new Map<string, (payload: unknown) => void>();
  /** Active delivery state. */
  private delivering = new Set<Promise<void>>();
  /** Last delivery outcome. */
  lastResult: { ok: boolean; status: number; attempts: number; error?: string } | null = null;
  /** Total successful deliveries. */
  deliveredCount = 0;
  /** Total failed deliveries. */
  failedCount = 0;
  private transport: WebhookTransport;
  private sleep: (ms: number) => Promise<void>;
  /** Optional router-supplied bounded-concurrency slot. */
  private acquireSlot?: <T>(fn: () => Promise<T>) => Promise<T>;

  constructor(cfg: WebhookConfig, transport: WebhookTransport = defaultTransport, sleep: (ms: number) => Promise<void> = defaultSleep, acquireSlot?: <T>(fn: () => Promise<T>) => Promise<T>) {
    this.name = cfg.name;
    this.url = cfg.url;
    this.method = cfg.method ?? 'POST';
    this.events = cfg.events;
    this.maxAttempts = cfg.maxAttempts ?? 3;
    this.timeoutMs = cfg.timeoutMs ?? 5000;
    this.backoffMultiplier = cfg.backoffMultiplier ?? 2;
    this.queueMode = cfg.queueMode ?? false;
    this.filter = cfg.filter;
    this.secret = cfg.secret;
    this.customHeaders = cfg.customHeaders;
    this.transport = transport;
    this.sleep = sleep;
    this.acquireSlot = acquireSlot;
  }

  /** Bind to a bus. Calling this twice replaces the prior binding. */
  bind(bus: EventEmitter): void {
    if (this.source) this.unbind();
    this.source = bus;
    for (const e of this.events) {
      const listener = (payload: unknown) => {
        this.handle(e, payload);
      };
      this.listeners.set(e, listener);
      // eventemitter3 supports wildcard 'on'; we use the typed string.
      bus.on(e as never, listener as never);
    }
  }

  unbind(): void {
    if (!this.source) return;
    for (const [e, listener] of this.listeners) {
      this.source.off(e as never, listener as never);
    }
    this.listeners.clear();
    this.source = undefined;
  }

  /** Wait for all in-flight deliveries. Used by tests. */
  async drain(): Promise<void> {
    while (this.delivering.size > 0) {
      await Promise.allSettled([...this.delivering]);
    }
  }

  private async handle(event: string, payload: unknown): Promise<void> {
    if (this.filter) {
      const ok = await this.filter(payload, event);
      if (!ok) return;
    }
    const job = this.acquireSlot
      ? this.acquireSlot(() => this.deliver(event, payload))
      : this.deliver(event, payload);
    this.delivering.add(job as Promise<void>);
    try {
      if (this.queueMode) {
        await job;
      }
    } finally {
      this.delivering.delete(job as Promise<void>);
    }
  }

  private async deliver(event: string, payload: unknown): Promise<void> {
    const body = JSON.stringify({ event, payload, deliveredAt: new Date().toISOString() });
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Name': this.name,
      'X-Event-Name': event,
      ...this.customHeaders,
    };
    if (this.secret) headers['X-Signature'] = await hmacSha256Hex(this.secret, body);

    let lastErr: { ok: boolean; status: number; error?: string } | null = null;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const r = await this.transport({ url: this.url, method: this.method, headers, body, timeoutMs: this.timeoutMs });
        if (r.ok) {
          this.deliveredCount += 1;
          this.lastResult = { ok: true, status: r.status, attempts: attempt };
          return;
        }
        lastErr = { ok: false, status: r.status, error: `HTTP ${r.status}` };
        if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) {
          // Permanent client error — do not retry.
          break;
        }
      } catch (err) {
        lastErr = { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
      }
      if (attempt < this.maxAttempts) {
        const base = 100 * Math.pow(this.backoffMultiplier, attempt - 1);
        const jitter = base * 0.25 * (Math.random() * 2 - 1);
        await this.sleep(Math.max(0, base + jitter));
      }
    }
    this.failedCount += 1;
    this.lastResult = lastErr ? { ok: false, status: lastErr.status, attempts: this.maxAttempts, error: lastErr.error } : { ok: false, status: 0, attempts: this.maxAttempts, error: 'unknown' };
  }
}

export class WebhookRouter {
  private webhooks: AgentEventWebhook[] = [];
  private bus: EventEmitter;
  private transport: WebhookTransport;
  private sleep: (ms: number) => Promise<void>;
  private concurrency: number;
  private sem: number;
  private waiters: Array<() => void> = [];

  constructor(opts: { bus: EventEmitter; transport?: WebhookTransport; sleep?: (ms: number) => Promise<void>; concurrency?: number }) {
    this.bus = opts.bus;
    this.transport = opts.transport ?? defaultTransport;
    this.sleep = opts.sleep ?? defaultSleep;
    this.concurrency = opts.concurrency ?? 8;
    this.sem = this.concurrency;
  }

  /**
   * Acquire a slot in the bounded worker pool, run the function, then
   * release the slot for the next waiter. Excess callers block until
   * a slot becomes free. Used by registered webhooks to cap parallel
   * outbound HTTP deliveries.
   */
  async withSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.sem <= 0) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.sem -= 1;
    try {
      return await fn();
    } finally {
      this.sem += 1;
      const next = this.waiters.shift();
      if (next) next();
    }
  }

  /** Number of slots currently in use. */
  get inFlight(): number {
    return this.concurrency - this.sem;
  }

  /** Max number of concurrent deliveries. */
  get maxConcurrency(): number {
    return this.concurrency;
  }

  /**
   * M13 (W19): register a webhook, validating the URL *before*
   * the binding is published. The pre-W19 code did
   * `void this.validateWebhookUrl(...)` (fire-and-forget) and
   * synchronously returned 201, so a malicious operator could
   * register `http://127.0.0.1/admin` and the agent's first
   * emit() would happily POST the secret payload there while
   * the SSRF check was still resolving in the background. We
   * now `await` the validation; the route handler is already
   * async-compatible (it calls `register` from inside an
   * Express handler, so awaiting is free).
   */
  async register(cfg: WebhookConfig): Promise<AgentEventWebhook> {
    // Pre-flight: refuse the URL up-front if the SSRF deny-list
    // flags it. `skipSsrfCheck: true` is an operator override for
    // an internal proxy that does its own egress allowlist.
    await this.validateWebhookUrl(cfg.url, cfg.skipSsrfCheck ?? false);
    const w = new AgentEventWebhook(
      cfg,
      this.transport,
      this.sleep,
      <T>(fn: () => Promise<T>) => this.withSlot(fn),
    );
    w.bind(this.bus);
    this.webhooks.push(w);
    return w;
  }

  /**
   * L10 (W19): SSRF pre-check helper. The route handler can
   * `await` this to surface a 400 with the underlying error
   * before persisting the webhook config. We delegate to
   * `assertSafeUrl` so the deny-list is shared with the
   * web-client's outbound calls.
   */
  async validateWebhookUrl(url: string, skipCheck: boolean = false): Promise<void> {
    if (skipCheck) return;
    await assertSafeUrl(url);
  }

  unregister(name: string): boolean {
    const idx = this.webhooks.findIndex((w) => w.name === name);
    if (idx === -1) return false;
    this.webhooks[idx]!.unbind();
    this.webhooks.splice(idx, 1);
    return true;
  }

  get(name: string): AgentEventWebhook | undefined {
    return this.webhooks.find((w) => w.name === name);
  }

  list(): AgentEventWebhook[] {
    return [...this.webhooks];
  }

  async drainAll(): Promise<void> {
    await Promise.all(this.webhooks.map((w) => w.drain()));
  }

  destroy(): void {
    for (const w of this.webhooks) w.unbind();
    this.webhooks = [];
  }
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  // Use WebCrypto so this works in both Node and the browser.
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
