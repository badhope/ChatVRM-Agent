import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { StorageAdapter } from '../../../adapters/storage.adapter.js';

describe('StorageAdapter', () => {
  let tempDir: string;
  let adapter: StorageAdapter;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `storage-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempDir, { recursive: true });
    adapter = new StorageAdapter(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('write and read', () => {
    it('should write and read file', async () => {
      const filePath = 'test.txt';
      const content = 'Hello, World!';

      await adapter.write(filePath, content);
      const result = await adapter.read(filePath);

      expect(result).toBe(content);
    });

    it('should write atomically', async () => {
      const filePath = 'atomic.txt';
      const content = 'atomic write';

      await adapter.write(filePath, content);

      const files = await fs.readdir(tempDir);
      const tmpFiles = files.filter((f) => f.startsWith('.tmp-'));
      expect(tmpFiles.length).toBe(0);

      const result = await adapter.read(filePath);
      expect(result).toBe(content);
    });
  });

  describe('delete', () => {
    it('should delete existing file', async () => {
      const filePath = 'delete-me.txt';
      await adapter.write(filePath, 'content');
      await adapter.delete(filePath);

      const exists = await adapter.exists(filePath);
      expect(exists).toBe(false);
    });

    it('should not throw deleting non-existent file', async () => {
      await expect(adapter.delete('nonexistent.txt')).resolves.not.toThrow();
    });
  });

  describe('exists', () => {
    it('should check file exists', async () => {
      await adapter.write('exists.txt', 'data');

      const result = await adapter.exists('exists.txt');
      expect(result).toBe(true);
    });

    it('should check file does not exist', async () => {
      const result = await adapter.exists('missing.txt');
      expect(result).toBe(false);
    });
  });

  describe('mkdir', () => {
    it('should create directory recursively', async () => {
      await adapter.mkdir('a/b/c');

      const stat = await fs.stat(path.join(tempDir, 'a', 'b', 'c'));
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('list', () => {
    it('should list files in directory', async () => {
      await adapter.write('a.txt', 'a');
      await adapter.write('b.txt', 'b');
      await adapter.mkdir('subdir');

      const files = await adapter.list('.');
      expect(files).toContain('a.txt');
      expect(files).toContain('b.txt');
      expect(files).toContain('subdir');
    });

    it('should return empty list for non-existent directory', async () => {
      const files = await adapter.list('missing-dir');
      expect(files).toEqual([]);
    });
  });

  describe('copy', () => {
    it('should copy file', async () => {
      await adapter.write('src.txt', 'copied content');
      await adapter.copy('src.txt', 'dest.txt');

      const result = await adapter.read('dest.txt');
      expect(result).toBe('copied content');
    });
  });

  describe('move', () => {
    it('should move file', async () => {
      await adapter.write('old.txt', 'moved content');
      await adapter.move('old.txt', 'new.txt');

      const moved = await adapter.read('new.txt');
      expect(moved).toBe('moved content');

      const oldExists = await adapter.exists('old.txt');
      expect(oldExists).toBe(false);
    });
  });

  describe('path resolution', () => {
    it('should resolve relative paths against rootDir', async () => {
      await adapter.write('rel.txt', 'relative');

      const resolvedPath = path.resolve(tempDir, 'rel.txt');
      const content = await fs.readFile(resolvedPath, 'utf-8');
      expect(content).toBe('relative');
    });

    it('should respect absolute paths', async () => {
      const absPath = path.join(tempDir, 'absolute.txt');
      await adapter.write(absPath, 'absolute content');

      const result = await adapter.read(absPath);
      expect(result).toBe('absolute content');
    });

    it('should handle nested directory paths', async () => {
      const nested = path.join('deep', 'nested', 'file.txt');
      await adapter.write(nested, 'deep content');

      const result = await adapter.read(nested);
      expect(result).toBe('deep content');
    });
  });
});