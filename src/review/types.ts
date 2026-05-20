export interface ReviewRule {
  id: string;
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  category: 'quality' | 'bugs' | 'performance' | 'security';
  check: (content: string, filePath: string) => ReviewIssue[];
}

export interface ReviewIssue {
  ruleId: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  category: 'quality' | 'bugs' | 'performance' | 'security';
  line?: number;
  column?: number;
  suggestion?: string;
  code?: string;
}

export interface ReviewResult {
  filePath: string;
  language: string;
  issues: ReviewIssue[];
  summary: {
    total: number;
    errors: number;
    warnings: number;
    infos: number;
  };
  metrics: {
    lines: number;
    codeLines: number;
    commentLines: number;
    blankLines: number;
    complexity?: number;
  };
}

export interface ReviewOptions {
  categories?: ('quality' | 'bugs' | 'performance' | 'security')[];
  severity?: ('error' | 'warning' | 'info')[];
  maxIssues?: number;
  ignorePatterns?: string[];
  useAi?: boolean;
}

export const SUPPORTED_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'java',
  'go',
  'rust',
  'cpp',
  'c',
  'csharp',
  'php',
  'ruby',
  'swift',
  'kotlin',
  'html',
  'css',
  'json',
  'yaml',
  'markdown',
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
