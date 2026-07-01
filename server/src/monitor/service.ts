import type { Logger } from '../logger.js';
import type { ResponsesRepo, ResponseRecord } from '../db/responses.js';
import type { IncidentsRepo, IncidentRecord } from '../db/incidents.js';
import type { SseHub } from '../realtime/sse.js';
import { generatePayload } from './payload.js';
import { pingOnce } from './pinger.js';

/** Anomaly detection tuning (documented in README). */
export const ANOMALY_WINDOW_MS = 24 * 3_600_000; // 24h rolling baseline
export const MIN_BASELINE_SAMPLES = 5; // don't alert until we have a baseline
export const ANOMALY_FACTOR = 2; // spec: response time > 2x average
export const CRITICAL_FACTOR = 4;

export interface MonitorDeps {
  pingUrl: string;
  pingTimeoutMs: number;
  responses: ResponsesRepo;
  incidents: IncidentsRepo;
  hub: SseHub;
  logger: Logger;
  fetchFn?: typeof fetch;
  /** Hook for async post-processing (LLM incident analysis). Must not throw. */
  onIncident?: (incident: IncidentRecord) => void;
}

/**
 * One full monitor cycle: generate payload → ping → store → broadcast →
 * check for latency anomaly. This is the core pipeline of the application.
 */
export async function runPing(deps: MonitorDeps): Promise<ResponseRecord> {
  const payload = generatePayload();
  const result = await pingOnce({
    url: deps.pingUrl,
    timeoutMs: deps.pingTimeoutMs,
    payload,
    fetchFn: deps.fetchFn,
  });

  const record = deps.responses.insert(result);
  deps.logger.info(
    { id: record.id, status: record.statusCode, latencyMs: record.latencyMs, ok: record.ok },
    'ping recorded',
  );
  deps.hub.broadcast('response', record);

  const incident = detectIncident(deps, record);
  if (incident) {
    deps.logger.warn(
      { incidentId: incident.id, latencyMs: incident.latencyMs, baselineMs: incident.baselineMs },
      'latency anomaly detected',
    );
    deps.hub.broadcast('incident', incident);
    deps.onIncident?.(incident);
  }

  return record;
}

/**
 * Latency anomaly check per the assignment: response time > 2x rolling
 * average. Only successful pings are compared (failures already surface as
 * errors in the dashboard), and we require a minimum number of baseline
 * samples so the first few pings can't alert against a meaningless average.
 */
export function detectIncident(
  deps: Pick<MonitorDeps, 'responses' | 'incidents'>,
  record: ResponseRecord,
): IncidentRecord | null {
  if (!record.ok) return null;

  const { avg, count } = deps.responses.rollingAverage(ANOMALY_WINDOW_MS, record.id);
  if (avg === null || count < MIN_BASELINE_SAMPLES) return null;
  if (record.latencyMs <= ANOMALY_FACTOR * avg) return null;

  const severity = record.latencyMs > CRITICAL_FACTOR * avg ? 'critical' : 'warning';
  return deps.incidents.create({
    createdAt: record.createdAt,
    responseId: record.id,
    severity,
    endpoint: record.url,
    latencyMs: record.latencyMs,
    baselineMs: avg,
    summary:
      `Response time ${record.latencyMs}ms was ${(record.latencyMs / avg).toFixed(1)}x the ` +
      `24h rolling average of ${Math.round(avg)}ms`,
  });
}
