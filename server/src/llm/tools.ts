import type Anthropic from '@anthropic-ai/sdk';
import type { ResponsesRepo } from '../db/responses.js';
import type { IncidentsRepo } from '../db/incidents.js';

/**
 * The chat assistant queries monitoring data exclusively through these
 * parameterized tools — the model never constructs SQL. This is a deliberate
 * design choice over text-to-SQL: it eliminates prompt-injection-to-SQL risk,
 * keeps every query index-friendly and bounded, and makes token usage
 * predictable (each tool returns a compact, capped payload).
 */

export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_stats',
    description:
      'Get aggregate monitoring stats (request count, success/failure counts, avg/min/max/p95 latency in ms) for the last N hours. Call this first for most questions.',
    input_schema: {
      type: 'object',
      properties: {
        hours: {
          type: 'number',
          description: 'Time window in hours (e.g. 24). Omit for all time.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_slowest_responses',
    description: 'Get the slowest monitored requests, sorted by latency descending.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max rows to return (default 5, max 20)' },
        hours: { type: 'number', description: 'Time window in hours. Omit for all time.' },
      },
      required: [],
    },
  },
  {
    name: 'get_recent_responses',
    description:
      'Get the most recent monitored requests, newest first. Can filter to failures only.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max rows to return (default 10, max 20)' },
        hours: { type: 'number', description: 'Time window in hours. Omit for all time.' },
        only_failures: { type: 'boolean', description: 'Only return failed requests' },
      },
      required: [],
    },
  },
  {
    name: 'get_incidents',
    description:
      'Get detected latency-anomaly incidents (response time > 2x rolling average), newest first.',
    input_schema: {
      type: 'object',
      properties: {
        hours: { type: 'number', description: 'Time window in hours. Omit for all time.' },
      },
      required: [],
    },
  },
];

function clamp(value: unknown, fallback: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(Math.max(n, 1), max);
}

function hoursArg(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.min(value, 24 * 365)
    : undefined;
}

/** Compact row shape sent to the model — full bodies stay out of the prompt. */
function summarizeRow(r: {
  id: number;
  createdAt: number;
  statusCode: number | null;
  latencyMs: number;
  ok: boolean;
  error: string | null;
  responseSizeBytes: number | null;
}) {
  return {
    id: r.id,
    at: new Date(r.createdAt).toISOString(),
    status: r.statusCode,
    latency_ms: r.latencyMs,
    ok: r.ok,
    error: r.error,
    size_bytes: r.responseSizeBytes,
  };
}

export function createToolExecutor(responses: ResponsesRepo, incidents: IncidentsRepo) {
  return function executeTool(name: string, input: Record<string, unknown>): string {
    switch (name) {
      case 'get_stats':
        return JSON.stringify(responses.stats(hoursArg(input.hours)));
      case 'get_slowest_responses':
        return JSON.stringify(
          responses.slowest(clamp(input.limit, 5, 20), hoursArg(input.hours)).map(summarizeRow),
        );
      case 'get_recent_responses':
        return JSON.stringify(
          responses
            .list({
              limit: clamp(input.limit, 10, 20),
              hours: hoursArg(input.hours),
              status: input.only_failures === true ? 'failed' : undefined,
            })
            .map(summarizeRow),
        );
      case 'get_incidents':
        return JSON.stringify(
          incidents.list({ limit: 20, hours: hoursArg(input.hours) }).map((i) => ({
            id: i.id,
            at: new Date(i.createdAt).toISOString(),
            severity: i.severity,
            latency_ms: i.latencyMs,
            baseline_ms: Math.round(i.baselineMs),
            summary: i.summary,
          })),
        );
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  };
}

export type ToolExecutor = ReturnType<typeof createToolExecutor>;
