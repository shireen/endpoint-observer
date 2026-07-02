import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEventStream } from './useEventStream';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener() {}
  close() {}
}

describe('useEventStream', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  it('refetches all queries when the connection REopens (missed events have no replay)', () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useEventStream(), { wrapper });
    const source = FakeEventSource.instances[0]!;

    act(() => source.onopen?.()); // first connect — nothing missed yet
    expect(result.current).toBe('live');
    expect(invalidate).not.toHaveBeenCalled();

    act(() => source.onerror?.()); // connection drops
    expect(result.current).toBe('reconnecting');

    act(() => source.onopen?.()); // reconnect — reconcile the gap
    expect(result.current).toBe('live');
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
