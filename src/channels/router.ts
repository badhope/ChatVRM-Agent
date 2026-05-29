import { EventEmitter } from 'eventemitter3';
import { createLogger, Logger } from '../services/logger.js';
import { IChannel, Message, User, ChatRoom, ChannelConfig } from './base.js';
import { TelegramChannel } from './telegram.js';
import { DiscordChannel } from './discord.js';

export interface RouterConfig {
  channels: Map<string, ChannelConfig>;
  defaultChannel?: string;
  routingRules?: RoutingRule[];
}

export interface RoutingRule {
  name: string;
  priority: number;
  condition: (message: Message) => boolean;
  targetChannel: string;
}

export interface Session {
  id: string;
  userId: string;
  channel: string;
  chatId: string;
  createdAt: number;
  lastActivity: number;
  context: Record<string, any>;
}

export class MessageRouter extends EventEmitter {
  private logger: Logger;
  private channels: Map<string, IChannel> = new Map();
  private routingRules: RoutingRule[] = [];
  private defaultChannel?: string;
  private sessions: Map<string, Session> = new Map();
  private messageQueue: Array<{ message: Message; channel: IChannel }> = [];
  private isProcessing: boolean = false;

  constructor(config: RouterConfig) {
    super();
    this.logger = createLogger('MessageRouter');
    this.defaultChannel = config.defaultChannel;

    for (const [name, channelConfig] of config.channels.entries()) {
      this.registerChannel(name, channelConfig);
    }

    if (config.routingRules) {
      this.routingRules = config.routingRules.sort((a, b) => b.priority - a.priority);
    }
  }

  public registerChannel(name: string, config: ChannelConfig): void {
    let channel: IChannel;

    switch (name.toLowerCase()) {
      case 'telegram':
        channel = new TelegramChannel(config);
        break;
      case 'discord':
        channel = new DiscordChannel(config);
        break;
      default:
        throw new Error(`Unknown channel type: ${name}`);
    }

    this.setupChannelListeners(name, channel);
    this.channels.set(name, channel);

    this.logger.info({ name, type: name }, 'Channel registered');
  }

  public async connect(): Promise<void> {
    this.logger.info('Connecting all channels...');

    const connectPromises = Array.from(this.channels.entries()).map(
      async ([name, channel]) => {
        try {
          await channel.connect();
          this.logger.info({ name }, 'Channel connected');
        } catch (error) {
          this.logger.error({ name, error }, 'Failed to connect channel');
        }
      }
    );

    await Promise.all(connectPromises);
    this.startProcessingQueue();

    this.emit('connected');
  }

  public async disconnect(): Promise<void> {
    this.logger.info('Disconnecting all channels...');

    const disconnectPromises = Array.from(this.channels.entries()).map(
      async ([name, channel]) => {
        try {
          await channel.disconnect();
        } catch (error) {
          this.logger.error({ name, error }, 'Failed to disconnect channel');
        }
      }
    );

    await Promise.all(disconnectPromises);

    this.emit('disconnected');
  }

  public async send(message: Message): Promise<void> {
    const channel = this.routeMessage(message);

    if (!channel) {
      throw new Error('No suitable channel found for message');
    }

    try {
      await channel.send(message);
      this.emit('message:sent', { message, channel: channel.name });
    } catch (error) {
      this.logger.error({ error, message }, 'Failed to send message');
      throw error;
    }
  }

  public async broadcast(content: string, excludeChannels?: string[]): Promise<void> {
    const sendPromises = Array.from(this.channels.entries())
      .filter(([name]) => !excludeChannels?.includes(name))
      .map(async ([name, channel]) => {
        try {
          const chats = await this.getAvailableChats(channel);
          for (const chat of chats) {
            await channel.send({
              id: this.generateMessageId(),
              from: 'system',
              to: chat.id,
              content,
              timestamp: Date.now()
            });
          }
        } catch (error) {
          this.logger.error({ name, error }, 'Broadcast failed for channel');
        }
      });

    await Promise.all(sendPromises);
  }

  public routeMessage(message: Message): IChannel | null {
    for (const rule of this.routingRules) {
      if (rule.condition(message)) {
        const channel = this.channels.get(rule.targetChannel);
        if (channel) {
          this.logger.debug({
            rule: rule.name,
            target: rule.targetChannel
          }, 'Message routed');
          return channel;
        }
      }
    }

    if (this.defaultChannel) {
      return this.channels.get(this.defaultChannel) || null;
    }

    return null;
  }

  public addRoutingRule(rule: RoutingRule): void {
    this.routingRules.push(rule);
    this.routingRules.sort((a, b) => b.priority - a.priority);
    this.logger.info({ name: rule.name }, 'Routing rule added');
  }

  public removeRoutingRule(name: string): void {
    const index = this.routingRules.findIndex(r => r.name === name);
    if (index !== -1) {
      this.routingRules.splice(index, 1);
      this.logger.info({ name }, 'Routing rule removed');
    }
  }

  public async getMe(channelName?: string): Promise<User | null> {
    if (channelName) {
      const channel = this.channels.get(channelName);
      if (channel) {
        return channel.getMe();
      }
      return null;
    }

    const firstChannel = Array.from(this.channels.values())[0];
    if (firstChannel) {
      return firstChannel.getMe();
    }

    return null;
  }

  public async getAvailableChats(channel?: IChannel): Promise<ChatRoom[]> {
    return [];
  }

  public getSession(userId: string, channel: string): Session | null {
    const sessionId = `${channel}:${userId}`;
    return this.sessions.get(sessionId) || null;
  }

  public createSession(userId: string, channel: string, chatId: string): Session {
    const sessionId = `${channel}:${userId}`;
    const session: Session = {
      id: sessionId,
      userId,
      channel,
      chatId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      context: {}
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  public updateSession(sessionId: string, updates: Partial<Session>): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      Object.assign(session, updates);
      session.lastActivity = Date.now();
    }
  }

  public deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private setupChannelListeners(name: string, channel: IChannel): void {
    channel.on('message', (message: Message) => {
      const sessionId = `${name}:${message.from}`;
      let session = this.sessions.get(sessionId);

      if (!session) {
        session = this.createSession(message.from, name, message.to);
      } else {
        session.lastActivity = Date.now();
      }

      this.emit('message', { message, channel: name, session });
    });

    channel.on('callback_query', (query: any) => {
      this.emit('callback_query', { query, channel: name });
    });

    channel.on('inline_query', (query: any) => {
      this.emit('inline_query', { query, channel: name });
    });

    channel.on('update', (update: any) => {
      this.emit('update', { update, channel: name });
    });
  }

  private startProcessingQueue(): void {
    this.isProcessing = true;
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    while (this.isProcessing && this.messageQueue.length > 0) {
      const { message, channel } = this.messageQueue.shift()!;

      try {
        await channel.send(message);
      } catch (error) {
        this.logger.error({ error, message }, 'Failed to process queued message');
      }
    }

    if (this.isProcessing) {
      setTimeout(() => this.processQueue(), 100);
    }
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  public getChannels(): Map<string, IChannel> {
    return this.channels;
  }

  public getRoutingRules(): RoutingRule[] {
    return this.routingRules;
  }

  public getSessions(): Map<string, Session> {
    return this.sessions;
  }
}

export default MessageRouter;
