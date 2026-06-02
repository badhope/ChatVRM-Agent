import { EventEmitter } from 'eventemitter3';
import type { PipelineEvents } from './types.js';

let instance: EventEmitter<PipelineEvents> | null = null;

export function createEventBus(): EventEmitter<PipelineEvents> {
  if (!instance) {
    instance = new EventEmitter<PipelineEvents>();
  }
  return instance;
}

export function getEventBus(): EventEmitter<PipelineEvents> {
  if (!instance) {
    instance = createEventBus();
  }
  return instance;
}

export function resetEventBus(): void {
  if (instance) {
    instance.removeAllListeners();
    instance = null;
  }
}