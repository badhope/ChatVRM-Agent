import pino from 'pino';

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export function createLogger(name: string): pino.Logger {
  const level = (process.env.LOG_LEVEL as LogLevel) || 'info';
  const isDev = process.env.NODE_ENV !== 'production';

  return pino({
    name,
    level,
    ...(isDev
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          },
        }
      : {}),
  });
}

export const logger = createLogger('app');