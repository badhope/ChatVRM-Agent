// ============================================================
// 日志服务 - 基于 pino 的结构化日志记录器
// ============================================================

import pino from 'pino';

// ============================================================
// Public types (backward-compatible)
// ============================================================

export interface LogContext {
  [key: string]: unknown;
}

export interface Logger {
  debug(context: LogContext | string, message?: string): void;
  info(context: LogContext | string, message?: string): void;
  warn(context: LogContext | string, message?: string): void;
  error(context: LogContext | string, message?: string): void;
  child(context: LogContext): Logger;
}

// ============================================================
// Sensitive field redaction paths for pino
// ============================================================

const REDACT_PATHS = [
  'apiKey', 'api_key', 'API_KEY', 'secret', 'SECRET',
  'password', 'PASSWORD', 'token', 'TOKEN',
  'accessToken', 'access_token', 'refreshToken',
  'privateKey', 'private_key', 'credential',
].map((f) => `req.*.${f}`);

// ============================================================
// Internal pino-backed logger implementation
// ============================================================

/**
 * Create the underlying pino instance.
 *
 * Uses pino-pretty when NODE_ENV !== 'production' and enables
 * built-in redaction for known sensitive fields.
 */
function createPinoInstance(bindings: LogContext = {}): pino.Logger {
  const isProduction = process.env.NODE_ENV === 'production';

  return pino({
    level: process.env.DEBUG ? 'debug' : 'info',
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
    transport: isProduction
      ? undefined
      : {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
    ...(Object.keys(bindings).length > 0 ? { base: undefined } : {}),
  }, pino.destination(1));
}

/**
 * Adapter that wraps a pino.Logger to satisfy the project's Logger interface.
 *
 * The existing API accepts `(context | string, message?)` while pino uses
 * `(mergeObject, message)`.  This adapter normalises the call signature.
 */
class PinoLoggerAdapter implements Logger {
  private pinoLogger: pino.Logger;

  constructor(pinoLogger: pino.Logger) {
    this.pinoLogger = pinoLogger;
  }

  private normalizeArgs(
    context: LogContext | string,
    message?: string,
  ): [obj: Record<string, unknown>, msg: string] {
    if (typeof context === 'string') {
      return [{}, context];
    }
    return [context, message ?? ''];
  }

  debug(context: LogContext | string, message?: string): void {
    const [obj, msg] = this.normalizeArgs(context, message);
    this.pinoLogger.debug(obj, msg);
  }

  info(context: LogContext | string, message?: string): void {
    const [obj, msg] = this.normalizeArgs(context, message);
    this.pinoLogger.info(obj, msg);
  }

  warn(context: LogContext | string, message?: string): void {
    const [obj, msg] = this.normalizeArgs(context, message);
    this.pinoLogger.warn(obj, msg);
  }

  error(context: LogContext | string, message?: string): void {
    const [obj, msg] = this.normalizeArgs(context, message);
    this.pinoLogger.error(obj, msg);
  }

  child(context: LogContext): Logger {
    return new PinoLoggerAdapter(this.pinoLogger.child(context));
  }
}

// ============================================================
// Public API
// ============================================================

/** Default global logger instance */
export const logger: Logger = new PinoLoggerAdapter(createPinoInstance());

/**
 * Create a named child logger.
 *
 * @param name - Logger name / module identifier
 * @returns A new Logger instance bound to the given name
 */
export function createLogger(name: string): Logger {
  return logger.child({ module: name });
}

// Backward-compatible named loggers
export const agentLogger: Logger = logger.child({ module: 'agent' });
export const gitLogger: Logger = logger.child({ module: 'git' });
export const toolLogger: Logger = logger.child({ module: 'tools' });
