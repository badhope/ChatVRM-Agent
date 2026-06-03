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
  ): TrustVerdict {
    const issues = TrustService.detectIssues(output, context);
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
  ): TrustIssue[] {
    const issues: TrustIssue[] = [];

    for (const dp of DANGEROUS_PATTERNS) {
      if (dp.pattern.test(output)) {
        issues.push({
          type: dp.type,
          level: dp.level,
          description: dp.description,
          suggestion: dp.suggestion,
          pattern: dp.pattern.source,
        });
      }
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