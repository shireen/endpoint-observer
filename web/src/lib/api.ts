import type { ChatMessage, Incident, LlmUsageInfo, MonitorResponse, Stats } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE || '';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchResponses(limit = 50): Promise<{ items: MonitorResponse[] }> {
  return getJson(`/api/responses?limit=${limit}`);
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

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
