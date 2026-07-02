import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { SseHub } from '../src/realtime/sse.js';

/** Minimal Express.Response stand-in backed by an EventEmitter. */
function fakeRes(write: () => boolean = () => true): Response & EventEmitter {
  const res = new EventEmitter() as Response & EventEmitter;
  res.writeHead = vi.fn().mockReturnValue(res) as unknown as Response['writeHead'];
  res.write = vi.fn(write) as unknown as Response['write'];
  res.end = vi.fn() as unknown as Response['end'];
  return res;
}

describe('SseHub', () => {
  it('registers a client and sends the initial comment', () => {
    const hub = new SseHub();
    const res = fakeRes();
    hub.addClient(res);
    expect(hub.clientCount).toBe(1);
    expect(res.write).toHaveBeenCalledWith(': connected\n\n');
  });

  it('removes a client on close', () => {
    const hub = new SseHub();
    const res = fakeRes();
    hub.addClient(res);
    res.emit('close');
    expect(hub.clientCount).toBe(0);
  });

  it("handles an unclean disconnect ('error') without throwing or crashing", () => {
    const hub = new SseHub();
    const res = fakeRes();
    hub.addClient(res);
    // An unhandled 'error' on an EventEmitter throws; the hub must listen for it.
    expect(() => res.emit('error', new Error('ECONNRESET'))).not.toThrow();
    expect(hub.clientCount).toBe(0);
  });

  it('drops a client whose write fails on connect without throwing', () => {
    const hub = new SseHub();
    const res = fakeRes(() => {
      throw new Error('EPIPE');
    });
    expect(() => hub.addClient(res)).not.toThrow();
    expect(hub.clientCount).toBe(0);
  });

  it('broadcasts to healthy clients and drops ones that break later', () => {
    const hub = new SseHub();
    const good = fakeRes();
    // Connects fine (first write), then breaks on the broadcast write.
    let calls = 0;
    const flaky = fakeRes(() => {
      calls += 1;
      if (calls > 1) throw new Error('EPIPE');
      return true;
    });
    hub.addClient(good);
    hub.addClient(flaky);
    expect(hub.clientCount).toBe(2);

    expect(() => hub.broadcast('response', { id: 1 })).not.toThrow();
    expect(hub.clientCount).toBe(1); // flaky one dropped
    expect(good.write).toHaveBeenCalledWith('event: response\ndata: {"id":1}\n\n');
  });
});
