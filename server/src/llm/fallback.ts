import type { ResponsesRepo } from '../db/responses.js';
import type { IncidentsRepo, IncidentRecord } from '../db/incidents.js';

/**
 * Deterministic (zero-cost) degradation paths for when the LLM is
 * unavailable: no API key configured, hourly quota exhausted, or an API
 * error. The dashboard stays useful either way.
 */

export function fallbackChatAnswer(
  responses: ResponsesRepo,
  incidents: IncidentsRepo,
  reason: { quotaExceeded?: boolean; error?: boolean } = {},
): string {
  const stats = responses.stats(24);
  const recentIncidents = incidents.list({ limit: 3, hours: 24 });

  const prefix = reason.error
    ? 'The AI assistant hit an error, so here is an automatic summary instead.'
    : reason.quotaExceeded
      ? 'The hourly AI budget is used up (it resets within the hour), so here is an automatic summary instead.'
      : 'No AI API key is configured, so here is an automatic summary instead.';

  const lines = [
    prefix,
    '',
    `**Last 24 hours:** ${stats.count} checks — ${stats.okCount} succeeded, ${stats.failedCount} failed.`,
  ];
  if (stats.avgLatencyMs !== null) {
    lines.push(
      `**Latency:** avg ${Math.round(stats.avgLatencyMs)}ms, min ${stats.minLatencyMs}ms, max ${stats.maxLatencyMs}ms, p95 ${stats.p95LatencyMs}ms.`,
    );
  }
  lines.push(
    recentIncidents.length === 0
      ? '**Incidents:** none detected in the last 24 hours.'
      : `**Incidents:** ${recentIncidents.length} in the last 24 hours — latest: ${recentIncidents[0]!.summary}`,
  );
  return lines.join('\n');
}

export function fallbackIncidentAnalysis(incident: IncidentRecord): string {
  const ratio = (incident.latencyMs / incident.baselineMs).toFixed(1);
  return [
    '## Potential root causes',
    `- Transient slowness at the monitored endpoint (${incident.endpoint}) — observed latency was ${ratio}x the 24h baseline`,
    '- Network congestion or routing change between this server and the endpoint',
    '- Rate limiting or resource contention on the target service',
    '',
    '## Recommendations',
    '- Watch the next few checks: an isolated spike usually self-resolves',
    '- If spikes repeat, compare timestamps against the target service status page',
    '',
    '_Automatic report (AI analysis unavailable at detection time)._',
  ].join('\n');
}
