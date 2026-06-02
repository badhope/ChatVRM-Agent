import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UnderstandStage } from '../../../stages/understand.stage.js';
import { resetEventBus } from '../../../core/event-bus.js';
import type { PipelineContext } from '../../../core/types.js';

function createContext(input: string): PipelineContext {
  return {
    taskId: 'task-001',
    input,
    errors: [],
    metadata: {},
    createdFiles: [],
    modifiedFiles: [],
    phaseHistory: [],
    shouldConfirm: false,
  };
}

describe('UnderstandStage', () => {
  let stage: UnderstandStage;

  beforeEach(() => {
    resetEventBus();
    stage = new UnderstandStage(null);
  });

  afterEach(() => {
    resetEventBus();
  });

  describe('should recognize code intent', () => {
    it('should detect code keyword "write a function"', async () => {
      const ctx = createContext('write a function to sort arrays');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('code');
    });

    it('should detect code keyword "implement"', async () => {
      const ctx = createContext('implement a binary search tree');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('code');
    });

    it('should detect code keyword "refactor"', async () => {
      const ctx = createContext('refactor the authentication module');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('code');
    });

    it('should detect "fix bug" as code intent', async () => {
      const ctx = createContext('fix bug in login page');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('code');
    });
  });

  describe('should recognize chat intent', () => {
    it('should detect "hello" as chat intent', async () => {
      const ctx = createContext('hello');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('chat');
    });

    it('should detect "how are you" as chat', async () => {
      const ctx = createContext('hi, how are you today?');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('chat');
    });

    it('should detect "explain" as chat', async () => {
      const ctx = createContext('explain how closures work');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('chat');
    });

    it('should detect "tell me about" as chat', async () => {
      const ctx = createContext('tell me about the project architecture');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('chat');
    });

    it('should detect "what is" as chat', async () => {
      const ctx = createContext('what is the meaning of life');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('chat');
    });
  });

  describe('should recognize file-op intent', () => {
    it('should detect "read file" as file-op', async () => {
      const ctx = createContext('read the package.json file');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('file-op');
    });

    it('should detect "create file" as file-op', async () => {
      const ctx = createContext('create a new config file');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('file-op');
    });

    it('should detect "delete" as file-op', async () => {
      const ctx = createContext('delete the temp directory');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('file-op');
    });

    it('should detect "edit" as file-op', async () => {
      const ctx = createContext('edit the readme file');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('file-op');
    });

    it('should detect "save" as file-op', async () => {
      const ctx = createContext('save the changes to disk');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('file-op');
    });
  });

  describe('should recognize search intent', () => {
    it('should detect "search" as search intent', async () => {
      const ctx = createContext('search for user records');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('search');
    });

    it('should detect "find" as search intent', async () => {
      const ctx = createContext('find where the API key is stored');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('search');
    });

    it('should detect "look for" as search intent', async () => {
      const ctx = createContext('look for the configuration');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('search');
    });

    it('should detect "locate" as search intent', async () => {
      const ctx = createContext('locate the database connection string');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('search');
    });

    it('should detect "grep" as search intent', async () => {
      const ctx = createContext('grep through the project');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('search');
    });
  });

  describe('should default to general intent', () => {
    it('should return general for unrecognized input', async () => {
      const ctx = createContext('xyzzy');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('general');
    });

    it('should return general for empty but non-matching input', async () => {
      const ctx = createContext('.');

      const result = await stage.execute(ctx);

      expect(result.intent).toBe('general');
    });
  });

  describe('should set context files in metadata', () => {
    it('should set intentConfidence to medium for regex-recognized intent', async () => {
      const ctx = createContext('write a module');

      const result = await stage.execute(ctx);

      expect(result.metadata.intentConfidence).toBe('medium');
    });

    it('should set intentConfidence to low for general intent', async () => {
      const ctx = createContext('...');

      const result = await stage.execute(ctx);

      expect(result.metadata.intentConfidence).toBe('low');
    });

    it('should set contextFiles in metadata', async () => {
      const ctx = createContext('search for something');

      const result = await stage.execute(ctx);

      expect(result.metadata).toHaveProperty('contextFiles');
      expect(Array.isArray(result.metadata.contextFiles)).toBe(true);
    });
  });
});