import express, { type Request, type Response, type NextFunction } from 'express';
import type { Config } from './config.js';
import type { Logger } from './logger.js';
import type { ResponsesRepo } from './db/responses.js';
import type { IncidentsRepo } from './db/incidents.js';
import type { LlmUsageRepo } from './db/llmUsage.js';
import type { SseHub } from './realtime/sse.js';
import type { InsightsService } from './llm/insights.js';

export interface AppContext {
  config: Config;
  responses: ResponsesRepo;
  incidents: IncidentsRepo;
  llmUsage: LlmUsageRepo;
  hub: SseHub;
  insights: InsightsService;
  logger: Logger;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// /api/chat is public and does real work even in fallback mode, so it gets a
// per-IP fixed-window throttle in front of the LLM budget. Hand-rolled (~20
// lines) rather than a dependency, matching the repo's dependency philosophy.
const CHAT_THROTTLE_LIMIT = 10; // requests per window per IP
const CHAT_THROTTLE_WINDOW_MS = 60_000;
const CHAT_THROTTLE_MAX_IPS = 10_000; // hard bound on tracker memory

function chatThrottle() {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    if (windows.size >= CHAT_THROTTLE_MAX_IPS) {
      for (const [ip, w] of windows) if (w.resetAt <= now) windows.delete(ip);
      if (windows.size >= CHAT_THROTTLE_MAX_IPS) windows.clear(); // refuse to grow unbounded
    }
    const key = req.ip ?? 'unknown';
    const w = windows.get(key);
    if (!w || w.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + CHAT_THROTTLE_WINDOW_MS });
      next();
      return;
    }
    if (w.count >= CHAT_THROTTLE_LIMIT) {
      res.status(429).json({ error: 'Too many chat requests — try again in a minute' });
      return;
    }
    w.count += 1;
    next();
  };
}

function intQuery(req: Request, name: string, fallback: number, max: number): number {
  const raw = req.query[name];
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(String(raw), 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    throw new HttpError(400, `Query parameter "${name}" must be a positive integer`);
  }
  return Math.min(parsed, max);
}

function optionalIntQuery(req: Request, name: string, max: number): number | undefined {
  if (req.query[name] === undefined) return undefined;
  return intQuery(req, name, 0, max);
}

export function createApp(ctx: AppContext): express.Express {
  const app = express();
  // Railway terminates TLS at its proxy; trust it so req.ip is the client.
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  // Live updates: EventSource endpoint the dashboard subscribes to.
  app.get('/api/stream', (req, res) => {
    ctx.hub.addClient(res);
    req.on('error', () => res.end());
  });

  app.get('/api/responses', (req, res) => {
    const status = req.query.status;
    if (status !== undefined && status !== 'ok' && status !== 'failed') {
      throw new HttpError(400, 'Query parameter "status" must be "ok" or "failed"');
    }
    const items = ctx.responses.list({
      limit: intQuery(req, 'limit', 50, 200),
      before: optionalIntQuery(req, 'before', Number.MAX_SAFE_INTEGER),
      hours: optionalIntQuery(req, 'hours', 24 * 365),
      status: status as 'ok' | 'failed' | undefined,
    });
    res.json({
      items,
      nextCursor: items.length > 0 ? items[items.length - 1]!.id : null,
    });
  });

  app.get('/api/responses/:id', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const record = Number.isNaN(id) ? undefined : ctx.responses.getById(id);
    if (!record) throw new HttpError(404, 'Response not found');
    res.json(record);
  });

  app.get('/api/stats', (req, res) => {
    res.json(ctx.responses.stats(optionalIntQuery(req, 'hours', 24 * 365) ?? 24));
  });

  app.get('/api/incidents', (req, res) => {
    res.json({
      items: ctx.incidents.list({
        limit: intQuery(req, 'limit', 50, 200),
        hours: optionalIntQuery(req, 'hours', 24 * 365),
      }),
    });
  });

  app.get('/api/llm/usage', (_req, res) => {
    res.json({
      enabled: ctx.insights.llmEnabled,
      model: ctx.insights.model,
      callsPerHour: ctx.config.llmCallsPerHour,
      remainingCallsThisHour: ctx.insights.costs.remainingCalls(),
      usage: ctx.llmUsage.summary(),
    });
  });

  // Chat endpoint: streams the answer back as SSE frames.
  app.post('/api/chat', chatThrottle(), async (req, res) => {
    const { message, history } = req.body as {
      message?: unknown;
      history?: { role: 'user' | 'assistant'; content: string }[];
    };
    if (typeof message !== 'string' || message.trim().length === 0) {
      throw new HttpError(400, 'Body must include a non-empty "message" string');
    }
    if (message.length > 2000) {
      throw new HttpError(400, 'Message too long (max 2000 characters)');
    }
    const safeHistory = Array.isArray(history)
      ? history
          .filter(
            (m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string',
          )
          .slice(-10) // bound prompt size (and cost) regardless of client behavior
      : [];

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const result = await ctx.insights.chat({
      message,
      history: safeHistory,
      onText: (delta) => send('delta', { text: delta }),
    });
    send('done', { source: result.source });
    res.end();
  });

  app.use('/api', (_req, _res, next) => {
    next(new HttpError(404, 'Not found'));
  });

  // Express 5 forwards rejected async handlers here automatically.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) ctx.logger.error({ err }, 'request failed');
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(status).json({ error: err.message });
  });

  return app;
}
