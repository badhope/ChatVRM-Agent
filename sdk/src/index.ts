/**
 * @devflow/sdk - DevFlow Agent SDK
 *
 * Programmatic API for using DevFlow Agent in other applications.
 *
 * @example
 * ```typescript
 * import { runAgent, parseFile, generateRepoMap, DevFlowError } from '@devflow/sdk';
 *
 * // Run agent
 * const result = await runAgent('Add error handling to the auth module');
 * console.log(result.output);
 *
 * // Parse a file
 * const parsed = await parseFile('./src/auth.ts');
 * console.log(parsed.symbols);
 *
 * // Generate repo map
 * const map = await generateRepoMap('./src');
 * console.log(map);
 *
 * // Handle errors
 * try {
 *   await runAgent('Do something');
 * } catch (error) {
 *   if (error instanceof DevFlowError) {
 *     console.error(`[${error.code}] ${error.message}`);
 *   }
 * }
 * ```
 */

// Re-export all modules
export * from './agent.js';
export * from './parser.js';
export * from './editor.js';
export * from './plugins.js';
export * from './types.js';
export * from './errors.js';
