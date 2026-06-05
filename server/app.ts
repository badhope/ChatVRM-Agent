import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { createAdapters } from '../src/adapters/index.js';
import { SessionStore } from './session-store.js';
import { configRoutes } from './routes/config.routes.js';
import { memoryRoutes } from './routes/memory.routes.js';
import { toolsRoutes } from './routes/tools.routes.js';
import { dashboardRoutes } from './routes/dashboard.routes.js';
import { graphRoutes } from './routes/graph.routes.js';
import { personalityRoutes } from './routes/personality.routes.js';
import { chatRoutes } from './routes/chat.routes.js';
import { agentRoutes } from './routes/agent.routes.js';
import { emotionRoutes } from './routes/emotion.routes.js';
import { aiRoutes } from './routes/ai.routes.js';
import { skillsRoutes } from './routes/skills.routes.js';
import { agentsRoutes } from './routes/agents.routes.js';
import { ragRoutes } from './routes/rag.routes.js';
import { webhooksRoutes } from './routes/webhooks.routes.js';
import { queueRoutes } from './routes/queue.routes.js';
import { observabilityRoutes } from './routes/observability.routes.js';
import { agentsRuntimeRoutes } from './routes/agents-runtime.routes.js';
import { budgetRoutes } from './routes/budget.routes.js';
import { requireAuth, validateCwd } from './middleware/auth.js';
import { getRuntime } from './runtime.js';
import { buildWiring } from './wiring.js';
import { registerDefaultTools } from './tools-setup.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const adapters = createAdapters();
  registerDefaultTools({
    llm: adapters.llm,
    storage: adapters.storage,
    memory: adapters.memory,
    shell: adapters.shell,
    config: adapters.config,
    tools: adapters.tools,
  });
  const sessions = new SessionStore();

  // Build the W11 wiring: ResilientLLM → LLMCache → TokenBudget.
  // Every route that talks to the LLM uses `wiring.llm` instead of
  // `adapters.llm` so retries, caching, and budget enforcement are
  // actually live (not just sitting on a shelf).
  const wiring = buildWiring(adapters);
  // Register the RAG tool on the shared tools registry. Idempotent
  // through `wiring.ensureRagTool()` so a second call (e.g. after a
  // hot-reload) is safe.
  wiring.ensureRagTool();

  const app = express();
  // C1 (W18): allow CORS_ORIGIN to scope the Access-Control-Allow-Origin
  // header. Default to * so a local UI "just works", but make it
  // configurable for any non-loopback deployment.
  const allowedOrigins = (process.env['PA_ALLOWED_ORIGINS'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowedOrigins.length > 0) {
    app.use(cors({ origin: allowedOrigins, credentials: false }));
  } else {
    app.use(cors());
  }
  app.use(express.json({ limit: '4mb' }));

  app.use((req, _res, next) => {
    // M19 (W18): use `console.log` instead of
    // `process.stdout.write`. The old direct write bypassed
    // Node's stdio configuration (e.g. a TTY coloriser, a
    // pino-style pretty printer, a test capture). `console.log`
    // also flushes on newline consistently and respects the
    // `NODE_NO_WARNINGS` env var for the underlying
    // `process.stdout`. We construct the string explicitly so
    // JSON loggers that hook `console.log` see a single
    // argument.
    const ts = new Date().toISOString();
    console.log(`[${ts}] ${req.method} ${req.url}`);
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  // C1 (W18): the unauthenticated `/api/health` probe must stay
  // outside the auth wall. Everything else mounted under `/api` now
  // requires a valid bearer token by default. Individual routes may
  // still add their own middleware (e.g. trust gate, cwd validation),
  // but they no longer need to repeat the auth check.
  const apiAuth = requireAuth();
  app.use((req, res, next) => {
    if (req.path === '/api/health' || req.path === '/health') return next();
    return apiAuth(req, res, next);
  });

  // Hydrate the shared runtime from disk (best-effort, non-blocking).
  const runtime = getRuntime();
  runtime.hydrateFromDisk().then((r) => {
    if (r.loaded > 0) {
      // M19 (W18): see the request-log line above. `console.log`
      // is the documented surface for application output and
      // is overridable by test harnesses / log shippers.
      console.log(`[runtime] hydrated ${r.loaded} vectors from ${r.path}`);
    }
  }).catch(() => {
    /* ignore — Runtime.hydrateFromDisk is best-effort */
  });

  app.use('/api/config', configRoutes(adapters.config, wiring.llm));
  app.use('/api/memory', memoryRoutes(adapters.memory));
  app.use('/api/tools', toolsRoutes({
    tools: adapters.tools,
    llm: wiring.llm,
    storage: adapters.storage,
    memory: adapters.memory,
    shell: adapters.shell,
    trust: adapters.trust,
  }));
  app.use('/api/dashboard', dashboardRoutes(wiring.llm, adapters.memory, adapters.config, sessions));
  app.use('/api/graph', graphRoutes(adapters.memory));
  app.use('/api/personality', personalityRoutes());
  app.use('/api/emotion', emotionRoutes());
  app.use('/api/chat', chatRoutes({
    llm: wiring.llm,
    config: adapters.config,
    memory: adapters.memory,
    sessions,
  }));
  app.use('/api/agent', agentRoutes({
    llm: wiring.llm,
    config: adapters.config,
    storage: adapters.storage,
    memory: adapters.memory,
    shell: adapters.shell,
    tools: adapters.tools,
  }));
  app.use('/api/ai', aiRoutes({ llm: wiring.llm, config: adapters.config }));
  app.use('/api/skills', skillsRoutes());
  app.use('/api/agents', agentsRoutes());

  // W12: expose the W11 integration layer.
  app.use('/api/rag', ragRoutes());
  app.use('/api/webhooks', webhooksRoutes());
  app.use('/api/queue', queueRoutes());
  app.use('/api/observability', observabilityRoutes());
  app.use('/api/budget', budgetRoutes(wiring));
  app.use('/api/runtime/agents', agentsRuntimeRoutes({
    llm: wiring.llm,
    config: adapters.config,
    memory: adapters.memory,
    storage: adapters.storage,
    tools: adapters.tools,
    shell: adapters.shell,
  }));

  const frontendDist = path.resolve(__dirname, '../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(`[error] ${err.stack ?? err.message}`);
    res.status(500).json({ error: err.message });
  });

  return app;
}
