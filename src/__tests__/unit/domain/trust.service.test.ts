import { describe, it, expect } from 'vitest';
import {
  TrustService,
  TrustLevel,
} from '../../../domain/trust/trust.service.js';
import type { TrustVerdict } from '../../../domain/trust/trust.service.js';

describe('TrustService', () => {
  describe('should evaluate safe output as high score', () => {
    it('should return high score for safe output', () => {
      const verdict = TrustService.evaluate(
        'The file was created successfully at src/index.ts',
      );

      expect(verdict.score).toBe(100);
      expect(verdict.level).toBe(TrustLevel.Safe);
      expect(verdict.issues.length).toBe(0);
    });

    it('should not require confirmation for safe output', () => {
      const safeOutput = 'Here is the documentation you requested.';

      const verdict = TrustService.evaluate(safeOutput);

      expect(verdict.requiresConfirmation).toBe(false);
    });

    it('should generate a safe summary', () => {
      const verdict = TrustService.evaluate('All tests passed.');

      expect(verdict.summary).toContain('No trust issues');
    });
  });

  describe('should detect dangerous patterns (rm -rf)', () => {
    it('should detect rm -rf as critical', () => {
      const output = 'Running command: rm -rf /tmp/data';

      const issues = TrustService.detectIssues(output);

      const destructiveIssue = issues.find(
        (i) => i.type === 'destructive' && i.description.includes('recursive force removal'),
      );
      expect(destructiveIssue).toBeDefined();
      expect(destructiveIssue!.level).toBe(TrustLevel.Critical);
    });

    it('should detect sudo as high risk', () => {
      const output = 'sudo apt install nginx';

      const verdict = TrustService.evaluate(output);

      const dangerousIssue = verdict.issues.find(
        (i) => i.type === 'dangerous' && i.pattern.includes('sudo'),
      );
      expect(dangerousIssue).toBeDefined();
      expect(dangerousIssue!.level).toBe(TrustLevel.HighRisk);
    });

    it('should detect chmod 777 as high risk', () => {
      const output = 'chmod 777 /var/www';

      const verdict = TrustService.evaluate(output);

      const dangerousIssue = verdict.issues.find((i) => i.description.includes('world-writable'));
      expect(dangerousIssue).toBeDefined();
    });

    it('should detect eval() as critical', () => {
      const output = 'eval("dangerous code")';

      const verdict = TrustService.evaluate(output);

      const evalIssue = verdict.issues.find((i) => i.pattern.includes('eval'));
      expect(evalIssue).toBeDefined();
      expect(evalIssue!.level).toBe(TrustLevel.Critical);
    });

    it('should detect delete from database as critical', () => {
      const output = 'delete from database users';

      const issues = TrustService.detectIssues(output);

      const destructiveIssue = issues.find((i) => i.description.includes('database'));
      expect(destructiveIssue).toBeDefined();
    });
  });

  describe('should detect sensitive patterns (API keys)', () => {
    it('should detect exposed API key', () => {
      const output = 'api_key=sk-1234567890abcdef';

      const verdict = TrustService.evaluate(output);

      const sensitiveIssue = verdict.issues.find((i) => i.type === 'sensitive' && i.description.includes('API key'));
      expect(sensitiveIssue).toBeDefined();
      expect(sensitiveIssue!.level).toBe(TrustLevel.RequireConfirmation);
    });

    it('should detect exposed password as critical', () => {
      const output = 'password=admin123';

      const verdict = TrustService.evaluate(output);

      const passwordIssue = verdict.issues.find((i) => i.description.includes('password'));
      expect(passwordIssue).toBeDefined();
      expect(passwordIssue!.level).toBe(TrustLevel.Critical);
    });

    it('should detect exposed token as critical', () => {
      const output = 'token=ghp_1234567890abcdefgh';

      const verdict = TrustService.evaluate(output);

      const tokenIssue = verdict.issues.find((i) => i.description.includes('token'));
      expect(tokenIssue).toBeDefined();
      expect(tokenIssue!.level).toBe(TrustLevel.Critical);
    });
  });

  describe('should detect uncertainty expressions', () => {
    it('should detect "I think" as uncertainty', () => {
      const output = 'I think the solution would be to refactor';

      // W18: opt into lenient mode to surface the single-hedge
      // pattern. Production posture (strict: true) would suppress
      // a single hedge in a short reply as conversational noise.
      const verdict = TrustService.evaluate(output, undefined, { strict: false });

      const uncertaintyIssue = verdict.issues.find(
        (i) => i.type === 'uncertainty' && i.description.includes('I think'),
      );
      expect(uncertaintyIssue).toBeDefined();
    });

    it('should detect "probably" as uncertainty', () => {
      const output = 'This is probably the right approach';

      const verdict = TrustService.evaluate(output, undefined, { strict: false });

      const uncertaintyIssue = verdict.issues.find(
        (i) => i.type === 'uncertainty' && i.pattern.includes('probably'),
      );
      expect(uncertaintyIssue).toBeDefined();
    });

    it('should detect "maybe" as uncertainty', () => {
      const output = 'Maybe we should try a different approach';

      const verdict = TrustService.evaluate(output, undefined, { strict: false });

      const maybeIssue = verdict.issues.find((i) => i.pattern.includes('maybe'));
      expect(maybeIssue).toBeDefined();
    });

    it('should detect "I\'m not sure" as uncertainty', () => {
      const output = "I'm not sure if this will work";

      const issues = TrustService.detectIssues(output, undefined, { strict: false });

      const unsureIssue = issues.find(
        (i) => i.type === 'uncertainty' && i.description.includes('lack of certainty'),
      );
      expect(unsureIssue).toBeDefined();
    });
  });

  describe('should calculate score proportional to severity', () => {
    it('should return 100 for no issues', () => {
      const score = TrustService.calculateScore([]);

      expect(score).toBe(100);
    });

    it('should return lower score for multiple issues', () => {
      const fullVerdict = TrustService.evaluate('rm -rf / && sudo something && api_key=abc');
      const score = fullVerdict.score;

      expect(score).toBeLessThan(100);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should return lower score for critical issues', () => {
      const criticalVerdict = TrustService.evaluate('rm -rf / && eval("bad")');
      const lowRiskVerdict = TrustService.evaluate('maybe I think');

      expect(criticalVerdict.score).toBeLessThan(lowRiskVerdict.score);
    });
  });

  describe('safe output should not require confirmation', () => {
    it('should return false for safe output', () => {
      const safeVerdict = TrustService.evaluate('const x = 42;');

      expect(safeVerdict.requiresConfirmation).toBe(false);
    });
  });

  describe('high risk output should require confirmation', () => {
    it('should require confirmation for critical issues', () => {
      const verdict = TrustService.evaluate('rm -rf /important/data');

      expect(verdict.requiresConfirmation).toBe(true);
    });

    it('should require confirmation for sensitive data', () => {
      const verdict = TrustService.evaluate('password=secret123');

      expect(verdict.requiresConfirmation).toBe(true);
    });
  });

  describe('should format output with visual markers', () => {
    it('should not modify safe output', () => {
      const safeOutput = 'Here is the result';

      const formatted = TrustService.formatOutput(safeOutput, []);

      expect(formatted).toBe(safeOutput);
    });

    it('should add [!] markers for critical issues', () => {
      const issues = TrustService.detectIssues('rm -rf /tmp');
      const formatted = TrustService.formatOutput('rm -rf /tmp', issues);

      expect(formatted).toContain('[!]');
    });

    it('should add [?] markers for uncertainty', () => {
      // W18: opt into lenient mode to surface the single-hedge
      // pattern so formatOutput has a [?] target.
      const issues = TrustService.detectIssues('I think this might work', undefined, { strict: false });
      const formatted = TrustService.formatOutput(
        'I think this might work',
        issues,
      );

      expect(formatted).toContain('[?]');
    });
  });

  describe('evaluate (regression: summary always populated, not empty)', () => {
    it('should populate summary when verdict is safe', () => {
      const verdict = TrustService.evaluate('Hello, world!');

      expect(verdict.summary).toBeTruthy();
      expect(verdict.summary).not.toBe('');
      expect(verdict.summary).toContain('No trust issues');
    });

    it('should populate summary and requireConfirmation for dangerous output', () => {
      const verdict = TrustService.evaluate('rm -rf /');

      expect(verdict.summary).toBeTruthy();
      expect(verdict.summary).toContain('Trust level');
      expect(verdict.summary).toContain('issue');
      expect(verdict.requiresConfirmation).toBe(true);
    });
  });
});