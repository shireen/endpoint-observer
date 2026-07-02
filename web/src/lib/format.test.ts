import { describe, expect, it } from 'vitest';
import { formatLatency, formatBytes, latencyToneClass } from './api';

describe('formatLatency', () => {
  it('keeps sub-second values in milliseconds', () => {
    expect(formatLatency(0)).toBe('0ms');
    expect(formatLatency(142)).toBe('142ms');
    expect(formatLatency(999)).toBe('999ms');
    expect(formatLatency(142.7)).toBe('143ms'); // rounds
  });

  it('scales 1s–60s to seconds', () => {
    expect(formatLatency(1000)).toBe('1.00s');
    expect(formatLatency(9999)).toBe('10.00s'); // 2 decimals under 10s
    expect(formatLatency(10005)).toBe('10.0s'); // 1 decimal at/above 10s
    expect(formatLatency(18507)).toBe('18.5s');
  });

  it('scales values over a minute to minutes', () => {
    expect(formatLatency(60_000)).toBe('1.0min');
    expect(formatLatency(2_076_365)).toBe('34.6min');
  });
});

describe('latencyToneClass', () => {
  it('is neutral when healthy, gold when elevated, red when high', () => {
    expect(latencyToneClass(150)).toBe('text-ink');
    expect(latencyToneClass(999)).toBe('text-ink');
    expect(latencyToneClass(1000)).toBe('text-gold-deep'); // elevated at 1s
    expect(latencyToneClass(2999)).toBe('text-gold-deep');
    expect(latencyToneClass(3000)).toBe('text-danger'); // high at 3s
    expect(latencyToneClass(18507)).toBe('text-danger');
  });
});

describe('formatBytes', () => {
  it('handles null, bytes, and kilobytes', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
  });
});
