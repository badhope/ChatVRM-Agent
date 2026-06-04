/**
 * Observability port.
 *
 * The agent emits traces/spans/generations to an {@link IObservability}
 * sink. We don't want to bake a hard dependency on Langfuse, so the
 * port is the smallest set of primitives the LLM app actually uses:
 *
 *   - trace:        a top-level unit of work (a request, a job, ...)
 *   - span:         a timed sub-step inside a trace
 *   - generation:   an LLM call (model, prompt, completion, usage)
 *   - event:        an instantaneous observation
 *   - score:        a feedback value attached to a trace
 *
 * Two implementations:
 *   - {@link NoopObservability}: default, zero overhead
 *   - {@link LangfuseClient}:     real Langfuse ingestion API (v2)
 *
 * Both implement the same interface so swapping is one constructor call.
 */

export interface TraceContext {
  traceId: string;
}

export interface SpanContext extends TraceContext {
  spanId: string;
}

export type ObservationLevel = 'debug' | 'default' | 'warning' | 'error';

export interface IObservation {
  /** End the observation, flushing its payload. */
  end(opts?: { output?: unknown; level?: ObservationLevel; statusMessage?: string }): Promise<void>;
  /** Add a key-value to the observation's metadata. */
  setMetadata(key: string, value: unknown): IObservation;
  /** Set a single field on the observation's input. */
  setInput(input: unknown): IObservation;
  /** Set a single field on the observation's output (also via end()). */
  setOutput(output: unknown): IObservation;
  /** Tag / user / session passthrough. */
  setTags(tags: Record<string, string>): IObservation;
  /** Spawn a child span. */
  span(name: string, opts?: { input?: unknown; metadata?: Record<string, unknown> }): Promise<IObservation>;
  /** Spawn a child generation. */
  generation(
    name: string,
    opts?: {
      model?: string;
      input?: unknown;
      metadata?: Record<string, unknown>;
      modelParameters?: Record<string, unknown>;
    },
  ): Promise<IObservation>;
  /** Spawn a child event. */
  event(
    name: string,
    opts?: { input?: unknown; metadata?: Record<string, unknown>; level?: ObservationLevel },
  ): IObservation;
  /** Attach a numeric / categorical score. */
  score(opts: { name: string; value: number; comment?: string }): Promise<void>;
}

export interface IObservability {
  readonly name: string;
  /** Start a new top-level trace. */
  trace(
    name: string,
    opts?: {
      input?: unknown;
      metadata?: Record<string, unknown>;
      userId?: string;
      sessionId?: string;
      tags?: string[];
    },
  ): Promise<IObservation>;
  /** Flush any pending observations. */
  flush(): Promise<void>;
  /** Shut down and flush. */
  shutdown(): Promise<void>;
}
