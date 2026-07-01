import type { NewResponse } from '../db/responses.js';

export interface PingOptions {
  url: string;
  timeoutMs: number;
  payload: unknown;
  /** Injectable for tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
}

/**
 * Sends one monitored request and normalizes every outcome — success, HTTP
 * error, timeout, network failure — into a storable record. This function
 * never throws: a failed ping is data, not an exception.
 */
export async function pingOnce(options: PingOptions): Promise<NewResponse> {
  const { url, timeoutMs, payload, fetchFn = fetch } = options;
  const requestPayload = JSON.stringify(payload);
  const startedAt = Date.now();
  const start = performance.now();

  try {
    const response = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestPayload,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    const latencyMs = Math.round(performance.now() - start);
    return {
      createdAt: startedAt,
      url,
      requestPayload,
      statusCode: response.status,
      latencyMs,
      responseBody: body,
      responseSizeBytes: Buffer.byteLength(body, 'utf8'),
      ok: response.ok,
      error: null,
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const isTimeout = err instanceof DOMException && err.name === 'TimeoutError';
    return {
      createdAt: startedAt,
      url,
      requestPayload,
      statusCode: null,
      latencyMs,
      responseBody: null,
      responseSizeBytes: null,
      ok: false,
      error: isTimeout
        ? `Request timed out after ${timeoutMs}ms`
        : err instanceof Error
          ? err.message
          : String(err),
    };
  }
}
