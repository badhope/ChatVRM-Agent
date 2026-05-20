/**
 * File Dependency Graph Builder
 *
 * Builds a file dependency graph using ts-morph for accurate TypeScript
 * import/export analysis with proper module resolution.
 */

import * as path from 'path';
import type { SourceFile } from 'ts-morph';
import { getProject, createProject } from './ts-morph-project.js';

/** Dependency information for a single file */
export interface FileDependency {
  /** Absolute file path */
  filePath: string;
  /** Imported module paths (resolved to absolute) */
  imports: string[];
  /** Files that import this file */
  importedBy: string[];
  /** Exported symbol names */
  exports: string[];
}

/** A node in the dependency graph */
export interface DependencyNode {
  /** File path */
  filePath: string;
  /** Direct dependencies (files this node imports) */
  dependencies: string[];
}

/** An edge in the dependency graph */
export interface DependencyEdge {
  /** Source file path */
  from: string;
  /** Target file path */
  to: string;
}

/**
 * The full dependency graph across all analyzed files
 *
 * This class provides methods to analyze dependencies, find cycles,
 * and get connected components in the dependency graph.
 */
export class DependencyGraph {
  /** Map of absolute file path to its dependency info */
  files: Map<string, FileDependency> = new Map();

  /**
   * Build the dependency graph from source files.
   *
   * @param sourceFiles - Array of ts-morph SourceFile objects
   * @returns This DependencyGraph instance for chaining
   */
  build(sourceFiles: SourceFile[]): this {
    // Initialize all files
    for (const sourceFile of sourceFiles) {
      const filePath = path.normalize(sourceFile.getFilePath());
      this.files.set(filePath, {
        filePath,
        imports: [],
        importedBy: [],
        exports: [],
      });
    }

    // Extract imports and exports from each file
    for (const sourceFile of sourceFiles) {
      const filePath = path.normalize(sourceFile.getFilePath());
      const dep = this.files.get(filePath);
      if (!dep) continue;

      // Extract imports using ts-morph
      this.extractImports(sourceFile, dep);

      // Extract exports using ts-morph
      this.extractExports(sourceFile, dep);
    }

    // Build reverse dependencies (importedBy)
    for (const [filePath, dep] of this.files) {
      for (const importedPath of dep.imports) {
        const importedDep = this.files.get(importedPath);
        if (importedDep && !importedDep.importedBy.includes(filePath)) {
          importedDep.importedBy.push(filePath);
        }
      }
    }

    return this;
  }

  /**
   * Extract imports from a source file using ts-morph.
   *
   * @param sourceFile - The ts-morph SourceFile
   * @param dep - The FileDependency to populate
   */
  private extractImports(sourceFile: SourceFile, dep: FileDependency): void {
    const importDeclarations = sourceFile.getImportDeclarations();

    for (const importDecl of importDeclarations) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      if (!moduleSpecifier) continue;

      // Skip non-relative imports (node_modules, bare specifiers)
      if (!moduleSpecifier.startsWith('.')) continue;

      // Use ts-morph's module resolution
      const resolvedSourceFile = importDecl.getModuleSpecifierSourceFile();
      if (resolvedSourceFile) {
        const resolvedPath = path.normalize(resolvedSourceFile.getFilePath());
        if (this.files.has(resolvedPath) && !dep.imports.includes(resolvedPath)) {
          dep.imports.push(resolvedPath);
        }
      }
    }
  }

  /**
   * Extract exports from a source file using ts-morph.
   *
   * @param sourceFile - The ts-morph SourceFile
   * @param dep - The FileDependency to populate
   */
  private extractExports(sourceFile: SourceFile, dep: FileDependency): void {
    // Named exports: export { foo, bar }
    const exportDeclarations = sourceFile.getExportDeclarations();
    for (const exportDecl of exportDeclarations) {
      const namedExports = exportDecl.getNamedExports();
      for (const namedExport of namedExports) {
        const name = namedExport.getName();
        if (name && !dep.exports.includes(name)) {
          dep.exports.push(name);
        }
      }
    }

    // Default export
    const defaultExportSymbol = sourceFile.getDefaultExportSymbol();
    if (defaultExportSymbol && !dep.exports.includes('default')) {
      dep.exports.push('default');
    }

    // Exported declarations (export function, export class, etc.)
    const exportedDecls = sourceFile.getExportedDeclarations();
    for (const [name, declarations] of exportedDecls) {
      if (name && !dep.exports.includes(name)) {
        dep.exports.push(name);
      }
    }
  }

  /**
   * Get files that depend on the given file (files that import it).
   *
   * @param filePath - Absolute file path
   * @returns Array of file paths that import the given file
   */
  getDependents(filePath: string): string[] {
    const dep = this.files.get(path.normalize(filePath));
    return dep ? [...dep.importedBy] : [];
  }

  /**
   * Get files that the given file depends on (files it imports).
   *
   * @param filePath - Absolute file path
   * @returns Array of file paths that the given file imports
   */
  getDependencies(filePath: string): string[] {
    const dep = this.files.get(path.normalize(filePath));
    return dep ? [...dep.imports] : [];
  }

  /**
   * Get all dependency cycles in the graph.
   *
   * @returns Array of cycles, where each cycle is an array of file paths
   */
  getCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (node: string, path: string[]): void => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const dep = this.files.get(node);
      if (dep) {
        for (const importPath of dep.imports) {
          if (recursionStack.has(importPath)) {
            // Found a cycle
            const cycleStart = path.indexOf(importPath);
            if (cycleStart !== -1) {
              const cycle = path.slice(cycleStart);
              cycles.push(cycle);
            }
          } else if (!visited.has(importPath)) {
            dfs(importPath, [...path]);
          }
        }
      }

      recursionStack.delete(node);
    };

    for (const filePath of this.files.keys()) {
      if (!visited.has(filePath)) {
        dfs(filePath, []);
      }
    }

    return cycles;
  }

  /**
   * Get all connected components in the dependency graph.
   *
   * A connected component is a set of files that are transitively
   * connected through import relationships.
   *
   * @returns Array of connected components, each being an array of file paths
   */
  getConnectedComponents(): string[][] {
    const visited = new Set<string>();
    const components: string[][] = [];

    const bfs = (start: string): string[] => {
      const component: string[] = [];
      const queue: string[] = [start];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        component.push(current);

        const dep = this.files.get(current);
        if (!dep) continue;

        // Add all imports and importers
        for (const imp of dep.imports) {
          if (!visited.has(imp)) queue.push(imp);
        }
        for (const importer of dep.importedBy) {
          if (!visited.has(importer)) queue.push(importer);
        }
      }

      return component;
    };

    for (const filePath of this.files.keys()) {
      if (!visited.has(filePath)) {
        const component = bfs(filePath);
        if (component.length > 0) {
          components.push(component);
        }
      }
    }

    return components;
  }

  /**
   * Get all files transitively connected to the given file.
   *
   * @param filePath - Absolute file path
   * @returns Array of all connected file paths
   */
  getConnectedComponent(filePath: string): string[] {
    const normalizedPath = path.normalize(filePath);
    const visited = new Set<string>();
    const queue: string[] = [normalizedPath];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const dep = this.files.get(current);
      if (!dep) continue;

      // Add all imports and importers
      for (const imp of dep.imports) {
        if (!visited.has(imp)) queue.push(imp);
      }
      for (const importer of dep.importedBy) {
        if (!visited.has(importer)) queue.push(importer);
      }
    }

    return Array.from(visited);
  }

  /**
   * Get all nodes in the graph.
   *
   * @returns Array of DependencyNode objects
   */
  getNodes(): DependencyNode[] {
    const nodes: DependencyNode[] = [];
    for (const [filePath, dep] of this.files) {
      nodes.push({
        filePath,
        dependencies: [...dep.imports],
      });
    }
    return nodes;
  }

  /**
   * Get all edges in the graph.
   *
   * @returns Array of DependencyEdge objects
   */
  getEdges(): DependencyEdge[] {
    const edges: DependencyEdge[] = [];
    for (const [filePath, dep] of this.files) {
      for (const importPath of dep.imports) {
        edges.push({
          from: filePath,
          to: importPath,
        });
      }
    }
    return edges;
  }
}

/**
 * Build a dependency graph from TypeScript source files.
 *
 * Uses ts-morph for accurate import/export detection and module resolution.
 *
 * @param filePaths - Absolute paths of TypeScript files to analyze
 * @param tsConfigPath - Optional path to tsconfig.json
 * @returns A DependencyGraph instance
 */
export function buildDependencyGraph(
  filePaths: string[],
  tsConfigPath?: string
): DependencyGraph {
  // Create or get project
  const project = tsConfigPath
    ? createProject(tsConfigPath)
    : getProject();

  // Add files to project
  for (const filePath of filePaths) {
    try {
      project.addSourceFileAtPath(filePath);
    } catch {
      // File might already be in project or not exist
    }
  }

  // Get source files that exist in the project
  const sourceFiles = project.getSourceFiles().filter(sf =>
    filePaths.some(fp => path.normalize(fp) === path.normalize(sf.getFilePath()))
  );

  return new DependencyGraph().build(sourceFiles);
}

// FileDependency is already exported as an interface above
