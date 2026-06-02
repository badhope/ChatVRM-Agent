import type { Stage, PipelineContext, PipelineEvents } from '../core/types.js';
import { EventEmitter } from 'eventemitter3';
import { getEventBus } from '../core/event-bus.js';
import type { ConfigAdapter } from '../adapters/config.adapter.js';
import { PersonalityService } from '../domain/personality/personality.service.js';
import { EmotionService } from '../domain/personality/emotion.service.js';
import { homedir } from 'os';
import path from 'path';
import fs from 'fs/promises';

export class InitStage implements Stage {
  readonly name = 'initialize';
  readonly required = true;
  private emitter: EventEmitter<PipelineEvents>;
  private config?: ConfigAdapter;

  constructor(emitter?: EventEmitter<PipelineEvents>, config?: ConfigAdapter) {
    this.emitter = emitter ?? getEventBus();
    this.config = config;
  }

  async execute(ctx: PipelineContext): Promise<PipelineContext> {
    if (!ctx.input || ctx.input.trim().length === 0) {
      throw new Error('Input must be non-empty');
    }

    const eventBus = getEventBus();
    const warnings: string[] = [];
    let apiKeyStatus: { provider: string; available: boolean } | null = null;
    let configDirOk = false;

    if (this.config) {
      try {
        await this.config.init();
        const provider = await this.config.getDefaultProvider();
        const apiKey = await this.config.getApiKey(provider);
        apiKeyStatus = { provider, available: !!apiKey || provider === 'ollama' || provider === 'lmstudio' };
        if (!apiKeyStatus.available) {
          warnings.push(`No API key configured for provider "${provider}". Run: personal-assistant config set-key ${provider} <key>`);
        }
      } catch (err) {
        warnings.push(`Config initialization warning: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    try {
      const configDir = path.join(homedir(), '.personal-assistant');
      await fs.mkdir(configDir, { recursive: true });
      await fs.mkdir(path.join(configDir, 'memory'), { recursive: true });
      await fs.mkdir(path.join(configDir, 'backups'), { recursive: true });
      configDirOk = true;
    } catch (err) {
      warnings.push(`Cannot create config directory: ${err instanceof Error ? err.message : String(err)}`);
    }

    const personality = PersonalityService.createDefaultIdentity();
    const emotion = EmotionService.createDefaultEmotion();

    const updatedCtx: PipelineContext = {
      ...ctx,
      metadata: {
        ...ctx.metadata,
        startTime: Date.now(),
        apiKeyStatus,
        configDirOk,
        warnings,
        personality: { name: personality.name, traits: personality.traits },
        initialEmotion: emotion.name,
      },
    };

    eventBus.emit('output', {
      text: `Pipeline initialized (provider: ${apiKeyStatus?.provider ?? 'unknown'}, key: ${apiKeyStatus?.available ? 'yes' : 'no'}, config dir: ${configDirOk ? 'ok' : 'failed'})`,
    });

    if (warnings.length > 0) {
      for (const w of warnings) {
        eventBus.emit('output', { text: `  ⚠ ${w}` });
      }
    }

    return updatedCtx;
  }
}