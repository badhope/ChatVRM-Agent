declare module 'typhonjs-escomplex' {
  export interface HalsteadMetrics {
    operators: { total: number; distinct: number };
    operands: { total: number; distinct: number };
    length: number;
    vocabulary: number;
    volume: number;
    difficulty: number;
    effort: number;
    bugs: number;
    time: number;
  }

  export interface FunctionMetric {
    name: string;
    line: number;
    linesOfCode: { total: number; source: number; comment: number };
    cyclomatic: number;
    cyclomaticDensity: number;
    halstead: HalsteadMetrics;
    maintainability: number;
  }

  export interface ModuleReport {
    aggregate: {
      linesOfCode: { total: number; source: number; comment: number };
      cyclomatic: number;
      cyclomaticDensity: number;
      halstead: HalsteadMetrics;
      maintainability: number;
    };
    functions: FunctionMetric[];
    maintainability: number;
  }

  export function analyzeModule(source: string, options?: object): ModuleReport;
}
