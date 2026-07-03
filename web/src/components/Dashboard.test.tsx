import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from './Dashboard';
import type { MonitorResponse } from '../types';
import * as api from '../lib/api';

vi.mock('../lib/api', async (importActual) => ({
  ...(await importActual<typeof api>()),
  fetchResponses: vi.fn(),
  fetchStats: vi.fn(),
  fetchLlmUsage: vi.fn(),
}));

function rows(fromId: number, count: number): MonitorResponse[] {
  return Array.from({ length: count }, (_, i) => ({
    id: fromId - i,
    createdAt: Date.now() - i * 60_000,
    url: 'https://httpbin.org/anything',
    requestPayload: '{}',
    statusCode: 200,
    latencyMs: 150,
    responseBody: '{}',
    responseSizeBytes: 100,
    ok: true,
    error: null,
  }));
}

function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<Dashboard />, { wrapper });
}

const bodyRowCount = () => document.querySelectorAll('tbody tr').length;

describe('Dashboard pagination (Load older checks, capped at 24h)', () => {
  beforeEach(() => {
    vi.mocked(api.fetchStats).mockResolvedValue({
      count: 100,
      okCount: 100,
      failedCount: 0,
      avgLatencyMs: 150,
      minLatencyMs: 100,
      maxLatencyMs: 300,
      p95LatencyMs: 250,
    });
    vi.mocked(api.fetchLlmUsage).mockResolvedValue({
      enabled: false,
      model: 'claude-haiku-4-5',
      callsPerHour: 20,
      remainingCallsThisHour: 20,
      usage: {
        totalCalls: 0,
        callsLastHour: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalEstimatedCostUsd: 0,
      },
    });
  });

  it('appends older pages within 24h and stops when history is exhausted', async () => {
    const user = userEvent.setup();
    vi.mocked(api.fetchResponses)
      .mockResolvedValueOnce({ items: rows(100, 50) }) // initial head
      .mockResolvedValueOnce({ items: rows(50, 50) }) // full older page
      .mockResolvedValueOnce({ items: rows(0, 0) }); // empty → exhausted

    renderDashboard();
    await waitFor(() => expect(bodyRowCount()).toBe(50));

    await user.click(screen.getByRole('button', { name: 'Load older checks' }));
    await waitFor(() => expect(bodyRowCount()).toBe(100));
    // Older pages are cursor-scoped to the 24h window.
    expect(api.fetchResponses).toHaveBeenLastCalledWith(50, { before: 51, hours: 24 });

    await user.click(screen.getByRole('button', { name: 'Load older checks' }));
    await waitFor(() => expect(screen.getByText(/Full 24-hour history loaded/)).toBeVisible());
    expect(api.fetchResponses).toHaveBeenLastCalledWith(50, { before: 1, hours: 24 });
    expect(screen.queryByRole('button', { name: 'Load older checks' })).not.toBeInTheDocument();
  });

  it('hides the control when there is nothing older than the first page', async () => {
    vi.mocked(api.fetchResponses).mockResolvedValueOnce({ items: rows(10, 10) });

    renderDashboard();
    await waitFor(() => expect(bodyRowCount()).toBe(10));
    expect(screen.queryByRole('button', { name: 'Load older checks' })).not.toBeInTheDocument();
  });
});
