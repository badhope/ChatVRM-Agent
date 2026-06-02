import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type { IStoragePort } from '../ports/storage.port.js';

export class StorageAdapter implements IStoragePort {
  private rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = rootDir ?? process.cwd();
  }

  private resolve(filePath: string): string {
    return path.isAbsolute(filePath) ? filePath : path.resolve(this.rootDir, filePath);
  }

  async read(filePath: string): Promise<string> {
    const resolved = this.resolve(filePath);
    return fs.readFile(resolved, 'utf-8');
  }

  async write(filePath: string, content: string): Promise<void> {
    const resolved = this.resolve(filePath);
    const dir = path.dirname(resolved);
    await fs.mkdir(dir, { recursive: true });

    const tmpPath = path.join(dir, `.tmp-${randomUUID()}`);
    await fs.writeFile(tmpPath, content, 'utf-8');
    await fs.rename(tmpPath, resolved);
  }

  async delete(filePath: string): Promise<void> {
    const resolved = this.resolve(filePath);
    try {
      await fs.unlink(resolved);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw err;
    }
  }

  async exists(filePath: string): Promise<boolean> {
    const resolved = this.resolve(filePath);
    try {
      await fs.access(resolved);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    const resolved = this.resolve(dirPath);
    await fs.mkdir(resolved, { recursive: true });
  }

  async list(dirPath: string): Promise<string[]> {
    const resolved = this.resolve(dirPath);
    try {
      const entries = await fs.readdir(resolved, { withFileTypes: true });
      return entries.map((e) => e.name);
    } catch {
      return [];
    }
  }

  async copy(src: string, dest: string): Promise<void> {
    const resolvedSrc = this.resolve(src);
    const resolvedDest = this.resolve(dest);
    const destDir = path.dirname(resolvedDest);
    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(resolvedSrc, resolvedDest);
  }

  async move(src: string, dest: string): Promise<void> {
    const resolvedSrc = this.resolve(src);
    const resolvedDest = this.resolve(dest);
    const destDir = path.dirname(resolvedDest);
    await fs.mkdir(destDir, { recursive: true });
    await fs.rename(resolvedSrc, resolvedDest);
  }
}