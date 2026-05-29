import { createLogger, Logger } from '../../services/logger.js';

export class LSPServer {
  private logger: Logger;
  private enabled: boolean = false;

  constructor() {
    this.logger = createLogger('LSPServer');
  }

  public start(): void {
    try {
      this.enabled = true;
      this.logger.info('LSP Server started');
    } catch (error) {
      this.logger.error({ error }, 'Failed to start LSP server');
    }
  }

  public stop(): void {
    this.enabled = false;
    this.logger.info('LSP Server stopped');
  }
}

export const IDE_FEATURES_ENABLED = true;
export const LSP_FEATURE_MESSAGE = 'LSP features are enabled';
export const COMPLETION_FEATURE_MESSAGE = 'Completion features are enabled';
export const REFACTOR_FEATURE_MESSAGE = 'Refactor features are enabled';
