import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { openDb } from './db/index.js';
import { createResponsesRepo } from './db/responses.js';
import { createIncidentsRepo } from './db/incidents.js';
import { createLlmUsageRepo } from './db/llmUsage.js';
import { SseHub } from './realtime/sse.js';
import { InsightsService } from './llm/insights.js';
import { startScheduler } from './monitor/scheduler.js';
import type { MonitorDeps } from './monitor/service.js';
import { createApp } from './app.js';

const config = loadConfig();
const db = openDb(config.databasePath);
const responses = createResponsesRepo(db);
const incidents = createIncidentsRepo(db);
const llmUsage = createLlmUsageRepo(db);
const hub = new SseHub(logger);

const insights = new InsightsService({
  apiKey: config.anthropicApiKey,
  model: process.env.LLM_MODEL,
  callsPerHour: config.llmCallsPerHour,
  responses,
  incidents,
  usage: llmUsage,
  logger,
});
if (!insights.llmEnabled) {
  logger.warn('ANTHROPIC_API_KEY not set — chat and incident analysis run in fallback mode');
}

const monitorDeps: MonitorDeps = {
  pingUrl: config.pingUrl,
  pingTimeoutMs: config.pingTimeoutMs,
  responses,
  incidents,
  hub,
  logger,
  onIncident: (incident) => {
    // Fire-and-forget: LLM analysis must never block the monitor loop.
    void insights
      .analyzeIncident(incident)
      .then(() => {
        const updated = incidents.getById(incident.id);
        if (updated) hub.broadcast('incident', updated);
      })
      .catch((err: unknown) => logger.error({ err }, 'incident analysis failed'));
  },
};

const app = createApp({ config, responses, incidents, llmUsage, hub, insights, logger });

// In production the server also serves the built frontend (single deploy unit).
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('{*splat}', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
  logger.info({ webDist }, 'serving frontend build');
}

const task = startScheduler(monitorDeps, config.pingCron, logger);
const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, 'server listening');
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down');
  void task.stop();
  hub.close();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
