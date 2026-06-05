export enum TrustLevel {
  Safe = 'Safe',
  AutoExecute = 'AutoExecute',
  RequireConfirmation = 'RequireConfirmation',
  HighRisk = 'HighRisk',
  Critical = 'Critical',
}

export interface TrustIssue {
  type: 'hallucination' | 'dangerous' | 'sensitive' | 'destructive' | 'uncertainty';
  level: TrustLevel;
  description: string;
  suggestion: string;
  pattern: string;
}

export interface TrustVerdict {
  level: TrustLevel;
  score: number;
  requiresConfirmation: boolean;
  issues: TrustIssue[];
  summary: string;
}

interface DangerPattern {
  pattern: RegExp;
  type: TrustIssue['type'];
  level: TrustLevel;
  description: string;
  suggestion: string;
}

export const DANGEROUS_PATTERNS: DangerPattern[] = [
  {
    pattern: /rm\s+-rf/i,
    type: 'destructive',
    level: TrustLevel.Critical,
    description: 'Attempting recursive force removal of files',
    suggestion: 'Verify the target path and consider using a safer alternative like moving to trash',
  },
  {
    pattern: /sudo\s+/i,
    type: 'dangerous',
    level: TrustLevel.HighRisk,
    description: 'Attempting to run command with elevated privileges',
    suggestion: 'Prefer non-privileged operations unless absolutely necessary',
  },
  {
    pattern: /chmod\s+777/i,
    type: 'dangerous',
    level: TrustLevel.HighRisk,
    description: 'Setting world-writable permissions on a file',
    suggestion: 'Use more restrictive permissions (e.g. 755 or 644)',
  },
  {
    pattern: /\beval\s*\(/i,
    type: 'dangerous',
    level: TrustLevel.Critical,
    description: 'Using eval() which can execute arbitrary code',
    suggestion: 'Avoid eval() entirely; use safer parsing or sandboxed execution',
  },
  {
    pattern: /\bexec\s*\(/i,
    type: 'dangerous',
    level: TrustLevel.HighRisk,
    description: 'Using exec() to spawn system commands',
    suggestion: 'Validate all inputs and prefer structured APIs over shell execution',
  },
  {
    pattern: /delete\s+(from\s+)?database/i,
    type: 'destructive',
    level: TrustLevel.Critical,
    description: 'Attempting to delete database contents',
    suggestion: 'Always require explicit confirmation before destructive database operations',
  },
  {
    pattern: /drop\s+table/i,
    type: 'destructive',
    level: TrustLevel.Critical,
    description: 'Attempting to drop a database table',
    suggestion: 'Backup data before dropping and require explicit confirmation',
  },
  {
    pattern: /(api[_-]?key|api_key|apikey)\s*[:=]\s*['"\w-]+/i,
    type: 'sensitive',
    level: TrustLevel.RequireConfirmation,
    description: 'Exposing an API key in plain text',
    suggestion: 'Never output API keys; use environment variables or secret references',
  },
  {
    pattern: /(password|passwd)\s*[:=]\s*['"\w-]+/i,
    type: 'sensitive',
    level: TrustLevel.Critical,
    description: 'Exposing a password in plain text',
    suggestion: 'Never output passwords; use secure credential storage',
  },
  {
    pattern: /(token|secret)\s*[:=]\s*['"\w-]+/i,
    type: 'sensitive',
    level: TrustLevel.Critical,
    description: 'Exposing a token or secret in plain text',
    suggestion: 'Never output secrets; reference them indirectly',
  },
  {
    pattern: /I\s+think/i,
    type: 'uncertainty',
    level: TrustLevel.RequireConfirmation,
    description: 'Expressing uncertainty with "I think"',
    suggestion: 'State facts confidently or explicitly note when information is uncertain',
  },
  {
    pattern: /probably/i,
    type: 'uncertainty',
    level: TrustLevel.RequireConfirmation,
    description: 'Using hedging language "probably"',
    suggestion: 'Replace with factual statements or explicitly qualify uncertainty',
  },
  {
    pattern: /maybe/i,
    type: 'uncertainty',
    level: TrustLevel.AutoExecute,
    description: 'Using hedging language "maybe"',
    suggestion: 'Provide a clear recommendation instead of being non-committal',
  },
  {
    pattern: /I'?m\s+not\s+sure/i,
    type: 'uncertainty',
    level: TrustLevel.RequireConfirmation,
    description: 'Expressing lack of certainty',
    suggestion: 'Acknowledge the limits of knowledge and suggest verification steps',
  },
];

// Hedge patterns are extremely common in legitimate prose
// ("I think we should refactor this", "we'll probably go", "maybe
// tomorrow"). The gate keeps the "safe to run" verdicts for short
// conversational hedges while still surfacing real uncertainty
// in long outputs. W15 added this gate; H14 (W18) removed the
// silent `process.env['VITEST']` env-var bypass that made
// `strict` collapse to false under the test runner, and now ties
// gate behaviour to the explicit `strict` option only.
const HEDGE_PATTERNS = [
  /\bI\s+think\b/i,
  /\bprobably\b/i,
  /\bmaybe\b/i,
  /\bI'?m\s+not\s+sure\b/i,
  /\bperhaps\b/i,
  /\bpossibly\b/i,
];
const HEDGE_MIN_COUNT_FOR_SHORT = 2;
const HEDGE_LONG_BODY_LENGTH = 200;
const HEDGE_LONG_BODY_MIN_COUNT = 1;

function hedgeGateOpen(hedgeCount: number, textLength: number): boolean {
  if (textLength >= HEDGE_LONG_BODY_LENGTH) {
    return hedgeCount >= HEDGE_LONG_BODY_MIN_COUNT;
  }
  return hedgeCount >= HEDGE_MIN_COUNT_FOR_SHORT;
}

const SEVERITY_PENALTY: Record<TrustLevel, number> = {
  [TrustLevel.Safe]: 5,
  [TrustLevel.AutoExecute]: 10,
  [TrustLevel.RequireConfirmation]: 15,
  [TrustLevel.HighRisk]: 25,
  [TrustLevel.Critical]: 35,
};

function clampScore(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function scoreToLevel(score: number): TrustLevel {
  if (score >= 90) return TrustLevel.Safe;
  if (score >= 75) return TrustLevel.AutoExecute;
  if (score >= 50) return TrustLevel.RequireConfirmation;
  if (score >= 25) return TrustLevel.HighRisk;
  return TrustLevel.Critical;
}

function generateSummary(issues: TrustIssue[], level: TrustLevel): string {
  if (issues.length === 0) {
    return 'No trust issues detected. The output appears safe.';
  }
  const issueDescriptions = issues.map((i) => `- ${i.description}`).join('\n');
  return `Trust level: ${level}. Found ${issues.length} issue(s):\n${issueDescriptions}`;
}

export class TrustService {
  static evaluate(
    output: string,
    context?: { intent?: string; toolUsed?: string },
    opts: { strict?: boolean } = {},
  ): TrustVerdict {
    const issues = TrustService.detectIssues(output, context, opts);
    const score = TrustService.calculateScore(issues);
    const level = scoreToLevel(score);
    const summary = generateSummary(issues, level);
    return {
      level,
      score,
      requiresConfirmation: TrustService.shouldConfirm({
        level,
        score,
        requiresConfirmation: false,
        issues,
        summary,
      }),
      issues,
      summary,
    };
  }

  static detectIssues(
    output: string,
    _context?: { intent?: string; toolUsed?: string },
    opts: { strict?: boolean } = {},
  ): TrustIssue[] {
    const issues: TrustIssue[] = [];

    // H14 (W18): removed the silent `process.env['VITEST'] !== 'true'`
    // env-var bypass that auto-set strict under the test runner. The
    // production code path is now the same under vitest as under node.
    //
    // `strict` controls the hedge gate:
    //   - `strict: true`  (default, production posture): a single
    //     hedge in a short conversational reply is suppressed as
    //     noise. Multiple hedges OR a hedge in a long body opens
    //     the gate and surfaces the issue. This is the W15 design.
    //   - `strict: false` (lenient / test isolation): every matched
    //     hedge is surfaced regardless of count or body length.
    //
    // Pre-existing tests that want every hedge surfaced should
    // pass `{ strict: false }` explicitly to opt into lenient mode.
    const strict = opts.strict !== false;
    const hedgeCount = HEDGE_PATTERNS.reduce(
      (n, p) => n + (p.test(output) ? 1 : 0),
      0,
    );
    const gateOpen = strict
      ? hedgeGateOpen(hedgeCount, output.length)
      : hedgeCount >= 1;

    for (const dp of DANGEROUS_PATTERNS) {
      if (!dp.pattern.test(output)) continue;
      // Suppress the noisy hedge pattern unless the gate is open.
      if (dp.type === 'uncertainty' && !gateOpen) continue;
      issues.push({
        type: dp.type,
        level: dp.level,
        description: dp.description,
        suggestion: dp.suggestion,
        pattern: dp.pattern.source,
      });
    }

    return issues;
  }

  static calculateScore(issues: TrustIssue[]): number {
    if (issues.length === 0) {
      return 100;
    }

    let totalPenalty = 0;
    for (const issue of issues) {
      const basePenalty = SEVERITY_PENALTY[issue.level];
      totalPenalty += basePenalty;
    }

    const criticalCount = issues.filter((i) => i.level === TrustLevel.Critical).length;
    const highRiskCount = issues.filter((i) => i.level === TrustLevel.HighRisk).length;
    const multiplier = 1 + (criticalCount * 0.5) + (highRiskCount * 0.3) + (issues.length * 0.1);

    const score = 100 - totalPenalty * multiplier;
    return clampScore(score);
  }

  static shouldConfirm(verdict: TrustVerdict): boolean {
    return (
      verdict.level === TrustLevel.RequireConfirmation ||
      verdict.level === TrustLevel.HighRisk ||
      verdict.level === TrustLevel.Critical
    );
  }

  static formatOutput(output: string, issues: TrustIssue[]): string {
    if (issues.length === 0) {
      return output;
    }

    let formatted = output;

    for (const issue of issues) {
      const regex = new RegExp(issue.pattern, 'gi');
      let marker: string;
      if (issue.level === TrustLevel.Critical || issue.level === TrustLevel.HighRisk) {
        marker = '[!]';
      } else if (issue.type === 'uncertainty') {
        marker = '[?]';
      } else {
        marker = '[*]';
      }

      const firstMatch = regex.exec(formatted);
      if (firstMatch) {
        regex.lastIndex = 0;
        formatted = formatted.replace(regex, `${marker} ${firstMatch[0]} ${marker}`);
        break;
      }
    }

    return formatted;
  }
}