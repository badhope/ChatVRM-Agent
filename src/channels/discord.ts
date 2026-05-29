import { BaseChannel, Message, User, ChatRoom, ChannelConfig, Update } from './base.js';

export class DiscordChannel extends BaseChannel {
  readonly name = 'discord';
  private apiBase: string = 'https://discord.com/api/v10';
  private intents: number = 513;
  private heartbeatInterval: number = 0;
  private lastSeq: number | null = null;
  private sessionId?: string;
  private resumeGatewayUrl?: string;

  constructor(config: ChannelConfig) {
    super(config, 'DiscordChannel');
  }

  protected async connectImpl(): Promise<void> {
    if (!this.config.botToken) {
      throw new Error('Discord bot token is required');
    }

    try {
      const gateway = await this.getGateway();
      await this.connectToGateway(gateway.url);
    } catch (error) {
      throw new Error(`Failed to connect to Discord: ${error}`);
    }
  }

  protected async disconnectImpl(): Promise<void> {
    this.logger.info('Discord bot disconnected');
  }

  protected async sendImpl(message: Message): Promise<void> {
    const channelId = message.to;
    const content = message.content;

    let payload: any = { content };

    if (message.attachments && message.attachments.length > 0) {
      payload = {
        content,
        embeds: message.attachments.map(att => ({
          title: att.name,
          url: att.url,
          image: att.type === 'image' ? { url: att.url } : undefined
        }))
      };
    }

    await this.apiCall(`/channels/${channelId}/messages`, 'POST', payload);
  }

  protected async sendTypingIndicatorImpl(chatId: string): Promise<void> {
    await this.apiCall(`/channels/${chatId}/typing`, 'POST', {});
  }

  protected async sendReadReceiptImpl(messageId: string): Promise<void> {
  }

  protected async getMeImpl(): Promise<User> {
    const me = await this.apiCall('/users/@me', 'GET');

    return {
      id: me.id,
      name: me.username,
      avatar: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png` : undefined,
      isBot: me.bot || false
    };
  }

  protected async getChatImpl(chatId: string): Promise<ChatRoom> {
    const channel = await this.apiCall(`/channels/${chatId}`, 'GET');

    return {
      id: channel.id,
      name: channel.name || 'Direct Message',
      type: this.mapChannelType(channel.type),
      members: [],
      isPrivate: channel.type === 1 || channel.type === 3
    };
  }

  protected async getUpdatesImpl(): Promise<Update[]> {
    return [];
  }

  protected async setWebhookImpl(url: string): Promise<void> {
  }

  protected async deleteWebhookImpl(): Promise<void> {
  }

  private async getGateway(): Promise<{ url: string }> {
    const response = await fetch(`${this.apiBase}/gateway`, {
      headers: {
        Authorization: `Bot ${this.config.botToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get gateway: ${response.statusText}`);
    }

    return response.json() as Promise<{ url: string }>;
  }

  private async connectToGateway(gatewayUrl: string): Promise<void> {
    const ws = new WebSocket(`${gatewayUrl}?v=10&encoding=json`);

    ws.onopen = () => {
      this.logger.info('Discord WebSocket connected');
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      await this.handleDiscordEvent(data);
    };

    ws.onerror = (error) => {
      this.logger.error({ error }, 'Discord WebSocket error');
    };

    ws.onclose = () => {
      this.logger.info('Discord WebSocket closed');
      if (this.connected) {
        setTimeout(() => this.connectToGateway(this.resumeGatewayUrl || gatewayUrl), 5000);
      }
    };
  }

  private async handleDiscordEvent(data: any): Promise<void> {
    if (data.s) {
      this.lastSeq = data.s;
    }

    switch (data.op) {
      case 10:
        this.heartbeatInterval = data.d.heartbeat_interval;
        await this.sendIdentify();
        break;
      case 11:
        break;
      case 0:
        await this.handleDispatch(data);
        break;
    }
  }

  private async sendIdentify(): Promise<void> {
  }

  private async handleDispatch(data: any): Promise<void> {
    const { t, d } = data;

    switch (t) {
      case 'READY':
        this.sessionId = d.session_id;
        this.resumeGatewayUrl = d.resume_gateway_url;
        this.botUser = {
          id: d.user.id,
          name: d.user.username,
          avatar: d.user.avatar ? `https://cdn.discordapp.com/avatars/${d.user.id}/${d.user.avatar}.png` : undefined,
          isBot: d.user.bot
        };
        this.emit('connected');
        break;

      case 'MESSAGE_CREATE':
        this.emit('message', this.transformMessage(d));
        break;

      case 'MESSAGE_UPDATE':
        this.emit('message:edited', this.transformMessage(d));
        break;

      case 'INTERACTION_CREATE':
        this.emit('interaction', d);
        break;
    }
  }

  private async apiCall(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
    const url = `${this.apiBase}${endpoint}`;

    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Bot ${this.config.botToken}`,
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`Discord API error: ${response.statusText}`);
    }

    return response.json();
  }

  private transformMessage(discordMessage: any): Message {
    return {
      id: discordMessage.id,
      from: discordMessage.author.id,
      to: discordMessage.channel_id,
      content: discordMessage.content,
      timestamp: new Date(discordMessage.timestamp).getTime(),
      metadata: {
        guildId: discordMessage.guild_id,
        channelId: discordMessage.channel_id,
        messageId: discordMessage.id
      }
    };
  }

  private mapChannelType(type: number): ChatRoom['type'] {
    switch (type) {
      case 0:
        return 'group';
      case 1:
        return 'direct';
      case 2:
        return 'group';
      case 4:
        return 'group';
      case 5:
      case 6:
      case 10:
      case 11:
      case 12:
      case 13:
      case 14:
      case 15:
        return 'channel';
      default:
        return 'direct';
    }
  }

  public async sendEmbed(channelId: string, embed: any): Promise<void> {
    await this.apiCall(`/channels/${channelId}/messages`, 'POST', {
      embeds: [embed]
    });
  }

  public async createInteractionResponse(interactionId: string, token: string, response: any): Promise<void> {
    await this.apiCall(`/interactions/${interactionId}/${token}/callback`, 'POST', response);
  }

  public async getGuild(guildId: string): Promise<any> {
    return this.apiCall(`/guilds/${guildId}`, 'GET');
  }

  public async getChannelMessages(channelId: string, limit: number = 50): Promise<any[]> {
    return this.apiCall(`/channels/${channelId}/messages?limit=${limit}`, 'GET');
  }
}

export default DiscordChannel;
