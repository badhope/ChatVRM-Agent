/**
 * ts-morph Project Singleton
 *
 * Provides a cached Project instance for efficient TypeScript analysis.
 * Uses ts-morph for accurate type information and module resolution.
 */

import { Project, type ProjectOptions } from 'ts-morph';
import * as path from 'path';
import * as fs from 'fs';
import { access } from 'fs/promises';

/** Cached project instance */
let cachedProject: Project | null = null;

/** Default project options */
const defaultOptions: ProjectOptions = {
  skipAddingFilesFromTsConfig: false,
  skipFileDependencyResolution: false,
};

/**
 * Check if a file exists asynchronously.
 *
 * @param filePath - Path to check
 * @returns Promise that resolves to true if file exists
 */
async function fileExistsAsync(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find the nearest tsconfig.json file starting from the given directory (async version).
 *
 * @param startDir - Directory to start searching from
 * @returns Path to tsconfig.json or undefined if not found
 */
async function findTsConfigAsync(startDir: string): Promise<string | undefined> {
  let currentDir = startDir;

  while (currentDir !== path.dirname(currentDir)) {
    const tsConfigPath = path.join(currentDir, 'tsconfig.json');
    if (await fileExistsAsync(tsConfigPath)) {
      return tsConfigPath;
    }
    currentDir = path.dirname(currentDir);
  }

  return undefined;
}

/**
 * Find the nearest tsconfig.json file starting from the given directory (sync version).
 *
 * @param startDir - Directory to start searching from
 * @returns Path to tsconfig.json or undefined if not found
 */
function findTsConfigSync(startDir: string): string | undefined {
  let currentDir = startDir;

  while (currentDir !== path.dirname(currentDir)) {
    const tsConfigPath = path.join(currentDir, 'tsconfig.json');
    try {
      fs.accessSync(tsConfigPath);
      return tsConfigPath;
    } catch {
      // File does not exist, continue searching
    }
    currentDir = path.dirname(currentDir);
  }

  return undefined;
}

/**
 * Get or create a cached ts-morph Project instance.
 *
 * If no project exists, creates one using the nearest tsconfig.json
 * or an in-memory project if no tsconfig is found.
 *
 * @returns The cached Project instance
 */
export function getProject(): Project {
  if (cachedProject) {
    return cachedProject;
  }

  // Try to find and use tsconfig.json
  const tsConfigPath = findTsConfigSync(process.cwd());

  if (tsConfigPath) {
    cachedProject = new Project({
      ...defaultOptions,
      tsConfigFilePath: tsConfigPath,
    });
  } else {
    // Create an in-memory project
    cachedProject = new Project({
      ...defaultOptions,
      compilerOptions: {
        target: 2, // ES2015
        module: 1, // CommonJS
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
      },
    });
  }

  return cachedProject;
}

/**
 * Get or create a cached ts-morph Project instance (async version).
 *
 * If no project exists, creates one using the nearest tsconfig.json
 * or an in-memory project if no tsconfig is found.
 *
 * @returns Promise resolving to the cached Project instance
 */
export async function getProjectAsync(): Promise<Project> {
  if (cachedProject) {
    return cachedProject;
  }

  // Try to find and use tsconfig.json
  const tsConfigPath = await findTsConfigAsync(process.cwd());

  if (tsConfigPath) {
    cachedProject = new Project({
      ...defaultOptions,
      tsConfigFilePath: tsConfigPath,
    });
  } else {
    // Create an in-memory project
    cachedProject = new Project({
      ...defaultOptions,
      compilerOptions: {
        target: 2, // ES2015
        module: 1, // CommonJS
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
      },
    });
  }

  return cachedProject;
}

/**
 * Create a new ts-morph Project instance.
 *
 * This does not use the cache and always creates a fresh project.
 * Useful for analyzing different projects or when the cache needs to be bypassed.
 *
 * @param tsConfigPath - Optional path to tsconfig.json
 * @param options - Additional project options
 * @returns A new Project instance
 */
export function createProject(
  tsConfigPath?: string,
  options?: Partial<ProjectOptions>
): Project {
  const projectOptions: ProjectOptions = {
    ...defaultOptions,
    ...options,
  };

  if (tsConfigPath) {
    projectOptions.tsConfigFilePath = tsConfigPath;
  }

  return new Project(projectOptions);
}

/**
 * Reset the cached project instance.
 *
 * Call this when you need to reload the project with different files
 * or after significant file system changes.
 */
export function resetProject(): void {
  cachedProject = null;
}

/**
 * Add source files to the project from a directory.
 *
 * @param project - The ts-morph Project
 * @param rootDir - Root directory to search for files
 * @param patterns - Glob patterns for file matching
 */
export function addSourceFiles(
  project: Project,
  rootDir: string,
  patterns: string[] = ['**/*.ts', '**/*.tsx']
): void {
  for (const pattern of patterns) {
    const globPattern = path.join(rootDir, pattern);
    project.addSourceFilesAtPaths(globPattern);
  }
}

/**
 * Get the file path from a ts-morph source file, normalized for cross-platform compatibility.
 *
 * @param filePath - The file path to normalize
 * @returns Normalized absolute path
 */
export function normalizeFilePath(filePath: string): string {
  return path.normalize(filePath);
}
