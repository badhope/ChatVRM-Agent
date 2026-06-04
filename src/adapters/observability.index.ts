/**
 * Observability: traces, spans, generations, events, scores.
 *
 * The default {@link NoopObservability} is zero-cost and works in
 * tests. In production wire in {@link LangfuseClient} (or write your
 * own {@link IObservability} adapter — e.g. OpenTelemetry, Honeycomb,
 * Datadog) and pass it into your agent.
 */

export { NoopObservability, NoopObservation } from './observability.noop.js';
export type { NoopObservationOptions, CapturedRecord } from './observability.noop.js';
export { LangfuseClient } from './observability.langfuse.js';
export type { LangfuseClientOptions } from './observability.langfuse.js';
