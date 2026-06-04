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
import { registerDefaultTools } from './tools-setup.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const adapters = createAdapters();
  registerDefaultTools(adapters);
  const sessions = new SessionStore();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '4mb' }));

  app.use((req, _res, next) => {
    const ts = new Date().toISOString();
    process.stdout.write(`[${ts}] ${req.method} ${req.url}\n`);
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  app.use('/api/config', configRoutes(adapters.config, adapters.llm));
  app.use('/api/memory', memoryRoutes(adapters.memory));
  app.use('/api/tools', toolsRoutes(adapters));
  app.use('/api/dashboard', dashboardRoutes(adapters.llm, adapters.memory, adapters.config, sessions));
  app.use('/api/graph', graphRoutes(adapters.memory));
  app.use('/api/personality', personalityRoutes());
  app.use('/api/emotion', emotionRoutes());
  app.use('/api/chat', chatRoutes({
    llm: adapters.llm,
    config: adapters.config,
    memory: adapters.memory,
    sessions,
  }));
  app.use('/api/agent', agentRoutes(adapters));
  app.use('/api/ai', aiRoutes({ llm: adapters.llm, config: adapters.config }));
  app.use('/api/skills', skillsRoutes());
  app.use('/api/agents', agentsRoutes());

  const frontendDist = path.resolve(__dirname, '../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    process.stderr.write(`[error] ${err.stack ?? err.message}\n`);
    res.status(500).json({ error: err.message });
  });

  return app;
}
