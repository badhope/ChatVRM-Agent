import { Router } from 'express';
import type { ILLMPort } from '../../src/ports/llm.port.js';
import type { IMemoryPort } from '../../src/ports/memory.port.js';
import type { IConfigPort } from '../../src/ports/config.port.js';
import { PROVIDER_META, resolveApiKey } from '../providers.js';
import { SessionStore } from '../session-store.js';
import { updateEmotionFromInteraction } from './emotion.routes.js';

const STATS = {
  agentRunCount: 0,
  toolCallCount: 0,
};

export function getAgentRunCount(): number {
  return STATS.agentRunCount;
}

export function getToolCallCount(): number {
  return STATS.toolCallCount;
}

export function incrementAgentRun(): void {
  STATS.agentRunCount += 1;
}

export function incrementToolCall(): void {
  STATS.toolCallCount += 1;
}

export function dashboardRoutes(
  llm: ILLMPort,
  memory: IMemoryPort,
  config: IConfigPort,
  sessions: SessionStore,
): Router {
  const r = Router();

  r.get('/', async (_req, res) => {
    const memStats = await memory.stats();
    const allMem = await memory.loadAll();
    const list = await sessions.list();
    const chatSessions = list.length;
    const totalMessages = list.reduce((s, x) => s + x.messages.length, 0);

    const tags = new Map<string, number>();
    for (const m of allMem) for (const t of m.tags) tags.set(t, (tags.get(t) ?? 0) + 1);

    const providerStatus = await Promise.all(
      PROVIDER_META.map(async (p) => {
        const hasKey = !!(await resolveApiKey(config, p.id));
        return {
          id: p.id,
          name: p.name,
          hasKey,
          requiresKey: p.requiresKey,
          available: !p.requiresKey || hasKey,
        };
      }),
    );

    const agentMemories = allMem.filter((m) => m.tags.includes('agent'));
    const recent = [...allMem]
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
      .slice(0, 8)
      .map((m) => ({
        id: m.id,
        type: m.tags.includes('agent') ? 'agent' : m.tags.includes('tool') ? 'tool' : 'memory',
        summary: m.input.slice(0, 80),
        createdAt: new Date(m.timestamp).toISOString(),
      }));

    res.json({
      chatSessions,
      totalMessages,
      memoryCount: memStats.totalRecords,
      memoryTokens: memStats.totalTokens,
      providersConfigured: providerStatus.filter((p) => p.hasKey || !p.requiresKey).length,
      providersTotal: providerStatus.length,
      agentRunCount: STATS.agentRunCount,
      toolCallCount: STATS.toolCallCount,
      agentMemoryCount: agentMemories.length,
      providerStatus,
      memoryByTag: [...tags.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([tag, count]) => ({ tag, count })),
      recentActivity: recent,
    });
  });

  return r;
}
