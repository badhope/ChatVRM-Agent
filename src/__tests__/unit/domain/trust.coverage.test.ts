import { describe, it, expect } from 'vitest';
import { TrustService, TrustLevel } from '../../../domain/trust/trust.service.js';
import type { TrustIssue } from '../../../domain/trust/trust.service.js';

describe('TrustService formatOutput coverage', () => {
  describe('formatOutput should add visual markers for dangerous patterns', () => {
    it('should add [!] markers for critical level issues', () => {
      const output = 'Running rm -rf /tmp to clean up';
      const issues = TrustService.detectIssues(output);

      const formatted = TrustService.formatOutput(output, issues);

      expect(formatted).toContain('[!]');
    });

    it('should add [!] markers for high risk level issues', () => {
      const output = 'sudo apt install nginx';
      const issues = TrustService.detectIssues(output);

      const formatted = TrustService.formatOutput(output, issues);

      expect(formatted).toContain('[!]');
    });

    it('should add [!] for exec() dangerous pattern', () => {
      const output = 'exec("ls -la")';
      const issues = TrustService.detectIssues(output);

      const formatted = TrustService.formatOutput(output, issues);

      expect(formatted).toContain('[!]');
    });
  });

  describe('formatOutput should add [?] markers for uncertain patterns', () => {
    it('should add [?] for "I think" uncertainty', () => {
      const output = 'I think this approach will work';
      // W18: lenient mode surfaces the single-hedge pattern so
      // formatOutput has a [?] target to mark.
      const issues = TrustService.detectIssues(output, undefined, { strict: false });

      const formatted = TrustService.formatOutput(output, issues);

      expect(formatted).toContain('[?]');
    });

    it('should add [?] for "probably" uncertainty', () => {
      const output = 'This is probably correct';
      const issues = TrustService.detectIssues(output, undefined, { strict: false });

      const formatted = TrustService.formatOutput(output, issues);

      expect(formatted).toContain('[?]');
    });

    it('should add [?] for "maybe" uncertainty', () => {
      const output = 'Maybe we should reconsider';
      const issues = TrustService.detectIssues(output, undefined, { strict: false });

      const formatted = TrustService.formatOutput(output, issues);

      expect(formatted).toContain('[?]');
    });

    it('should add [?] for "I\'m not sure" uncertainty', () => {
      const output = "I'm not sure about this one";
      const issues = TrustService.detectIssues(output, undefined, { strict: false });

      const formatted = TrustService.formatOutput(output, issues);

      expect(formatted).toContain('[?]');
    });
  });

  describe('formatOutput should add [*] markers for sensitive patterns', () => {
    it('should add [*] for exposed API key', () => {
      const output = 'api_key=sk-1234567890abcdef';
      const issues = TrustService.detectIssues(output);

      const formatted = TrustService.formatOutput(output, issues);

      expect(formatted).toContain('[*]');
    });
  });

  describe('formatOutput should not modify text without issues', () => {
    it('should return unchanged output when there are no issues', () => {
      const output = 'Here is the result you requested.';

      const formatted = TrustService.formatOutput(output, []);

      expect(formatted).toBe(output);
    });
  });

  describe('formatOutput should preserve original text structure', () => {
    it('should keep surrounding text when adding markers', () => {
      const output = 'Before rm -rf /tmp/data after';
      const issues = TrustService.detectIssues(output);

      const formatted = TrustService.formatOutput(output, issues);

      expect(formatted).toContain('Before');
      expect(formatted).toContain('after');
    });

    it('should preserve line breaks in output', () => {
      const output = 'line1\nI think this works\nline3';
      // W18: lenient mode surfaces the single-hedge pattern.
      const issues = TrustService.detectIssues(output, undefined, { strict: false });

      const formatted = TrustService.formatOutput(output, issues);

      expect(formatted).toContain('line1');
      expect(formatted).toContain('line3');
      expect(formatted).toContain('[?]');
    });
  });

  describe('formatOutput with multiple issues of same type', () => {
    it('should handle two uncertainty issues in one output', () => {
      const output = 'I think this is probably correct';
      // Two distinct hedges open the gate even in strict mode, but
      // pass strict: false to keep the test contract explicit.
      const issues = TrustService.detectIssues(output, undefined, { strict: false });

      const formatted = TrustService.formatOutput(output, issues);

      expect(issues.filter((i) => i.type === 'uncertainty').length).toBeGreaterThanOrEqual(1);
      expect(formatted).toContain('[?]');
    });

    it('should handle two dangerous issues in one output', () => {
      const output = 'sudo rm -rf /tmp';
      const issues = TrustService.detectIssues(output);

      const formatted = TrustService.formatOutput(output, issues);

      expect(formatted).toContain('[!]');
    });
  });

  describe('formatOutput should handle empty issues array', () => {
    it('should return output unchanged with empty issues', () => {
      const output = 'Some content here.';

      const formatted = TrustService.formatOutput(output, []);

      expect(formatted).toBe(output);
    });

    it('should return empty string unchanged with empty issues', () => {
      const formatted = TrustService.formatOutput('', []);

      expect(formatted).toBe('');
    });
  });

  describe('formatOutput should handle empty output string', () => {
    it('should return empty string when output is empty', () => {
      const formatted = TrustService.formatOutput('', []);

      expect(formatted).toBe('');
    });

    it('should return empty string when output is empty regardless of issues', () => {
      const issues: TrustIssue[] = [
        {
          type: 'destructive',
          level: TrustLevel.Critical,
          description: 'test',
          suggestion: 'test',
          pattern: 'rm -rf',
        },
      ];

      const formatted = TrustService.formatOutput('', issues);

      expect(formatted).toBe('');
    });
  });
});