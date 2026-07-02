import type Anthropic from '@anthropic-ai/sdk';
import type { ResponsesRepo } from '../db/responses.js';
import type { IncidentsRepo } from '../db/incidents.js';
import { analyzePayloadPatterns } from './payloadAnalysis.js';

/**
 * The chat assistant queries monitoring data exclusively through these
 * parameterized tools — the model never constructs SQL. This is a deliberate
 * design choice over text-to-SQL: it eliminates prompt-injection-to-SQL risk,
 * keeps every query index-friendly and bounded, and makes token usage
 * predictable (each tool returns a compact, capped payload).
 *
 * get_responses_in_range takes explicit timestamps so questions about a
 * specific moment ("why did response time spike at 2pm?") can fetch the spike
 * and its surroundings; analyze_payload_patterns exposes the deterministic
 * Smart Response Analysis aggregate for natural-language summarization.
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
  {
    name: 'get_responses_in_range',
    description:
      'Get monitored requests between two timestamps (max 7 days apart), with an aggregate header. Use this for questions about a specific time — e.g. a spike "at 2pm" — with a window around that moment so the spike and its surroundings are both visible.',
    input_schema: {
      type: 'object',
      properties: {
        start: { type: 'string', description: 'Range start, ISO 8601 (e.g. 2026-07-02T13:30:00Z)' },
        end: { type: 'string', description: 'Range end, ISO 8601' },
        only_failures: { type: 'boolean', description: 'Only return failed requests' },
      },
      required: ['start', 'end'],
    },
  },
  {
    name: 'analyze_payload_patterns',
    description:
      'Analyze the httpbin response payloads: extracts and categorizes the echoed request payloads (event types, listing categories/regions, tags), response size buckets, and payload shape variants. Use for questions about payload contents or patterns, then summarize the findings in plain language.',
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
      case 'get_responses_in_range': {
        const from = Date.parse(String(input.start));
        const to = Date.parse(String(input.end));
        if (Number.isNaN(from) || Number.isNaN(to)) {
          return JSON.stringify({ error: 'start and end must be valid ISO 8601 timestamps' });
        }
        if (to <= from) return JSON.stringify({ error: 'end must be after start' });
        if (to - from > 7 * 24 * 3_600_000) {
          return JSON.stringify({ error: 'range too large — maximum 7 days' });
        }
        const rows = responses.list({
          limit: 300,
          from,
          to,
          status: input.only_failures === true ? 'failed' : undefined,
        });
        const okRows = rows.filter((r) => r.ok);
        return JSON.stringify({
          range: { start: new Date(from).toISOString(), end: new Date(to).toISOString() },
          summary: {
            count: rows.length,
            ok: okRows.length,
            failed: rows.length - okRows.length,
            avg_latency_ms:
              rows.length > 0
                ? Math.round(rows.reduce((sum, r) => sum + r.latencyMs, 0) / rows.length)
                : null,
            max_latency_ms: rows.length > 0 ? Math.max(...rows.map((r) => r.latencyMs)) : null,
            truncated: rows.length === 300,
          },
          responses: rows.slice(0, 40).map(summarizeRow),
        });
      }
      case 'analyze_payload_patterns':
        return JSON.stringify(
          analyzePayloadPatterns(responses.list({ limit: 500, hours: hoursArg(input.hours) })),
        );
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  };
}

export type ToolExecutor = ReturnType<typeof createToolExecutor>;
