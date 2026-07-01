import { describe, expect, it } from 'vitest';
import { pingOnce } from '../src/monitor/pinger.js';
import { okFetch } from './helpers.js';

const BASE = { url: 'https://httpbin.org/anything', timeoutMs: 1000, payload: { a: 1 } };

describe('pingOnce', () => {
  it('records a successful response with status, latency, body and size', async () => {
    const result = await pingOnce({ ...BASE, fetchFn: okFetch('{"json":{"a":1}}') });
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.responseBody).toBe('{"json":{"a":1}}');
    expect(result.responseSizeBytes).toBe(16);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeNull();
    expect(JSON.parse(result.requestPayload)).toEqual({ a: 1 });
  });

  it('sends the payload as a JSON POST body', async () => {
    let captured: RequestInit | undefined;
    const fetchFn = (async (_url: unknown, init?: RequestInit) => {
      captured = init;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    await pingOnce({ ...BASE, payload: { hello: 'world' }, fetchFn });
    expect(captured?.method).toBe('POST');
    expect(captured?.body).toBe('{"hello":"world"}');
    expect((captured?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('records an HTTP error status as a failed (but stored) result', async () => {
    const result = await pingOnce({ ...BASE, fetchFn: okFetch('oops', 500) });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.responseBody).toBe('oops');
    expect(result.error).toBeNull();
  });

  it('normalizes a timeout into a stored failure, not an exception', async () => {
    const fetchFn = (async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    }) as unknown as typeof fetch;

    const result = await pingOnce({ ...BASE, fetchFn });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBeNull();
    expect(result.error).toContain('timed out after 1000ms');
  });

  it('normalizes network errors into a stored failure', async () => {
    const fetchFn = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    const result = await pingOnce({ ...BASE, fetchFn });
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBeNull();
    expect(result.responseBody).toBeNull();
    expect(result.error).toBe('fetch failed');
  });
});
