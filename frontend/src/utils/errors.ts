/**
 * Error classification utility.
 *
 * Maps arbitrary thrown values (fetch errors, AbortError, plain strings, our
 * own typed errors) into a small discriminated union so the UI can render a
 * accurate, actionable message instead of "API 500: Internal Server Error".
 */

export type ErrorKind =
  | 'network' // fetch failed / CORS / offline
  | 'aborted' // caller cancelled
  | 'timeout' // took too long
  | 'notFound' // 404
  | 'unauthorized' // 401/403
  | 'rateLimit' // 429
  | 'client' // 4xx other
  | 'server' // 5xx
  | 'parse' // JSON malformed / shape unexpected
  | 'validation' // zod-style validation failure
  | 'unknown'; // anything else

export interface AppError {
  kind: ErrorKind;
  message: string; // user-facing, already localized-friendly
  status?: number; // HTTP status, if any
  cause?: unknown; // original error, for console
}

const STATUS_TO_KIND: Record<number, ErrorKind> = {
  400: 'client',
  401: 'unauthorized',
  403: 'unauthorized',
  404: 'notFound',
  408: 'timeout',
  409: 'client',
  422: 'validation',
  429: 'rateLimit',
  500: 'server',
  502: 'server',
  503: 'server',
  504: 'timeout',
};

export function classifyError(err: unknown): AppError {
  if (err == null) {
    return { kind: 'unknown', message: 'Unknown error' };
  }

  // Our own AppError
  if (typeof err === 'object' && err !== null && 'kind' in err && 'message' in err) {
    return err as AppError;
  }

  // DOMException: AbortError
  if (err instanceof DOMException && err.name === 'AbortError') {
    return { kind: 'aborted', message: 'Request cancelled', cause: err };
  }

  // TypeError from fetch() when network fails
  if (err instanceof TypeError) {
    return { kind: 'network', message: 'Network error — check your connection', cause: err };
  }

  // Our http() throws `new Error(\`API ${res.status}: ${txt || res.statusText}\`)`
  if (err instanceof Error) {
    const match = /^API\s+(\d{3}):\s*(.*)$/s.exec(err.message);
    if (match) {
      const status = Number(match[1]);
      const body = (match[2] ?? '').trim();
      const kind = STATUS_TO_KIND[status] ?? (status >= 500 ? 'server' : status >= 400 ? 'client' : 'unknown');
      return {
        kind,
        status,
        message: body || err.message,
        cause: err,
      };
    }
    return { kind: 'unknown', message: err.message || 'Unknown error', cause: err };
  }

  if (typeof err === 'string') {
    return { kind: 'unknown', message: err };
  }

  return { kind: 'unknown', message: 'Unknown error', cause: err };
}

export function isRetryable(err: AppError): boolean {
  switch (err.kind) {
    case 'network':
    case 'timeout':
    case 'rateLimit':
    case 'server':
      return true;
    case 'notFound':
    case 'unauthorized':
    case 'client':
    case 'validation':
    case 'parse':
    case 'aborted':
    case 'unknown':
      return false;
  }
}
