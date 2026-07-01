import { pino } from 'pino';
import { openDb, type Db } from '../src/db/index.js';
import { createResponsesRepo, type NewResponse } from '../src/db/responses.js';
import { createIncidentsRepo } from '../src/db/incidents.js';
import { createLlmUsageRepo } from '../src/db/llmUsage.js';
import type { SseHub } from '../src/realtime/sse.js';

export const silentLogger = pino({ enabled: false });

export function testDb(): Db {
  return openDb(':memory:');
}

export function repos(db: Db) {
  return {
    responses: createResponsesRepo(db),
    incidents: createIncidentsRepo(db),
    llmUsage: createLlmUsageRepo(db),
  };
}

/** Captures broadcasts instead of writing to sockets. */
export class FakeHub {
  events: { event: string; data: unknown }[] = [];
  broadcast(event: string, data: unknown): void {
    this.events.push({ event, data });
  }
  addClient(): void {}
  close(): void {}
  get clientCount(): number {
    return 0;
  }
}

export function asHub(fake: FakeHub): SseHub {
  return fake as unknown as SseHub;
}

export function sampleResponse(overrides: Partial<NewResponse> = {}): NewResponse {
  return {
    createdAt: Date.now(),
    url: 'https://httpbin.org/anything',
    requestPayload: '{"event":"test"}',
    statusCode: 200,
    latencyMs: 100,
    responseBody: '{"json":{}}',
    responseSizeBytes: 11,
    ok: true,
    error: null,
    ...overrides,
  };
}

/** Minimal successful fetch stub. */
export function okFetch(body = '{"json":{"echo":true}}', status = 200): typeof fetch {
  return (async () =>
    new Response(body, {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;
}
