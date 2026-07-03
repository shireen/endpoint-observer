import type { ChatMessage, Incident, LlmUsageInfo, MonitorResponse, Stats } from '../types';
export { formatTime } from './time';

const API_BASE = import.meta.env.VITE_API_BASE || '';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchResponses(
  limit = 50,
  opts: { before?: number; hours?: number } = {},
): Promise<{ items: MonitorResponse[] }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (opts.before !== undefined) params.set('before', String(opts.before));
  if (opts.hours !== undefined) params.set('hours', String(opts.hours));
  return getJson(`/api/responses?${params}`);
}

export function fetchStats(hours = 24): Promise<Stats> {
  return getJson(`/api/stats?hours=${hours}`);
}

export function fetchIncidents(): Promise<{ items: Incident[] }> {
  return getJson('/api/incidents');
}

export function fetchLlmUsage(): Promise<LlmUsageInfo> {
  return getJson('/api/llm/usage');
}

export function streamUrl(): string {
  return `${API_BASE}/api/stream`;
}

/**
 * Sends a chat message and consumes the server's SSE-framed streaming reply.
 * Calls onDelta for each text chunk; resolves with the answer's source.
 */
export async function sendChat(
  message: string,
  history: ChatMessage[],
  onDelta: (text: string) => void,
): Promise<'llm' | 'cache' | 'fallback'> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      history: history.map(({ role, content }) => ({ role, content })),
    }),
  });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Chat request failed with status ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let source: 'llm' | 'cache' | 'fallback' = 'llm';

  const processFrame = (frame: string) => {
    const eventMatch = frame.match(/^event: (.+)$/m);
    const dataMatch = frame.match(/^data: (.+)$/m);
    if (!eventMatch || !dataMatch) return;
    const data = JSON.parse(dataMatch[1]!) as { text?: string; source?: typeof source };
    if (eventMatch[1] === 'delta' && data.text) onDelta(data.text);
    if (eventMatch[1] === 'done' && data.source) source = data.source;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      processFrame(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
    }
  }
  return source;
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Formats a latency for display, adaptively scaling the unit for readability
 * (ms is kept as the canonical stored unit; this only affects presentation).
 * Sub-second values stay in ms; slower ones scale to s / min so a degraded
 * response reads at a glance instead of as a wall of digits.
 */
export function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
  return `${(ms / 60_000).toFixed(1)}min`;
}

/**
 * Latency severity thresholds (ms) used to color latency values. Kept as
 * named constants so the "what counts as slow" policy lives in one place and
 * is easy to tune. httpbin normally answers in ~150–350ms, so 1s is already
 * several times baseline and 3s is clearly bad.
 */
export const LATENCY_ELEVATED_MS = 1000;
export const LATENCY_HIGH_MS = 3000;

export type LatencySeverity = 'normal' | 'elevated' | 'high';

export function latencySeverity(ms: number): LatencySeverity {
  if (ms >= LATENCY_HIGH_MS) return 'high';
  if (ms >= LATENCY_ELEVATED_MS) return 'elevated';
  return 'normal';
}

/** Tailwind text-color class for a severity. */
export function severityToneClass(severity: LatencySeverity): string {
  if (severity === 'high') return 'text-danger';
  if (severity === 'elevated') return 'text-gold-deep';
  return 'text-ink';
}

/**
 * Tailwind text-color class for a latency value: neutral when healthy, gold
 * when elevated, red when high. Urgency is signalled by color (honest,
 * threshold-based) — paired with a shape icon so it's not color-only (WCAG
 * 1.4.1).
 */
export function latencyToneClass(ms: number): string {
  return severityToneClass(latencySeverity(ms));
}
