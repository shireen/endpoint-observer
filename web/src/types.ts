// API contract types — mirror server/src/db repositories' record shapes.

export interface MonitorResponse {
  id: number;
  createdAt: number;
  url: string;
  requestPayload: string;
  statusCode: number | null;
  latencyMs: number;
  responseBody: string | null;
  responseSizeBytes: number | null;
  ok: boolean;
  error: string | null;
}

export interface Stats {
  count: number;
  okCount: number;
  failedCount: number;
  avgLatencyMs: number | null;
  minLatencyMs: number | null;
  maxLatencyMs: number | null;
  p95LatencyMs: number | null;
}

export interface Incident {
  id: number;
  createdAt: number;
  responseId: number | null;
  severity: 'warning' | 'critical';
  endpoint: string;
  latencyMs: number;
  baselineMs: number;
  summary: string;
  analysis: string | null;
  analysisSource: 'pending' | 'llm' | 'fallback';
  /** Repeated anomalies group into one incident instead of duplicating. */
  occurrences: number;
  lastSeenAt: number;
}

export interface LlmUsageInfo {
  enabled: boolean;
  model: string;
  callsPerHour: number;
  remainingCallsThisHour: number;
  usage: {
    totalCalls: number;
    callsLastHour: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalEstimatedCostUsd: number;
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  source?: 'llm' | 'cache' | 'fallback';
}
