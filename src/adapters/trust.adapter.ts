import { TrustService } from '../domain/trust/trust.service.js';
import type { ITrustPort } from '../ports/trust.port.js';

/**
 * Thin adapter that conforms the static {@link TrustService} API to the
 * {@link ITrustPort} instance interface. Production code goes through
 * `createAdapters()`, which wires a fresh instance of this adapter
 * into {@link ShellExecutor}. Tests can pass a stub instead.
 */
export class TrustServiceAdapter implements ITrustPort {
  evaluate(input: { output: string; context?: string }): ReturnType<typeof TrustService.evaluate> {
    let ctx: { intent?: string; toolUsed?: string } | undefined;
    if (input.context) {
      try {
        const parsed = JSON.parse(input.context) as { intent?: string; toolUsed?: string };
        ctx = { intent: parsed.intent, toolUsed: parsed.toolUsed };
      } catch {
        // context is opaque free-form; TrustService ignores it for the
        // most part, so swallow the parse error and run detection
        // against `output` alone.
        ctx = undefined;
      }
    }
    return TrustService.evaluate(input.output, ctx);
  }

  detectIssues(output: string, context?: string): ReturnType<typeof TrustService.detectIssues> {
    let ctx: { intent?: string; toolUsed?: string } | undefined;
    if (context) {
      try {
        const parsed = JSON.parse(context) as { intent?: string; toolUsed?: string };
        ctx = { intent: parsed.intent, toolUsed: parsed.toolUsed };
      } catch {
        ctx = undefined;
      }
    }
    return TrustService.detectIssues(output, ctx);
  }
}
