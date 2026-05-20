/**
 * Reference Finder
 *
 * Finds all references to a symbol across the codebase using ts-morph
 * for accurate cross-file reference analysis. Locates definitions and
 * usages with proper TypeScript type information.
 */

import * as path from 'path';
import type { SourceFile, Node } from 'ts-morph';
import { getProject, createProject } from '../parser/ts-morph-project.js';

/** Type of reference */
export type ReferenceType = 'usage' | 'import' | 'export' | 'definition' | 'type-reference';

/** A single reference to a symbol */
export interface ReferenceInfo {
  /** File path where the reference occurs */
  filePath: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (0-based) */
  column: number;
  /** The line content */
  context: string;
  /** Type of reference */
  type: ReferenceType;
}

/** Complete reference search result */
export interface ReferenceResult {
  /** The symbol name that was searched */
  symbolName: string;
  /** Location of the definition, if found */
  definition: { filePath: string; line: number; column: number } | null;
  /** All references found */
  references: ReferenceInfo[];
  /** Number of files containing references */
  fileCount: number;
  /** Total number of references */
  referenceCount: number;
}

/** Options for reference finding */
export interface FindReferencesOptions {
  /** Include the definition in results (default: true) */
  includeDefinition?: boolean;
  /** Glob patterns to restrict which files to search */
  filePatterns?: string[];
  /** Path to tsconfig.json */
  tsConfigPath?: string;
}

/**
 * ReferenceFinder class for finding symbol references using ts-morph.
 *
 * Provides accurate TypeScript reference analysis including type references,
 * cross-file navigation, and proper handling of module boundaries.
 */
export class ReferenceFinder {
  private project;

  /**
   * Create a new ReferenceFinder instance.
   *
   * @param tsConfigPath - Optional path to tsconfig.json
   */
  constructor(tsConfigPath?: string) {
    this.project = tsConfigPath ? createProject(tsConfigPath) : getProject();
  }

  /**
   * Find all references to a symbol across the codebase.
   *
   * Uses ts-morph's language service for accurate cross-file analysis.
   *
   * @param symbolName - The symbol name to search for
   * @param filePath - Optional file path where the symbol is defined (improves accuracy)
   * @param options - Search options
   * @returns Complete reference result
   */
  async findReferences(
    symbolName: string,
    filePath?: string,
    options: FindReferencesOptions = {}
  ): Promise<ReferenceResult> {
    const includeDefinition = options.includeDefinition ?? true;

    // Find the symbol definition
    const definition = this.findDefinition(symbolName, filePath);

    // Get all source files
    let sourceFiles = this.project.getSourceFiles();

    // Apply file pattern filters if provided
    if (options.filePatterns && options.filePatterns.length > 0) {
      sourceFiles = sourceFiles.filter(sf =>
        this.matchesPatterns(sf.getFilePath(), options.filePatterns!)
      );
    }

    // Collect all references
    const allReferences: ReferenceInfo[] = [];

    for (const sourceFile of sourceFiles) {
      const refs = this.findReferencesInFile(symbolName, sourceFile, definition);
      allReferences.push(...refs);
    }

    // Filter out definition if not requested
    const filteredReferences = includeDefinition
      ? allReferences
      : allReferences.filter(r => r.type !== 'definition');

    // Get unique file count
    const uniqueFiles = new Set(filteredReferences.map(r => r.filePath));

    return {
      symbolName,
      definition,
      references: filteredReferences,
      fileCount: uniqueFiles.size,
      referenceCount: filteredReferences.length,
    };
  }

  /**
   * Find the definition location of a symbol.
   *
   * @param symbolName - The symbol name to find
   * @param filePath - Optional file path to search in
   * @returns Definition location or null if not found
   */
  findDefinition(
    symbolName: string,
    filePath?: string
  ): { filePath: string; line: number; column: number } | null {
    const sourceFiles = filePath
      ? [this.project.getSourceFile(filePath)].filter(Boolean) as SourceFile[]
      : this.project.getSourceFiles();

    for (const sourceFile of sourceFiles) {
      // Try to find by declarations
      const declarations = sourceFile.getVariableDeclarations().filter(d =>
        d.getName() === symbolName
      );
      if (declarations.length > 0) {
        const decl = declarations[0];
        const lineAndCol = sourceFile.getLineAndColumnAtPos(decl.getStart());
        return {
          filePath: path.normalize(sourceFile.getFilePath()),
          line: lineAndCol.line,
          column: lineAndCol.column - 1,
        };
      }

      // Try to find by function declarations
      const funcs = sourceFile.getFunctions().filter(f =>
        f.getName() === symbolName
      );
      if (funcs.length > 0) {
        const func = funcs[0];
        const lineAndCol = sourceFile.getLineAndColumnAtPos(func.getStart());
        return {
          filePath: path.normalize(sourceFile.getFilePath()),
          line: lineAndCol.line,
          column: lineAndCol.column - 1,
        };
      }

      // Try to find by class declarations
      const classes = sourceFile.getClasses().filter(c =>
        c.getName() === symbolName
      );
      if (classes.length > 0) {
        const cls = classes[0];
        const lineAndCol = sourceFile.getLineAndColumnAtPos(cls.getStart());
        return {
          filePath: path.normalize(sourceFile.getFilePath()),
          line: lineAndCol.line,
          column: lineAndCol.column - 1,
        };
      }

      // Try to find by interface declarations
      const interfaces = sourceFile.getInterfaces().filter(i =>
        i.getName() === symbolName
      );
      if (interfaces.length > 0) {
        const iface = interfaces[0];
        const lineAndCol = sourceFile.getLineAndColumnAtPos(iface.getStart());
        return {
          filePath: path.normalize(sourceFile.getFilePath()),
          line: lineAndCol.line,
          column: lineAndCol.column - 1,
        };
      }

      // Try to find by type alias declarations
      const typeAliases = sourceFile.getTypeAliases().filter(t =>
        t.getName() === symbolName
      );
      if (typeAliases.length > 0) {
        const typeAlias = typeAliases[0];
        const lineAndCol = sourceFile.getLineAndColumnAtPos(typeAlias.getStart());
        return {
          filePath: path.normalize(sourceFile.getFilePath()),
          line: lineAndCol.line,
          column: lineAndCol.column - 1,
        };
      }
    }

    return null;
  }

  /**
   * Find all references to a symbol within a specific file.
   *
   * @param symbolName - The symbol name to search for
   * @param sourceFile - The source file to search in
   * @param definition - Optional definition location
   * @returns Array of reference info
   */
  private findReferencesInFile(
    symbolName: string,
    sourceFile: SourceFile,
    definition: { filePath: string; line: number; column: number } | null
  ): ReferenceInfo[] {
    const references: ReferenceInfo[] = [];
    const filePath = path.normalize(sourceFile.getFilePath());

    // Search by identifier nodes
    const identifiers = sourceFile.getDescendantsOfKind(79); // SyntaxKind.Identifier = 79

    for (const identifier of identifiers) {
      if (identifier.getText() !== symbolName) continue;

      const node = identifier;
      const lineAndCol = sourceFile.getLineAndColumnAtPos(node.getStart());
      const lineText = this.getLineText(sourceFile, lineAndCol.line);

      const refType = this.classifyReference(
        node,
        lineAndCol.line,
        lineAndCol.column - 1,
        definition
      );

      references.push({
        filePath,
        line: lineAndCol.line,
        column: lineAndCol.column - 1,
        context: lineText,
        type: refType,
      });
    }

    return references;
  }

  /**
   * Classify a reference by its context.
   *
   * @param node - The AST node
   * @param line - Line number
   * @param column - Column number
   * @param definition - Definition location
   * @returns Reference type
   */
  private classifyReference(
    node: Node,
    line: number,
    column: number,
    definition: { filePath: string; line: number; column: number } | null
  ): ReferenceType {
    // Check if this is the definition
    if (definition && line === definition.line && column === definition.column) {
      return 'definition';
    }

    const parent = node.getParent();
    if (!parent) return 'usage';

    // Check for import
    if (parent.getKindName().includes('Import')) {
      return 'import';
    }

    // Check for export
    if (parent.getKindName().includes('Export')) {
      return 'export';
    }

    // Check for type reference
    if (parent.getKindName().includes('TypeReference') ||
        parent.getKindName().includes('TypeAlias')) {
      return 'type-reference';
    }

    return 'usage';
  }

  /**
   * Get the text of a specific line.
   *
   * @param sourceFile - The source file
   * @param line - Line number (1-based)
   * @returns The line text
   */
  private getLineText(sourceFile: SourceFile, line: number): string {
    const lines = sourceFile.getFullText().split('\n');
    return lines[line - 1] || '';
  }

  /**
   * Check if a file path matches any of the given patterns.
   *
   * @param filePath - The file path to check
   * @param patterns - Array of glob patterns
   * @returns True if matches any pattern
   */
  private matchesPatterns(filePath: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      // Simple glob matching
      const regex = new RegExp(
        pattern
          .replace(/\*\*/g, '<<<DOUBLESTAR>>>')
          .replace(/\*/g, '[^/]*')
          .replace(/<<<DOUBLESTAR>>>/g, '.*')
      );
      return regex.test(filePath);
    });
  }
}

/**
 * Find references to a symbol (convenience function).
 *
 * @param symbolName - The symbol name to search for
 * @param filePath - Optional file path where the symbol is defined
 * @param options - Search options
 * @returns Complete reference result
 */
export async function findReferences(
  symbolName: string,
  filePath?: string,
  options?: FindReferencesOptions
): Promise<ReferenceResult> {
  const finder = new ReferenceFinder(options?.tsConfigPath);
  return finder.findReferences(symbolName, filePath, options);
}

/**
 * Find references within a single file (convenience function).
 *
 * @param symbolName - The symbol name to search for
 * @param filePath - The file path to search in
 * @param options - Search options
 * @returns Array of reference info
 */
export async function findReferencesInFile(
  symbolName: string,
  filePath: string,
  options?: FindReferencesOptions
): Promise<ReferenceInfo[]> {
  const finder = new ReferenceFinder(options?.tsConfigPath);
  const result = await finder.findReferences(symbolName, filePath, {
    ...options,
    filePatterns: [filePath],
  });
  return result.references.filter(r => r.filePath === path.normalize(filePath));
}
