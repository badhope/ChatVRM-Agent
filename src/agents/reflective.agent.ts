import { EventEmitter } from 'eventemitter3';
import type { Message } from '../ports/llm.port.js';
import { ReActAgent, type ReActConfig, type ReActResult } from './react.agent.js';

/**
 * A single critique round.
 */
export interface CritiqueRound {
  index: number;
  satisfied: boolean;
  feedback: string;
  issues: string[];
  tokens: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface ReflectiveRunResult {
  output: string;
  rounds: Array<{ react: ReActResult; critique: CritiqueRound }>;
  totalIterations: number;
  totalTokens: number;
  finishReason: 'final-answer' | 'satisfied' | 'max-rounds' | 'error';
}

const CRITIC_SYSTEM_PROMPT = `You are a strict reviewer. The previous agent attempted the user's task and produced the answer below.

Decide if the answer is complete, correct, and actionable for the user.

Output ONLY a JSON object in exactly this shape:
{
  "satisfied": true | false,
  "issues": ["..."],          // empty array if satisfied
  "feedback": "..."           // one paragraph of concrete improvement instructions, or "OK" if satisfied
}

Rules:
- Mark satisfied=true only if the answer fully addresses the user's request with no missing pieces.
- If the answer is a final summary that cites specific facts, verify they line up with the observations.
- If the agent did not actually run the tools needed (e.g. it answered without checking files when the user asked for file contents), mark not satisfied.
- Be strict. A safe, hedged, "I think the answer is..." is not satisfactory.`;

export interface ReflectiveConfig {
  base: ReActConfig;
  /** Total number of (react, critique) rounds. Default 2. */
  maxRounds?: number;
  /** If the agent loop itself fails, do we still return what we have? */
  failOpen?: boolean;
}

/**
 * Wraps a ReActAgent with a critique loop. After each ReAct run, a
 * second LLM call asks "is this good enough?". If not, the original
 * user input is augmented with the feedback and the agent runs again.
 */
export class ReflectiveAgent {
  private cfg: ReflectiveConfig;
  private bus: EventEmitter;

  constructor(cfg: ReflectiveConfig) {
    this.cfg = cfg;
    this.bus = new EventEmitter();
  }

  get events(): EventEmitter {
    return this.bus;
  }

  async run(input: string, systemPromptOverride?: string): Promise<ReflectiveRunResult> {
    const maxRounds = this.cfg.maxRounds ?? 2;
    const rounds: ReflectiveRunResult['rounds'] = [];
    let totalTokens = 0;

    let lastInput = input;
    for (let r = 0; r < maxRounds; r += 1) {
      if (this.cfg.base.signal?.aborted) {
        return {
          output: rounds.length > 0 ? rounds[rounds.length - 1]!.react.output : '',
          rounds,
          totalIterations: rounds.reduce((s, x) => s + x.react.iterations, 0),
          totalTokens,
          finishReason: 'error',
        };
      }

      const agent = new ReActAgent(this.cfg.base);
      let react: ReActResult;
      try {
        react = await agent.run(lastInput, { systemPromptOverride });
      } catch (err) {
        if (this.cfg.failOpen && rounds.length > 0) {
          return {
            output: rounds[rounds.length - 1]!.react.output,
            rounds,
            totalIterations: rounds.reduce((s, x) => s + x.react.iterations, 0),
            totalTokens,
            finishReason: 'error',
          };
        }
        throw err;
      }
      totalTokens += react.totalTokens;

      const critique = await this.critique(input, react, r);
      totalTokens += critique.tokens.totalTokens;

      rounds.push({ react, critique });

      if (critique.satisfied) {
        return {
          output: react.output,
          rounds,
          totalIterations: rounds.reduce((s, x) => s + x.react.iterations, 0),
          totalTokens,
          finishReason: 'satisfied',
        };
      }

      lastInput = `${input}\n\n[Reviewer feedback — please address these issues in your next attempt]\n${critique.feedback}\n\nIssues:\n- ${critique.issues.join('\n- ')}`;
    }

    return {
      output: rounds.length > 0 ? rounds[rounds.length - 1]!.react.output : '',
      rounds,
      totalIterations: rounds.reduce((s, x) => s + x.react.iterations, 0),
      totalTokens,
      finishReason: 'max-rounds',
    };
  }

  private async critique(originalInput: string, react: ReActResult, roundIndex: number): Promise<CritiqueRound> {
    const summary = react.steps
      .map((s) => {
        const acts = s.actions.map((a) => `  - ${a.call.name}(${JSON.stringify(a.call.arguments)}) → ${truncateForCritique(a.observation, 200)}`).join('\n');
        return `Step ${s.index}: thought=${truncateForCritique(s.thought, 200)}\n${acts}`;
      })
      .join('\n\n');

    const messages: Message[] = [
      { role: 'system', content: CRITIC_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `User request:\n${originalInput}\n\nAgent transcript (${react.iterations} step(s), ${react.totalTokens} tokens):\n${summary}\n\nFinal answer:\n${react.output}\n\nJSON verdict:`,
      },
    ];

    let response;
    try {
      response = await this.cfg.base.llm.chat({
        provider: this.cfg.base.provider,
        model: this.cfg.base.model,
        messages,
        temperature: 0,
        maxTokens: 512,
        signal: this.cfg.base.signal,
      });
    } catch {
      return {
        index: roundIndex,
        satisfied: false,
        feedback: 'Critic LLM call failed; defaulting to retry.',
        issues: ['critic-error'],
        tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }

    const parsed = parseCritiqueJson(response.content);
    return {
      index: roundIndex,
      satisfied: parsed.satisfied,
      issues: parsed.issues,
      feedback: parsed.feedback,
      tokens: response.usage,
    };
  }
}

function truncateForCritique(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '...';
}

function parseCritiqueJson(content: string): { satisfied: boolean; issues: string[]; feedback: string } {
  const cleaned = content.replace(/```(?:json)?\n?/g, '').trim();
  // Try direct parse.
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      satisfied: Boolean(parsed.satisfied),
      issues: Array.isArray(parsed.issues) ? (parsed.issues as unknown[]).filter((x): x is string => typeof x === 'string') : [],
      feedback: typeof parsed.feedback === 'string' ? parsed.feedback : 'OK',
    };
  } catch {
    // Fall back: extract the first JSON object.
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as Record<string, unknown>;
        return {
          satisfied: Boolean(parsed.satisfied),
          issues: Array.isArray(parsed.issues) ? (parsed.issues as unknown[]).filter((x): x is string => typeof x === 'string') : [],
          feedback: typeof parsed.feedback === 'string' ? parsed.feedback : 'OK',
        };
      } catch {
        // Give up — treat as not satisfied with the raw content as feedback.
        return { satisfied: false, issues: ['unparseable-critique'], feedback: cleaned.slice(0, 1000) };
      }
    }
    return { satisfied: false, issues: ['unparseable-critique'], feedback: cleaned.slice(0, 1000) };
  }
}
