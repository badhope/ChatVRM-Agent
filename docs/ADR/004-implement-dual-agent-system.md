# 4. Implement a 6-stage agent pipeline

**Date:** 2024-05-28
**Updated:** 2026-06-03 (replaces the original "dual-agent
collaboration system" decision)

## Status

Accepted.

## Context

Tasks submitted to the agent are diverse:

- Pure questions ("Explain X")
- Single-file edits ("Refactor Y in this file")
- Multi-step work spanning many files ("Add feature Z to module W")
- Long-running exploration ("Audit the whole codebase for issue I")

We need a control flow that:

- Is fast for trivial tasks (a question should not pay for code
  analysis)
- Stays correct for multi-step work (each step must validate
  before the next runs)
- Surfaces intermediate state to the UI in real time
- Is testable as a sequence of pure functions

The original ADR-004 proposed a *dual-agent* system: a planning
agent that produces a plan, an execution agent that runs it, and a
collaboration manager that arbitrates between them. In practice this
turned out to be three LLM calls in a trench-coat, with all the
cost and none of the separation of concerns.

## Decision

We replace the dual-agent system with a **single linear pipeline
of six stages**. Each stage is a pure function
`(ctx) => Promise<ctx>` that receives a shared `PipelineContext`
and emits events on the event bus. The stages, in order:

| #  | Stage       | What it does                                              |
| -- | ----------- | --------------------------------------------------------- |
| 1  | `init`      | Allocate task ID, seed metadata, validate input           |
| 2  | `understand`| LLM intent classification + confidence score              |
| 3  | `plan`      | Produce a `PlanStep[]` with tool bindings                 |
| 4  | `execute`   | Run each step, call tools, collect outputs                |
| 5  | `validate`  | Type-check, lint, dry-run tools on changed files          |
| 6  | `reflect`   | LLM self-review, store reflection in memory               |

The pipeline engine in `src/core/pipeline.ts` walks the stage array
in order. A stage can short-circuit by setting
`ctx.shouldConfirm = true`, which halts the pipeline before
`execute` and asks the user to confirm the plan.

The XState chart in `src/machines/agent.machine.ts` is the
*specification* of the same flow; the Agent page in the web UI
uses it to render a live state diagram.

The `ShellExecutor` (`src/adapters/shell.adapter.ts`) is an
**adapter**, not a sub-agent — it is one of seven tools the
`execute` stage may invoke.

## Consequences

**Positive**

- One LLM call per stage (six in the worst case) instead of three
  for every step in the original design.
- Stages are independently testable; the test suite runs in under
  four seconds with zero network.
- A failing stage produces a precise error with a stage name; the
  CLI and SSE stream surface it to the user without a second LLM
  call to interpret it.
- Adding a new stage is a 30-line `*.stage.ts` file plus a single
  line in `stages/index.ts`. No arbitration logic to update.

**Negative**

- The pipeline is linear. Branching flows ("if the plan is empty,
  ask a clarifying question, then re-plan") are encoded as stage
  flags rather than as first-class transitions. We accept this in
  exchange for the simpler model.
- The `understand` and `plan` stages both call the LLM, so a
  trivial question still pays for two calls. We do not see a way
  to remove this without losing the ability to surface structured
  intent to the UI; we mitigate by allowing the CLI to skip
  validation in the future.

**Neutral**

- Reflection is intentionally the last stage. The output of
  `reflect` is stored in memory and made available to the next
  task; it is not used to re-plan the current task.

## Why we changed course

The dual-agent design assumed that *planning* and *executing* were
fundamentally different activities that needed different LLM
prompts, different context windows, and different validation
rules. After running it for two months the data showed the
opposite: planning and executing are the same activity, viewed
before and after the LLM has produced output. The two "agents"
ended up calling the same providers with overlapping context, and
the "collaboration manager" was an LLM call that said "continue"
in 80% of turns.

Collapsing them into a single agent with a six-stage pipeline cut
the average LLM cost per task in half, made the failure mode
predictable (the failing stage is named in the error), and let us
delete the manager entirely.
