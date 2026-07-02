import { describe, expect, it, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { InsightsService } from '../src/llm/insights.js';
import { SseHub } from '../src/realtime/sse.js';
import { repos, sampleResponse, silentLogger, testDb } from './helpers.js';

describe('REST API', () => {
  let app: ReturnType<typeof createApp>;
  let r: ReturnType<typeof repos>;
  let hub: SseHub;

  beforeEach(() => {
    r = repos(testDb());
    hub = new SseHub();
    const config = loadConfig();
    const insights = new InsightsService({
      apiKey: undefined, // fallback mode — no external calls from tests
      callsPerHour: config.llmCallsPerHour,
      responses: r.responses,
      incidents: r.incidents,
      usage: r.llmUsage,
      logger: silentLogger,
    });
    app = createApp({
      config,
      responses: r.responses,
      incidents: r.incidents,
      llmUsage: r.llmUsage,
      hub,
      insights,
      logger: silentLogger,
    });
  });

  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api/responses returns newest-first with a cursor', async () => {
    for (let i = 0; i < 5; i++) r.responses.insert(sampleResponse({ latencyMs: 100 + i }));

    const res = await request(app).get('/api/responses?limit=3');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.items[0].latencyMs).toBe(104); // newest first
    expect(res.body.nextCursor).toBe(res.body.items[2].id);

    const page2 = await request(app).get(`/api/responses?limit=3&before=${res.body.nextCursor}`);
    expect(page2.body.items).toHaveLength(2);
    expect(page2.body.items[0].latencyMs).toBe(101);
  });

  it('GET /api/responses filters by status', async () => {
    r.responses.insert(sampleResponse());
    r.responses.insert(sampleResponse({ ok: false, statusCode: 500 }));

    const res = await request(app).get('/api/responses?status=failed');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].ok).toBe(false);
  });

  it('GET /api/responses validates query params', async () => {
    const res = await request(app).get('/api/responses?limit=zero');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('limit');

    const bad = await request(app).get('/api/responses?status=weird');
    expect(bad.status).toBe(400);
  });

  it('GET /api/responses/:id returns the full record or 404', async () => {
    const record = r.responses.insert(sampleResponse());

    const found = await request(app).get(`/api/responses/${record.id}`);
    expect(found.status).toBe(200);
    expect(found.body.requestPayload).toBe(record.requestPayload);

    const missing = await request(app).get('/api/responses/99999');
    expect(missing.status).toBe(404);
  });

  it('GET /api/stats aggregates the window', async () => {
    r.responses.insert(sampleResponse({ latencyMs: 100 }));
    r.responses.insert(sampleResponse({ latencyMs: 300 }));
    r.responses.insert(sampleResponse({ ok: false, statusCode: 503, latencyMs: 50 }));

    const res = await request(app).get('/api/stats?hours=24');
    expect(res.body.count).toBe(3);
    expect(res.body.okCount).toBe(2);
    expect(res.body.failedCount).toBe(1);
    expect(res.body.maxLatencyMs).toBe(300);
  });

  it('GET /api/llm/usage reports cost state', async () => {
    const res = await request(app).get('/api/llm/usage');
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.remainingCallsThisHour).toBeGreaterThan(0);
    expect(res.body.usage.totalCalls).toBe(0);
  });

  it('POST /api/chat streams a fallback answer as SSE', async () => {
    r.responses.insert(sampleResponse());

    const res = await request(app)
      .post('/api/chat')
      .send({ message: 'summarize the last 24 hours' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('event: delta');
    expect(res.text).toContain('event: done');
    expect(res.text).toContain('"source":"fallback"');
  });

  it('POST /api/chat rejects an empty message', async () => {
    const res = await request(app).post('/api/chat').send({ message: '   ' });
    expect(res.status).toBe(400);
  });

  it('POST /api/chat throttles a single IP but not others', async () => {
    // 10 requests/minute/IP; the 11th from the same IP gets 429.
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/chat')
        .set('X-Forwarded-For', '203.0.113.7')
        .send({ message: `question ${i}` });
      expect(res.status).toBe(200);
    }
    const throttled = await request(app)
      .post('/api/chat')
      .set('X-Forwarded-For', '203.0.113.7')
      .send({ message: 'one too many' });
    expect(throttled.status).toBe(429);
    expect(throttled.body.error).toContain('Too many');

    // A different client is unaffected.
    const other = await request(app)
      .post('/api/chat')
      .set('X-Forwarded-For', '203.0.113.99')
      .send({ message: 'different client' });
    expect(other.status).toBe(200);
  });

  it('unknown /api routes return JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});
