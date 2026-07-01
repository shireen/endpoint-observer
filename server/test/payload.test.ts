import { describe, expect, it } from 'vitest';
import { generatePayload } from '../src/monitor/payload.js';

describe('generatePayload', () => {
  it('always produces the required base fields', () => {
    for (let i = 0; i < 50; i++) {
      const payload = generatePayload();
      expect(payload.event).toBeTypeOf('string');
      expect(new Date(payload.ts).getTime()).not.toBeNaN();
      expect(payload.requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect(payload.actor.sessionDepth).toBeGreaterThanOrEqual(1);
    }
  });

  it('produces JSON-serializable output', () => {
    const payload = generatePayload();
    expect(() => JSON.stringify(payload)).not.toThrow();
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });

  it('varies payload shape across generations', () => {
    const shapes = new Set(
      Array.from({ length: 100 }, () => Object.keys(generatePayload()).sort().join(',')),
    );
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('generates unique request ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generatePayload().requestId));
    expect(ids.size).toBe(100);
  });
});
