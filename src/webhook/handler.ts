import { createLogger, Logger } from '../services/logger.js';

export interface WebhookConfig {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  handler: WebhookHandler;
  options?: WebhookOptions;
}

export interface WebhookOptions {
  auth?: WebhookAuth;
  validation?: WebhookValidation;
  transform?: WebhookTransform;
  rateLimit?: RateLimitConfig;
  timeout?: number;
}

export interface WebhookAuth {
  type: 'bearer' | 'basic' | 'api-key' | 'custom';
  verify: (req: WebhookRequest) => Promise<boolean>;
  key?: string;
  headerName?: string;
}

export interface WebhookValidation {
  schema?: any;
  customValidator?: (payload: any) => Promise<{ valid: boolean; error?: string }>;
}

export interface WebhookTransform {
  input?: (payload: any) => any;
  output?: (result: any) => any;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface WebhookRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  params: Record<string, string>;
  body?: any;
  rawBody?: Buffer;
}

export interface WebhookResponse {
  status: number;
  headers?: Record<string, string>;
  body?: any;
}

export interface WebhookHandler {
  (request: WebhookRequest): Promise<WebhookResponse>;
}

export interface WebhookInfo {
  path: string;
  method: string;
  registeredAt: Date;
  callCount: number;
  lastCalled?: Date;
  averageResponseTime: number;
}

export interface WebhookStats {
  totalWebhooks: number;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageResponseTime: number;
  byPath: Record<string, number>;
}

export class WebhookManager {
  private logger: Logger;
  private webhooks: Map<string, WebhookConfig> = new Map();
  private callHistory: Map<string, WebhookCall[]> = new Map();
  private rateLimitStore: Map<string, { count: number; resetAt: number }> = new Map();
  private maxHistorySize = 1000;

  constructor() {
    this.logger = createLogger('WebhookHandler');
  }

  public register(config: WebhookConfig): void {
    const key = this.getWebhookKey(config.path, config.method);

    if (this.webhooks.has(key)) {
      throw new Error(`Webhook already registered: ${key}`);
    }

    const webhook: WebhookConfig = {
      method: 'POST',
      ...config,
      options: {
        timeout: 30000,
        ...config.options
      }
    };

    this.webhooks.set(key, webhook);
    this.callHistory.set(key, []);

    this.logger.info({ path: config.path, method: webhook.method }, 'Webhook registered');
  }

  public unregister(path: string, method?: string): void {
    const key = this.getWebhookKey(path, method);

    if (!this.webhooks.has(key)) {
      throw new Error(`Webhook not found: ${key}`);
    }

    this.webhooks.delete(key);
    this.callHistory.delete(key);

    this.logger.info({ path, method }, 'Webhook unregistered');
  }

  public async handle(request: WebhookRequest): Promise<WebhookResponse> {
    const key = this.getWebhookKey(request.path, request.method as string);
    const webhook = this.webhooks.get(key);

    if (!webhook) {
      this.logger.warn({ path: request.path, method: request.method }, 'Webhook not found');
      return {
        status: 404,
        body: { error: 'Webhook not found' }
      };
    }

    const callEntry: WebhookCall = {
      timestamp: new Date(),
      request,
      response: { status: 0 },
      duration: 0
    };

    const startTime = Date.now();

    try {
      if (webhook.options?.auth) {
        const isValid = await this.verifyAuth(webhook.options.auth, request);
        if (!isValid) {
          const response: WebhookResponse = {
            status: 401,
            body: { error: 'Unauthorized' }
          };
          callEntry.response = response;
          callEntry.duration = Date.now() - startTime;
          this.recordCall(key, callEntry);
          return response;
        }
      }

      if (webhook.options?.validation?.schema || webhook.options?.validation?.customValidator) {
        const validationResult = await this.validatePayload(webhook.options.validation, request.body);
        if (!validationResult.valid) {
          const response: WebhookResponse = {
            status: 400,
            body: { error: validationResult.error || 'Invalid payload' }
          };
          callEntry.response = response;
          callEntry.duration = Date.now() - startTime;
          this.recordCall(key, callEntry);
          return response;
        }
      }

      if (webhook.options?.rateLimit) {
        const rateLimitResult = this.checkRateLimit(key, webhook.options.rateLimit);
        if (!rateLimitResult.allowed) {
          const response: WebhookResponse = {
            status: 429,
            headers: {
              'Retry-After': String(rateLimitResult.retryAfter)
            },
            body: { error: 'Rate limit exceeded' }
          };
          callEntry.response = response;
          callEntry.duration = Date.now() - startTime;
          this.recordCall(key, callEntry);
          return response;
        }
      }

      let payload = request.body;
      if (webhook.options?.transform?.input) {
        payload = webhook.options.transform.input(request.body);
      }

      let result = await Promise.race([
        webhook.handler({
          ...request,
          body: payload
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Webhook handler timeout')),
            webhook.options?.timeout || 30000)
        )
      ]);

      if (webhook.options?.transform?.output) {
        result = webhook.options.transform.output(result);
      }

      const response: WebhookResponse = {
        status: 200,
        body: result
      };

      callEntry.response = response;
      callEntry.duration = Date.now() - startTime;
      this.recordCall(key, callEntry);

      this.logger.info({ path: request.path, method: request.method, duration: callEntry.duration }, 'Webhook executed successfully');

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      const response: WebhookResponse = {
        status: 500,
        body: { error: errorMessage }
      };

      callEntry.response = response;
      callEntry.duration = Date.now() - startTime;
      this.recordCall(key, callEntry);

      this.logger.error({ path: request.path, method: request.method, error: errorMessage }, 'Webhook execution failed');

      return response;
    }
  }

  public getWebhook(path: string, method?: string): WebhookInfo | null {
    const key = this.getWebhookKey(path, method);
    const webhook = this.webhooks.get(key);

    if (!webhook) {
      return null;
    }

    const history = this.callHistory.get(key) || [];
    const lastCall = history.length > 0 ? history[history.length - 1] : undefined;

    const totalDuration = history.reduce((sum, call) => sum + call.duration, 0);
    const averageResponseTime = history.length > 0 ? totalDuration / history.length : 0;

    return {
      path: webhook.path,
      method: webhook.method || 'POST',
      registeredAt: new Date(),
      callCount: history.length,
      lastCalled: lastCall?.timestamp,
      averageResponseTime
    };
  }

  public listWebhooks(): WebhookInfo[] {
    const webhooks: WebhookInfo[] = [];

    for (const [key] of this.webhooks) {
      const [path, method] = key.split(':');
      const info = this.getWebhook(path, method);
      if (info) {
        webhooks.push(info);
      }
    }

    return webhooks;
  }

  public getHistory(path: string, method?: string, limit?: number): WebhookCall[] {
    const key = this.getWebhookKey(path, method);
    const history = this.callHistory.get(key) || [];

    if (limit) {
      return history.slice(-limit);
    }

    return history;
  }

  public getStats(): WebhookStats {
    let totalCalls = 0;
    let successfulCalls = 0;
    let failedCalls = 0;
    let totalDuration = 0;
    const byPath: Record<string, number> = {};

    for (const [key, history] of this.callHistory) {
      for (const call of history) {
        totalCalls++;
        totalDuration += call.duration;

        if (call.response.status >= 200 && call.response.status < 300) {
          successfulCalls++;
        } else {
          failedCalls++;
        }

        byPath[key] = (byPath[key] || 0) + 1;
      }
    }

    return {
      totalWebhooks: this.webhooks.size,
      totalCalls,
      successfulCalls,
      failedCalls,
      averageResponseTime: totalCalls > 0 ? totalDuration / totalCalls : 0,
      byPath
    };
  }

  public clearHistory(path?: string, method?: string): void {
    if (path) {
      const key = this.getWebhookKey(path, method);
      this.callHistory.delete(key);
      this.logger.info({ path, method }, 'Webhook history cleared');
    } else {
      this.callHistory.clear();
      this.logger.info('All webhook history cleared');
    }
  }

  private async verifyAuth(
    auth: WebhookAuth,
    request: WebhookRequest
  ): Promise<boolean> {
    switch (auth.type) {
      case 'bearer':
        return this.verifyBearerAuth(auth, request);

      case 'basic':
        return this.verifyBasicAuth(auth, request);

      case 'api-key':
        return this.verifyApiKeyAuth(auth, request);

      case 'custom':
        return auth.verify(request);

      default:
        return false;
    }
  }

  private verifyBearerAuth(auth: WebhookAuth, request: WebhookRequest): boolean {
    const headerName = auth.headerName || 'authorization';
    const authHeader = request.headers[headerName.toLowerCase()] as string;

    if (!authHeader) {
      return false;
    }

    const token = authHeader.replace(/^bearer\s+/i, '');
    return token === auth.key;
  }

  private verifyBasicAuth(auth: WebhookAuth, request: WebhookRequest): boolean {
    const authHeader = request.headers.authorization as string;

    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return false;
    }

    const base64Credentials = authHeader.replace('Basic ', '');
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    return username === auth.key && password === auth.key;
  }

  private verifyApiKeyAuth(auth: WebhookAuth, request: WebhookRequest): boolean {
    const headerName = auth.headerName || 'x-api-key';
    const apiKey = request.headers[headerName.toLowerCase()] as string;

    return apiKey === auth.key;
  }

  private async validatePayload(
    validation: WebhookValidation,
    payload: any
  ): Promise<{ valid: boolean; error?: string }> {
    if (validation.customValidator) {
      return validation.customValidator(payload);
    }

    if (validation.schema) {
      try {
        if (typeof validation.schema.parse === 'function') {
          validation.schema.parse(payload);
        }
        return { valid: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Validation failed';
        return { valid: false, error: errorMessage };
      }
    }

    return { valid: true };
  }

  private checkRateLimit(
    key: string,
    config: RateLimitConfig
  ): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const rateLimit = this.rateLimitStore.get(key);

    if (!rateLimit || now >= rateLimit.resetAt) {
      this.rateLimitStore.set(key, {
        count: 1,
        resetAt: now + config.windowMs
      });
      return { allowed: true };
    }

    if (rateLimit.count >= config.maxRequests) {
      const retryAfter = Math.ceil((rateLimit.resetAt - now) / 1000);
      return { allowed: false, retryAfter };
    }

    rateLimit.count++;
    return { allowed: true };
  }

  private recordCall(key: string, call: WebhookCall): void {
    const history = this.callHistory.get(key) || [];
    history.push(call);

    if (history.length > this.maxHistorySize) {
      history.shift();
    }

    this.callHistory.set(key, history);
  }

  private getWebhookKey(path: string, method?: string): string {
    return `${method || 'POST'}:${path}`;
  }
}

interface WebhookCall {
  timestamp: Date;
  request: WebhookRequest;
  response: WebhookResponse;
  duration: number;
}

export default WebhookManager;
