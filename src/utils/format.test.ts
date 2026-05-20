import { describe, it, expect } from 'vitest';
import { formatBytes, formatDuration, formatContext } from './format.js';

describe('formatBytes', () => {
  it('should format 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('should format bytes to KB', () => {
    expect(formatBytes(1024)).toBe('1 KB');
  });

  it('should format bytes to MB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
  });

  it('should format bytes to GB', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
  });

  it('should format small bytes correctly', () => {
    expect(formatBytes(512)).toBe('512 B');
  });
});

describe('formatDuration', () => {
  it('should format milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('should format seconds', () => {
    expect(formatDuration(5000)).toBe('5.0s');
  });

  it('should format sub-second as milliseconds', () => {
    expect(formatDuration(999)).toBe('999ms');
  });

  it('should format exactly 1000ms as 1.0s', () => {
    expect(formatDuration(1000)).toBe('1.0s');
  });
});

describe('formatContext', () => {
  it('should format small token count', () => {
    expect(formatContext(512)).toBe('512');
  });

  it('should format thousands as K', () => {
    expect(formatContext(4000)).toBe('4K');
  });

  it('should format millions as M', () => {
    expect(formatContext(1000000)).toBe('1.0M');
  });

  it('should format 128K context', () => {
    expect(formatContext(128000)).toBe('128K');
  });
});
