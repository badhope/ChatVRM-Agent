export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  file?: string;
  maxSize?: string;
  maxFiles?: number;
}

export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  level: 'info',
  file: '~/.devflow/logs/app.log',
  maxSize: '10m',
  maxFiles: 5
};
