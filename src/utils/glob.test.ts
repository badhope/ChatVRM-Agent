import { describe, it, expect } from 'vitest';
import { globMatch, matchesAnyGlob, globToRegex } from './glob.js';

describe('globToRegex', () => {
  it('should produce a regex that matches exact string', () => {
    const regex = globToRegex('test.ts');
    const re = new RegExp(`^${regex}$`);
    expect(re.test('test.ts')).toBe(true);
    expect(re.test('testtsx')).toBe(false);
  });

  it('should produce a regex that matches * wildcard', () => {
    const regex = globToRegex('*.ts');
    const re = new RegExp(`^${regex}$`);
    expect(re.test('test.ts')).toBe(true);
    expect(re.test('src/test.ts')).toBe(false);
  });

  it('should produce a regex that matches ** wildcard', () => {
    const regex = globToRegex('**/*.ts');
    const re = new RegExp(`^${regex}$`);
    expect(re.test('src/components/Button.ts')).toBe(true);
    expect(re.test('Button.ts')).toBe(true);
  });

  it('should produce a regex that matches ? wildcard', () => {
    const regex = globToRegex('test.?s');
    const re = new RegExp(`^${regex}$`);
    expect(re.test('test.ts')).toBe(true);
    expect(re.test('test.js')).toBe(true);
    expect(re.test('test.tsx')).toBe(false);
  });
});

describe('globMatch', () => {
  it('should match exact string', () => {
    expect(globMatch('test.ts', 'test.ts')).toBe(true);
  });

  it('should match with * wildcard', () => {
    expect(globMatch('test.ts', '*.ts')).toBe(true);
    expect(globMatch('src/test.ts', '*.ts')).toBe(false);
  });

  it('should match with ** wildcard', () => {
    expect(globMatch('src/components/Button.tsx', '**/*.tsx')).toBe(true);
    expect(globMatch('Button.tsx', '**/*.tsx')).toBe(true);
  });

  it('should match with ? wildcard', () => {
    expect(globMatch('test.ts', 'test.?s')).toBe(true);
    expect(globMatch('test.js', 'test.?s')).toBe(true);
    expect(globMatch('test.tsx', 'test.?s')).toBe(false);
  });

  it('should not match when pattern differs', () => {
    expect(globMatch('test.js', '*.ts')).toBe(false);
  });

  it('should handle nested paths with **', () => {
    expect(globMatch('src/utils/helpers/array.ts', 'src/**/*.ts')).toBe(true);
  });
});

describe('matchesAnyGlob', () => {
  it('should match any pattern in array', () => {
    expect(matchesAnyGlob('test.ts', ['*.js', '*.ts'])).toBe(true);
    expect(matchesAnyGlob('test.py', ['*.js', '*.ts'])).toBe(false);
  });

  it('should return false for empty patterns', () => {
    expect(matchesAnyGlob('test.ts', [])).toBe(false);
  });

  it('should match first pattern', () => {
    expect(matchesAnyGlob('test.js', ['*.js', '*.ts'])).toBe(true);
  });

  it('should normalize Windows paths', () => {
    expect(matchesAnyGlob('src\\test.ts', ['src/*.ts'])).toBe(true);
  });

  it('should handle complex patterns', () => {
    const patterns = ['**/*.test.ts', '**/*.spec.ts'];
    expect(matchesAnyGlob('src/utils/glob.test.ts', patterns)).toBe(true);
    expect(matchesAnyGlob('src/utils/glob.spec.ts', patterns)).toBe(true);
    expect(matchesAnyGlob('src/utils/glob.ts', patterns)).toBe(false);
  });
});
