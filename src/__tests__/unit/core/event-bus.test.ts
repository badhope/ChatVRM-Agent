import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'eventemitter3';
import {
  createEventBus,
  getEventBus,
  resetEventBus,
} from '../../../core/event-bus.js';
import type { PipelineEvents } from '../../../core/types.js';

describe('EventBus', () => {
  beforeEach(() => {
    resetEventBus();
  });

  afterEach(() => {
    resetEventBus();
  });

  describe('createEventBus should create a new instance', () => {
    it('should create a new EventEmitter instance', () => {
      const bus = createEventBus();

      expect(bus).toBeDefined();
      expect(bus).toBeInstanceOf(EventEmitter);
    });

    it('should return the same instance on subsequent calls', () => {
      const bus1 = createEventBus();
      const bus2 = createEventBus();

      expect(bus1).toBe(bus2);
    });
  });

  describe('getEventBus should return the same instance', () => {
    it('should return the same instance as createEventBus', () => {
      const bus1 = createEventBus();
      const bus2 = getEventBus();

      expect(bus1).toBe(bus2);
    });

    it('should create instance if not already created', () => {
      resetEventBus();

      const bus = getEventBus();

      expect(bus).toBeDefined();
      expect(bus).toBeInstanceOf(EventEmitter);
    });
  });

  describe('resetEventBus should clear the instance', () => {
    it('should nullify the instance', () => {
      const bus1 = createEventBus();
      resetEventBus();
      const bus2 = createEventBus();

      expect(bus1).not.toBe(bus2);
    });

    it('should remove all listeners', () => {
      const bus = createEventBus();
      const listener = () => {};
      bus.on('output', listener);

      expect(bus.listenerCount('output')).toBe(1);

      resetEventBus();

      const newBus = createEventBus();
      expect(newBus.listenerCount('output')).toBe(0);
    });
  });

  describe('should emit and receive events', () => {
    it('should emit and receive output events', () => {
      const bus = createEventBus();
      const received: string[] = [];

      bus.on('output', (data) => {
        received.push(data.text);
      });

      bus.emit('output', { text: 'hello' });
      bus.emit('output', { text: 'world' });

      expect(received).toEqual(['hello', 'world']);
    });

    it('should emit and receive pipeline:start events', () => {
      const bus = createEventBus();
      let received: unknown = null;

      bus.on('pipeline:start', (data) => {
        received = data;
      });

      bus.emit('pipeline:start', {
        context: {
          taskId: 'test-id',
          input: 'test',
          errors: [],
          metadata: {},
          createdFiles: [],
          modifiedFiles: [],
          phaseHistory: [],
        },
      });

      expect(received).toBeDefined();
      expect((received as Record<string, unknown>).context).toBeDefined();
    });

    it('should emit and receive pipeline:complete events', () => {
      const bus = createEventBus();
      let received: unknown = null;

      bus.on('pipeline:complete', (data) => {
        received = data;
      });

      bus.emit('pipeline:complete', {
        context: {
          taskId: 'test-id',
          input: 'test',
          errors: [],
          metadata: {},
          createdFiles: [],
          modifiedFiles: [],
          phaseHistory: [],
        },
        totalDurationMs: 100,
      });

      expect(received).toBeDefined();
      expect((received as Record<string, unknown>).totalDurationMs).toBe(100);
    });

    it('should support multiple listeners for the same event', () => {
      const bus = createEventBus();
      const results: number[] = [];

      bus.on('output', () => { results.push(1); });
      bus.on('output', () => { results.push(2); });

      bus.emit('output', { text: 'test' });

      expect(results).toEqual([1, 2]);
    });
  });
});