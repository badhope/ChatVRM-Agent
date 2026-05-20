/**
 * Search/Replace module exports
 */

export {
  parseSearchReplaceBlocks,
  parseAiderFormat,
  parseLegacyFormat,
  type SearchReplaceBlock,
} from './parser.js';

export {
  normalizeWhitespace,
  stripBlankLines,
  detectIndentation,
  removeCommonIndent,
  normalizeContent,
} from './normalizer.js';

export {
  executeSearchReplace,
  executeMultipleSearchReplace,
  type SearchReplaceResult,
} from '../search-replace.js';
