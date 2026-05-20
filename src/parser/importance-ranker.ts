/**
 * Symbol Importance Ranker
 *
 * Ranks code symbols by importance using ts-morph for accurate
 * reference counting, export analysis, and type information.
 */

import * as path from 'path';
import type {
  SourceFile,
  Symbol,
  FunctionDeclaration,
  ClassDeclaration,
  InterfaceDeclaration,
  TypeAliasDeclaration,
  EnumDeclaration,
  VariableDeclaration,
} from 'ts-morph';
import { getProject, createProject } from './ts-morph-project.js';
import type { DependencyGraph } from './dependency-graph.js';

/** Symbol kind type */
export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'variable'
  | 'method'
  | 'property'
  | 'namespace'
  | 'module';

/** Code symbol information */
export interface CodeSymbol {
  /** Symbol name */
  name: string;
  /** Symbol kind */
  kind: SymbolKind;
  /** File path where defined */
  filePath: string;
  /** Start line (1-based) */
  startLine: number;
  /** End line (1-based) */
  endLine: number;
  /** Documentation comment */
  documentation?: string;
}

/** Importance ranking for a single symbol */
export interface SymbolImportance {
  /** The symbol being ranked */
  symbol: CodeSymbol;
  /** Computed importance score (higher = more important) */
  score: number;
  /** How many files reference this symbol */
  referenceCount: number;
  /** Whether this symbol is exported */
  isExported: boolean;
  /** Whether this symbol is in an entry point file */
  isEntry: boolean;
  /** Number of implementations (for interfaces/abstract classes) */
  implementationCount: number;
  /** Inheritance depth (for classes) */
  inheritanceDepth: number;
}

/** Options for importance ranking */
export interface ImportanceRankerOptions {
  /** Explicit entry point file paths or patterns */
  entryPoints?: string[];
  /** Path to tsconfig.json */
  tsConfigPath?: string;
  /** Weight for reference count (default: 2) */
  referenceWeight?: number;
  /** Weight for export status (default: 1) */
  exportWeight?: number;
  /** Weight for entry point status (default: 1) */
  entryWeight?: number;
  /** Weight for class symbols (default: 0.5) */
  classWeight?: number;
  /** Weight for interface implementations (default: 0.3) */
  implementationWeight?: number;
  /** Weight for inheritance depth (default: 0.2) */
  inheritanceWeight?: number;
}

/** Default entry point file name patterns */
const DEFAULT_ENTRY_PATTERNS = [
  'index.ts',
  'index.js',
  'index.mts',
  'main.ts',
  'main.js',
  'app.ts',
  'app.js',
  'cli.ts',
  'cli.js',
  'server.ts',
  'server.js',
];

/**
 * ImportanceRanker class for ranking symbols by importance.
 *
 * Uses ts-morph for accurate reference counting, export analysis,
 * and type information including interface implementations.
 */
export class ImportanceRanker {
  private project;
  private options: Required<Omit<ImportanceRankerOptions, 'tsConfigPath'>> & { tsConfigPath?: string };

  /**
   * Create a new ImportanceRanker instance.
   *
   * @param options - Ranking options
   */
  constructor(options: ImportanceRankerOptions = {}) {
    this.options = {
      entryPoints: options.entryPoints ?? [],
      tsConfigPath: options.tsConfigPath,
      referenceWeight: options.referenceWeight ?? 2,
      exportWeight: options.exportWeight ?? 1,
      entryWeight: options.entryWeight ?? 1,
      classWeight: options.classWeight ?? 0.5,
      implementationWeight: options.implementationWeight ?? 0.3,
      inheritanceWeight: options.inheritanceWeight ?? 0.2,
    };

    this.project = this.options.tsConfigPath
      ? createProject(this.options.tsConfigPath)
      : getProject();
  }

  /**
   * Rank all symbols by importance.
   *
   * Score formula considers:
   * - Reference count (how many files reference this symbol)
   * - Export status (exported symbols are more important)
   * - Entry point membership (symbols in entry files are more important)
   * - Symbol kind (classes get bonus)
   * - Interface implementations (more implementations = more important)
   * - Inheritance depth (deeper inheritance = more important)
   *
   * @param sourceFiles - Optional array of source files to analyze
   * @returns Array of SymbolImportance sorted by score descending
   */
  rank(sourceFiles?: SourceFile[]): SymbolImportance[] {
    const files = sourceFiles ?? this.project.getSourceFiles();
    const results: SymbolImportance[] = [];

    for (const sourceFile of files) {
      const filePath = path.normalize(sourceFile.getFilePath());
      const isEntry = this.isEntryPointFile(filePath);

      // Get all exported declarations
      const exportedDecls = sourceFile.getExportedDeclarations();
      const exportedNames = new Set<string>();
      for (const key of exportedDecls.keys()) {
        exportedNames.add(key as string);
      }

      // Analyze functions
      for (const func of sourceFile.getFunctions()) {
        const symbol = this.analyzeFunction(func, filePath, isEntry, exportedNames);
        if (symbol) results.push(symbol);
      }

      // Analyze classes
      for (const cls of sourceFile.getClasses()) {
        const symbol = this.analyzeClass(cls, filePath, isEntry, exportedNames);
        if (symbol) results.push(symbol);
      }

      // Analyze interfaces
      for (const iface of sourceFile.getInterfaces()) {
        const symbol = this.analyzeInterface(iface, filePath, isEntry, exportedNames);
        if (symbol) results.push(symbol);
      }

      // Analyze type aliases
      for (const typeAlias of sourceFile.getTypeAliases()) {
        const symbol = this.analyzeTypeAlias(typeAlias, filePath, isEntry, exportedNames);
        if (symbol) results.push(symbol);
      }

      // Analyze enums
      for (const enm of sourceFile.getEnums()) {
        const symbol = this.analyzeEnum(enm, filePath, isEntry, exportedNames);
        if (symbol) results.push(symbol);
      }

      // Analyze variables
      for (const variable of sourceFile.getVariableDeclarations()) {
        const symbol = this.analyzeVariable(variable, filePath, isEntry, exportedNames);
        if (symbol) results.push(symbol);
      }
    }

    // Sort by score descending, then by reference count descending
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.referenceCount - a.referenceCount;
    });

    return results;
  }

  /**
   * Get ranked symbols as a map for easy lookup.
   *
   * @param sourceFiles - Optional array of source files to analyze
   * @returns Map of symbol name to SymbolImportance
   */
  getRankedSymbols(sourceFiles?: SourceFile[]): Map<string, SymbolImportance> {
    const ranked = this.rank(sourceFiles);
    const map = new Map<string, SymbolImportance>();

    for (const item of ranked) {
      const key = `${item.symbol.filePath}#${item.symbol.name}`;
      map.set(key, item);
      map.set(item.symbol.name, item); // Also index by simple name
    }

    return map;
  }

  /**
   * Check if a file path matches an entry point pattern.
   */
  private isEntryPointFile(filePath: string): boolean {
    const basename = path.basename(filePath);

    // Check against explicit entry points
    for (const ep of this.options.entryPoints) {
      if (basename === ep || filePath.endsWith(path.sep + ep)) {
        return true;
      }
    }

    // Check against default patterns
    for (const pattern of DEFAULT_ENTRY_PATTERNS) {
      if (basename === pattern) {
        return true;
      }
    }

    return false;
  }

  /**
   * Count references to a symbol name across all source files.
   * Uses identifier matching for counting.
   */
  private countReferences(symbolName: string): number {
    const uniqueFiles = new Set<string>();
    const sourceFiles = this.project.getSourceFiles();

    for (const sourceFile of sourceFiles) {
      // Search for identifiers matching the symbol name
      const identifiers = sourceFile.getDescendantsOfKind(79); // SyntaxKind.Identifier
      for (const id of identifiers) {
        if (id.getText() === symbolName) {
          uniqueFiles.add(path.normalize(sourceFile.getFilePath()));
          break; // Found at least one reference in this file
        }
      }
    }

    return uniqueFiles.size;
  }

  /**
   * Calculate inheritance depth for a class.
   */
  private calculateInheritanceDepth(cls: ClassDeclaration): number {
    let depth = 0;
    let current: ClassDeclaration | undefined = cls;

    while (current) {
      const baseClass = current.getBaseClass();
      if (!baseClass) break;
      depth++;
      current = baseClass;
    }

    return depth;
  }

  /**
   * Count implementations of an interface.
   */
  private countImplementations(iface: InterfaceDeclaration): number {
    const implementations = iface.getImplementations();
    return implementations.length;
  }

  /**
   * Calculate the importance score for a symbol.
   */
  private calculateScore(
    referenceCount: number,
    isExported: boolean,
    isEntry: boolean,
    kind: SymbolKind,
    implementationCount: number,
    inheritanceDepth: number
  ): number {
    return (
      referenceCount * this.options.referenceWeight +
      (isExported ? this.options.exportWeight : 0) +
      (isEntry ? this.options.entryWeight : 0) +
      (kind === 'class' ? this.options.classWeight : 0) +
      implementationCount * this.options.implementationWeight +
      inheritanceDepth * this.options.inheritanceWeight
    );
  }

  // Analysis methods for different symbol kinds
  private analyzeFunction(func: FunctionDeclaration, filePath: string, isEntry: boolean, exportedNames: Set<string>): SymbolImportance | null {
    const name = func.getName();
    if (!name) return null;

    const referenceCount = this.countReferences(name);
    const isExported = exportedNames.has(name) || func.isExported();
    const startLine = func.getStartLineNumber();
    const endLine = func.getEndLineNumber();

    const codeSymbol: CodeSymbol = {
      name,
      kind: 'function',
      filePath,
      startLine,
      endLine,
    };

    return {
      symbol: codeSymbol,
      score: this.calculateScore(referenceCount, isExported, isEntry, 'function', 0, 0),
      referenceCount,
      isExported,
      isEntry,
      implementationCount: 0,
      inheritanceDepth: 0,
    };
  }

  private analyzeClass(cls: ClassDeclaration, filePath: string, isEntry: boolean, exportedNames: Set<string>): SymbolImportance | null {
    const name = cls.getName();
    if (!name) return null;

    const referenceCount = this.countReferences(name);
    const isExported = exportedNames.has(name) || cls.isExported();
    const startLine = cls.getStartLineNumber();
    const endLine = cls.getEndLineNumber();
    const inheritanceDepth = this.calculateInheritanceDepth(cls);

    const codeSymbol: CodeSymbol = {
      name,
      kind: 'class',
      filePath,
      startLine,
      endLine,
    };

    return {
      symbol: codeSymbol,
      score: this.calculateScore(referenceCount, isExported, isEntry, 'class', 0, inheritanceDepth),
      referenceCount,
      isExported,
      isEntry,
      implementationCount: 0,
      inheritanceDepth,
    };
  }

  private analyzeInterface(iface: InterfaceDeclaration, filePath: string, isEntry: boolean, exportedNames: Set<string>): SymbolImportance | null {
    const name = iface.getName();
    if (!name) return null;

    const referenceCount = this.countReferences(name);
    const isExported = exportedNames.has(name) || iface.isExported();
    const startLine = iface.getStartLineNumber();
    const endLine = iface.getEndLineNumber();
    const implementationCount = this.countImplementations(iface);

    const codeSymbol: CodeSymbol = {
      name,
      kind: 'interface',
      filePath,
      startLine,
      endLine,
    };

    return {
      symbol: codeSymbol,
      score: this.calculateScore(referenceCount, isExported, isEntry, 'interface', implementationCount, 0),
      referenceCount,
      isExported,
      isEntry,
      implementationCount,
      inheritanceDepth: 0,
    };
  }

  private analyzeTypeAlias(typeAlias: TypeAliasDeclaration, filePath: string, isEntry: boolean, exportedNames: Set<string>): SymbolImportance | null {
    const name = typeAlias.getName();
    if (!name) return null;

    const referenceCount = this.countReferences(name);
    const isExported = exportedNames.has(name) || typeAlias.isExported();
    const startLine = typeAlias.getStartLineNumber();
    const endLine = typeAlias.getEndLineNumber();

    const codeSymbol: CodeSymbol = {
      name,
      kind: 'type',
      filePath,
      startLine,
      endLine,
    };

    return {
      symbol: codeSymbol,
      score: this.calculateScore(referenceCount, isExported, isEntry, 'type', 0, 0),
      referenceCount,
      isExported,
      isEntry,
      implementationCount: 0,
      inheritanceDepth: 0,
    };
  }

  private analyzeEnum(enm: EnumDeclaration, filePath: string, isEntry: boolean, exportedNames: Set<string>): SymbolImportance | null {
    const name = enm.getName();
    if (!name) return null;

    const referenceCount = this.countReferences(name);
    const isExported = exportedNames.has(name) || enm.isExported();
    const startLine = enm.getStartLineNumber();
    const endLine = enm.getEndLineNumber();

    const codeSymbol: CodeSymbol = {
      name,
      kind: 'enum',
      filePath,
      startLine,
      endLine,
    };

    return {
      symbol: codeSymbol,
      score: this.calculateScore(referenceCount, isExported, isEntry, 'enum', 0, 0),
      referenceCount,
      isExported,
      isEntry,
      implementationCount: 0,
      inheritanceDepth: 0,
    };
  }

  private analyzeVariable(variable: VariableDeclaration, filePath: string, isEntry: boolean, exportedNames: Set<string>): SymbolImportance | null {
    const name = variable.getName();
    if (!name) return null;

    const referenceCount = this.countReferences(name);
    const isExported = exportedNames.has(name) || variable.isExported();
    const startLine = variable.getStartLineNumber();
    const endLine = variable.getEndLineNumber();

    const codeSymbol: CodeSymbol = {
      name,
      kind: 'variable',
      filePath,
      startLine,
      endLine,
    };

    return {
      symbol: codeSymbol,
      score: this.calculateScore(referenceCount, isExported, isEntry, 'variable', 0, 0),
      referenceCount,
      isExported,
      isEntry,
      implementationCount: 0,
      inheritanceDepth: 0,
    };
  }
}

/**
 * Rank all symbols by importance.
 *
 * Convenience function that creates an ImportanceRanker instance.
 *
 * @param allSymbols - Map of file path to extracted symbols (for backward compatibility)
 * @param graph - The dependency graph (for backward compatibility)
 * @param entryPoints - Optional explicit entry point file paths
 * @param allSources - Optional map of file path to source code (for backward compatibility)
 * @param options - Additional ranking options
 * @returns Array of SymbolImportance sorted by score descending
 */
export function rankSymbols(
  allSymbols?: Map<string, CodeSymbol[]>,
  graph?: DependencyGraph,
  entryPoints?: string[],
  allSources?: Map<string, string>,
  options?: Omit<ImportanceRankerOptions, 'entryPoints'>
): SymbolImportance[] {
  const ranker = new ImportanceRanker({
    entryPoints,
    ...options,
  });

  return ranker.rank();
}

/**
 * Get ranked symbols as a map.
 *
 * @param options - Ranking options
 * @returns Map of symbol name to SymbolImportance
 */
export function getRankedSymbols(
  options?: ImportanceRankerOptions
): Map<string, SymbolImportance> {
  const ranker = new ImportanceRanker(options);
  return ranker.getRankedSymbols();
}

// Types are already exported as interfaces above
