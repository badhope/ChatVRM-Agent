import { BaseChannel, Message, User, ChatRoom, ChannelConfig, Update } from './base.js';

export class TelegramChannel extends BaseChannel {
  readonly name = 'telegram';
  private apiBase: string = 'https://api.telegram.org/bot';
  private updateOffset: number = 0;
  private longPollingTimer?: NodeJS.Timeout;

  constructor(config: ChannelConfig) {
    super(config, 'TelegramChannel');
  }

  protected async connectImpl(): Promise<void> {
    if (!this.config.botToken) {
      throw new Error('Telegram bot token is required');
    }

    try {
      const me = await this.apiCall('getMe');
      this.botUser = {
        id: String(me.id),
        name: me.first_name,
        username: me.username,
        isBot: true
      };

      await this.apiCall('deleteWebhook', { drop_pending_updates: true });

      this.startLongPolling();

      this.logger.info({ username: me.username }, 'Telegram bot initialized');
    } catch (error) {
      throw new Error(`Failed to initialize Telegram bot: ${error}`);
    }
  }

  protected async disconnectImpl(): Promise<void> {
    if (this.longPollingTimer) {
      clearTimeout(this.longPollingTimer);
      this.longPollingTimer = undefined;
    }

    this.logger.info('Telegram bot disconnected');
  }

  protected async sendImpl(message: Message): Promise<void> {
    const chatId = message.to;
    const content = message.content;

    let params: any = {
      chat_id: chatId,
      text: content
    };

    if (message.replyTo) {
      params.reply_to_message_id = message.replyTo;
    }

    if (message.attachments && message.attachments.length > 0) {
      const attachment = message.attachments[0];

      if (attachment.type === 'image') {
        params = {
          chat_id: chatId,
          photo: attachment.url,
          caption: content
        };
        await this.apiCall('sendPhoto', params);
        return;
      } else if (attachment.type === 'file') {
        params = {
          chat_id: chatId,
          document: attachment.url,
          caption: content
        };
        await this.apiCall('sendDocument', params);
        return;
      }
    }

    await this.apiCall('sendMessage', params);
  }

  protected async sendTypingIndicatorImpl(chatId: string): Promise<void> {
    await this.apiCall('sendChatAction', {
      chat_id: chatId,
      action: 'typing'
    });
  }

  protected async sendReadReceiptImpl(messageId: string): Promise<void> {
  }

  protected async getMeImpl(): Promise<User> {
    const me = await this.apiCall('getMe');
    return {
      id: String(me.id),
      name: me.first_name,
      username: me.username,
      isBot: true
    };
  }

  protected async getChatImpl(chatId: string): Promise<ChatRoom> {
    const chat = await this.apiCall('getChat', { chat_id: chatId });

    return {
      id: String(chat.id),
      name: chat.title || chat.first_name || '',
      type: this.mapChatType(chat.type),
      members: [],
      isPrivate: chat.type === 'private'
    };
  }

  protected async getUpdatesImpl(): Promise<Update[]> {
    try {
      const response = await this.apiCall('getUpdates', {
        offset: this.updateOffset,
        timeout: this.config.pollingInterval || 55,
        allowed_updates: ['message', 'edited_message', 'callback_query', 'inline_query']
      });

      if (!Array.isArray(response)) {
        return [];
      }

      const updates: Update[] = [];

      for (const update of response) {
        this.updateOffset = Math.max(this.updateOffset, update.update_id + 1);

        updates.push({
          update_id: update.update_id,
          message: update.message ? this.transformMessage(update.message) : undefined,
          edited_message: update.edited_message ? this.transformMessage(update.edited_message) : undefined,
          callback_query: update.callback_query ? {
            id: String(update.callback_query.id),
            from: this.transformUser(update.callback_query.from),
            message: update.callback_query.message ? this.transformMessage(update.callback_query.message) : undefined,
            data: update.callback_query.data
          } : undefined,
          inline_query: update.inline_query ? {
            id: String(update.inline_query.id),
            from: this.transformUser(update.inline_query.from),
            query: update.inline_query.query,
            offset: update.inline_query.offset
          } : undefined
        });
      }

      return updates;
    } catch (error: any) {
      if (error.message?.includes('Conflict')) {
        this.logger.warn('Long polling conflict, waiting...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      return [];
    }
  }

  protected async setWebhookImpl(url: string): Promise<void> {
    await this.apiCall('setWebhook', { url });
  }

  protected async deleteWebhookImpl(): Promise<void> {
    await this.apiCall('deleteWebhook');
  }

  private startLongPolling(): void {
    this.poll();
  }

  private async poll(): Promise<void> {
    while (this.connected) {
      try {
        const updates = await this.getUpdates();

        for (const update of updates) {
          this.handleUpdate(update);
        }
      } catch (error) {
        this.logger.error({ error }, 'Polling error');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  private handleUpdate(update: Update): void {
    this.emit('update', update);

    if (update.message) {
      this.emit('message', update.message);
    }

    if (update.callback_query) {
      this.emit('callback_query', update.callback_query);
    }

    if (update.inline_query) {
      this.emit('inline_query', update.inline_query);
    }
  }

  private async apiCall(method: string, params: Record<string, any> = {}): Promise<any> {
    if (!this.config.botToken) {
      throw new Error('Bot token not configured');
    }

    const url = `${this.apiBase}${this.config.botToken}/${method}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const errorData = await response.json() as { description?: string };
      throw new Error(`Telegram API error: ${errorData.description || response.statusText}`);
    }

    const data = await response.json() as { ok: boolean; result?: unknown; description?: string };

    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description}`);
    }

    return data.result;
  }

  private transformMessage(tgMessage: any): Message {
    const chat = tgMessage.chat || {};

    return {
      id: String(tgMessage.message_id),
      from: String(tgMessage.from?.id || ''),
      to: String(chat.id),
      content: tgMessage.text || tgMessage.caption || '',
      timestamp: tgMessage.date * 1000,
      metadata: {
        chatId: String(chat.id),
        chatType: chat.type,
        messageId: String(tgMessage.message_id)
      },
      attachments: this.extractAttachments(tgMessage)
    };
  }

  private transformUser(tgUser: any): User {
    return {
      id: String(tgUser.id),
      name: tgUser.first_name,
      username: tgUser.username,
      isBot: tgUser.is_bot
    };
  }

  private extractAttachments(tgMessage: any): Message['attachments'] {
    const attachments: Message['attachments'] = [];

    if (tgMessage.photo && tgMessage.photo.length > 0) {
      const photo = tgMessage.photo[tgMessage.photo.length - 1];
      attachments.push({
        type: 'image',
        url: photo.file_id,
        name: 'image.jpg',
        size: photo.file_size
      });
    }

    if (tgMessage.document) {
      attachments.push({
        type: 'file',
        url: tgMessage.document.file_id,
        name: tgMessage.document.file_name,
        size: tgMessage.document.file_size,
        mimeType: tgMessage.document.mime_type
      });
    }

    if (tgMessage.video) {
      attachments.push({
        type: 'video',
        url: tgMessage.video.file_id,
        name: 'video.mp4',
        size: tgMessage.video.file_size
      });
    }

    if (tgMessage.voice) {
      attachments.push({
        type: 'audio',
        url: tgMessage.voice.file_id,
        size: tgMessage.voice.file_size,
        mimeType: tgMessage.voice.mime_type
      });
    }

    return attachments;
  }

  private mapChatType(type: string): ChatRoom['type'] {
    switch (type) {
      case 'private':
        return 'direct';
      case 'group':
      case 'supergroup':
        return 'group';
      case 'channel':
        return 'channel';
      default:
        return 'direct';
    }
  }

  public async sendPhoto(chatId: string, photo: string, caption?: string): Promise<void> {
    await this.apiCall('sendPhoto', {
      chat_id: chatId,
      photo,
      caption
    });
  }

  public async sendDocument(chatId: string, document: string, caption?: string): Promise<void> {
    await this.apiCall('sendDocument', {
      chat_id: chatId,
      document,
      caption
    });
  }

  public async sendInlineKeyboard(
    chatId: string,
    text: string,
    keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>>
  ): Promise<void> {
    await this.apiCall('sendMessage', {
      chat_id: chatId,
      text,
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
  }

  public async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await this.apiCall('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text
    });
  }
}

export default TelegramChannel;
