import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { streamUrl } from '../lib/api';
import type { Incident, MonitorResponse } from '../types';

export type ConnectionState = 'connecting' | 'live' | 'reconnecting';

/**
 * Subscribes to the server's SSE stream and merges pushed rows straight into
 * the TanStack Query cache, so every view updates without refetching.
 * EventSource reconnects automatically — we just surface its state.
 */
export function useEventStream(): ConnectionState {
  const [state, setState] = useState<ConnectionState>('connecting');
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource(streamUrl());

    source.onopen = () => setState('live');
    source.onerror = () => setState('reconnecting');

    source.addEventListener('response', (event) => {
      const record = JSON.parse((event as MessageEvent).data) as MonitorResponse;
      queryClient.setQueryData<{ items: MonitorResponse[] }>(['responses'], (old) =>
        old ? { items: [record, ...old.items.filter((r) => r.id !== record.id)] } : old,
      );
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
    });

    source.addEventListener('incident', (event) => {
      const incident = JSON.parse((event as MessageEvent).data) as Incident;
      queryClient.setQueryData<{ items: Incident[] }>(['incidents'], (old) => {
        if (!old) return old;
        const exists = old.items.some((i) => i.id === incident.id);
        return {
          items: exists
            ? old.items.map((i) => (i.id === incident.id ? incident : i))
            : [incident, ...old.items],
        };
      });
      void queryClient.invalidateQueries({ queryKey: ['llmUsage'] });
    });

    return () => source.close();
  }, [queryClient]);

  return state;
}
