import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ContextBuilder } from '../../../adapters/context.builder.js';
import { StorageAdapter } from '../../../adapters/storage.adapter.js';

describe('ContextBuilder', () => {
  let tmpDir: string;
  let storage: StorageAdapter;
  let builder: ContextBuilder;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctx-builder-'));
    await fs.writeFile(path.join(tmpDir, 'index.ts'), 'export const greeting = "hello world";\n');
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Project\n\nA test project\n');
    storage = new StorageAdapter();
    builder = new ContextBuilder(storage);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should build context with repo map and code search', async () => {
    const result = await builder.build({
      rootDir: tmpDir,
      query: 'greeting',
      includeRepoMap: true,
      includeCodeSearch: true,
      includeKnowledge: false,
    });
    expect(result.context.length).toBeGreaterThan(0);
    expect(result.repoMapIncluded).toBe(true);
    expect(result.codeEntryCount).toBeGreaterThan(0);
  });

  it('should skip repo map if disabled', async () => {
    const result = await builder.build({
      rootDir: tmpDir,
      query: 'greeting',
      includeRepoMap: false,
      includeCodeSearch: true,
      includeKnowledge: false,
    });
    expect(result.repoMapIncluded).toBe(false);
  });

  it('should handle empty query gracefully', async () => {
    const result = await builder.build({
      rootDir: tmpDir,
      query: '',
      includeRepoMap: true,
      includeCodeSearch: false,
      includeKnowledge: false,
    });
    expect(result.repoMapIncluded).toBe(true);
    expect(result.codeEntryCount).toBe(0);
  });

  it('should not include knowledge when disabled', async () => {
    const result = await builder.build({
      rootDir: tmpDir,
      query: 'test',
      includeRepoMap: false,
      includeCodeSearch: false,
      includeKnowledge: false,
    });
    expect(result.knowledgeEntryCount).toBe(0);
  });

  it('should query knowledge base', async () => {
    const entries = await builder.queryKnowledge('hello world');
    expect(Array.isArray(entries)).toBe(true);
  });

  it('should get a repo map', async () => {
    const map = await builder.getRepoMap();
    expect(typeof map).toBe('string');
  });

  it('should return empty map for nonexistent directory', async () => {
    const result = await builder.build({
      rootDir: '/nonexistent-zzz-xxx',
      query: 'x',
      includeRepoMap: true,
      includeCodeSearch: false,
      includeKnowledge: false,
    });
    expect(result.context).toBe('');
    expect(result.repoMapIncluded).toBe(false);
  });

  it('should truncate context to maxTokens', async () => {
    const result = await builder.build({
      rootDir: tmpDir,
      query: 'greeting',
      maxTokens: 10,
      includeRepoMap: true,
      includeCodeSearch: true,
      includeKnowledge: false,
    });
    expect(result.context.length).toBeLessThanOrEqual(10 * 4 + 50);
  });
});
