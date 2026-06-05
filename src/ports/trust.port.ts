// Trust port.
//
// The trust service lives in `src/domain/trust/trust.service.ts`. This
// file is a thin re-export of the canonical types so the rest of the
// codebase can depend on the port without pulling in the implementation
// module. The previous version of this file defined its own
// `TrustLevel` with mismatched members, which silently diverged from
// the service and produced dead code — the re-export keeps the two
// in lockstep.

export type { TrustLevel, TrustIssue, TrustVerdict } from '../domain/trust/trust.service.js';
import { TrustService } from '../domain/trust/trust.service.js';

/**
 * The trust-evaluation contract. Concrete production wiring uses
 * {@link TrustService}; tests can substitute a stub. The two `evaluate`
 * arguments are the LLM output under review and an optional context
 * blob (tool result, prior turns, etc.).
 */
export interface ITrustPort {
  evaluate(input: { output: string; context?: string }): ReturnType<typeof TrustService.evaluate>;
  detectIssues(output: string, context?: string): ReturnType<typeof TrustService.detectIssues>;
}