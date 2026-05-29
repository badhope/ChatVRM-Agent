import { EventEmitter } from 'eventemitter3';
import { createLogger, Logger } from '../services/logger.js';

export interface Message {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
  attachments?: Attachment[];
  replyTo?: string;
  forwardedFrom?: string;
}

export interface Attachment {
  type: 'image' | 'video' | 'audio' | 'file';
  url: string;
  name?: string;
  size?: number;
  mimeType?: string;
}

export interface User {
  id: string;
  name: string;
  username?: string;
  avatar?: string;
  isBot?: boolean;
  metadata?: Record<string, any>;
}

export interface ChatRoom {
  id: string;
  name: string;
  type: 'direct' | 'group' | 'channel';
  members: User[];
  isPrivate: boolean;
  metadata?: Record<string, any>;
}

export interface ChannelConfig {
  enabled: boolean;
  botToken?: string;
  apiKey?: string;
  apiSecret?: string;
  webhookUrl?: string;
  pollingInterval?: number;
  maxRetries?: number;
  timeout?: number;
  rateLimit?: {
    maxRequests: number;
    perSeconds: number;
  };
}

export interface IChannel extends EventEmitter {
  readonly name: string;
  readonly config: ChannelConfig;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: Message): Promise<void>;
  sendTypingIndicator(chatId: string): Promise<void>;
  sendReadReceipt(messageId: string): Promise<void>;
  getMe(): Promise<User>;
  getChat(chatId: string): Promise<ChatRoom>;
  getUpdates(): Promise<Update[]>;
  setWebhook(url: string): Promise<void>;
  deleteWebhook(): Promise<void>;
}

export interface Update {
  update_id: number;
  message?: Message;
  edited_message?: Message;
  channel_post?: Message;
  edited_channel_post?: Message;
  inline_query?: InlineQuery;
  chosen_inline_result?: ChosenInlineResult;
  callback_query?: CallbackQuery;
}

export interface InlineQuery {
  id: string;
  from: User;
  query: string;
  offset?: string;
}

export interface ChosenInlineResult {
  result_id: string;
  from: User;
  query: string;
}

export interface CallbackQuery {
  id: string;
  from: User;
  message?: Message;
  data?: string;
}

export abstract class BaseChannel extends EventEmitter implements IChannel {
  protected logger: Logger;
  public config: ChannelConfig;
  protected connected: boolean = false;
  protected botUser?: User;

  constructor(config: ChannelConfig, moduleName: string = 'Channel') {
    super();
    this.config = config;
    this.logger = createLogger(moduleName);
  }

  abstract readonly name: string;

  async connect(): Promise<void> {
    if (this.connected) {
      this.logger.warn({ channel: this.name }, 'Channel already connected');
      return;
    }

    try {
      await this.connectImpl();
      this.connected = true;
      this.logger.info({ channel: this.name }, 'Channel connected');
      this.emit('connected');
    } catch (error) {
      this.logger.error({ channel: this.name, error }, 'Failed to connect channel');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      this.logger.warn({ channel: this.name }, 'Channel not connected');
      return;
    }

    try {
      await this.disconnectImpl();
      this.connected = false;
      this.logger.info({ channel: this.name }, 'Channel disconnected');
      this.emit('disconnected');
    } catch (error) {
      this.logger.error({ channel: this.name, error }, 'Failed to disconnect channel');
      throw error;
    }
  }

  async send(message: Message): Promise<void> {
    this.ensureConnected();

    try {
      await this.sendImpl(message);
      this.logger.debug({ channel: this.name, messageId: message.id }, 'Message sent');
      this.emit('message:sent', message);
    } catch (error) {
      this.logger.error({ channel: this.name, error, message }, 'Failed to send message');
      throw error;
    }
  }

  async sendTypingIndicator(chatId: string): Promise<void> {
    this.ensureConnected();

    try {
      await this.sendTypingIndicatorImpl(chatId);
    } catch (error) {
      this.logger.debug({ error }, 'Failed to send typing indicator');
    }
  }

  async sendReadReceipt(messageId: string): Promise<void> {
    this.ensureConnected();

    try {
      await this.sendReadReceiptImpl(messageId);
    } catch (error) {
      this.logger.debug({ error }, 'Failed to send read receipt');
    }
  }

  async getMe(): Promise<User> {
    this.ensureConnected();

    if (!this.botUser) {
      this.botUser = await this.getMeImpl();
    }

    return this.botUser;
  }

  async getChat(chatId: string): Promise<ChatRoom> {
    this.ensureConnected();
    return this.getChatImpl(chatId);
  }

  async getUpdates(): Promise<Update[]> {
    this.ensureConnected();
    return this.getUpdatesImpl();
  }

  async setWebhook(url: string): Promise<void> {
    this.ensureConnected();
    await this.setWebhookImpl(url);
    this.logger.info({ channel: this.name, url }, 'Webhook set');
  }

  async deleteWebhook(): Promise<void> {
    this.ensureConnected();
    await this.deleteWebhookImpl();
    this.logger.info({ channel: this.name }, 'Webhook deleted');
  }

  protected ensureConnected(): void {
    if (!this.connected) {
      throw new Error(`Channel '${this.name}' is not connected`);
    }
  }

  protected abstract connectImpl(): Promise<void>;
  protected abstract disconnectImpl(): Promise<void>;
  protected abstract sendImpl(message: Message): Promise<void>;
  protected abstract sendTypingIndicatorImpl(chatId: string): Promise<void>;
  protected abstract sendReadReceiptImpl(messageId: string): Promise<void>;
  protected abstract getMeImpl(): Promise<User>;
  protected abstract getChatImpl(chatId: string): Promise<ChatRoom>;
  protected abstract getUpdatesImpl(): Promise<Update[]>;
  protected abstract setWebhookImpl(url: string): Promise<void>;
  protected abstract deleteWebhookImpl(): Promise<void>;
}

export default BaseChannel;
