import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResponsesTable } from './ResponsesTable';
import type { MonitorResponse } from '../types';

function sample(overrides: Partial<MonitorResponse> = {}): MonitorResponse {
  return {
    id: 1,
    createdAt: Date.parse('2026-07-01T10:00:00Z'),
    url: 'https://httpbin.org/anything',
    requestPayload: '{"event":"search"}',
    statusCode: 200,
    latencyMs: 142,
    responseBody: '{"json":{"event":"search"}}',
    responseSizeBytes: 27,
    ok: true,
    error: null,
    ...overrides,
  };
}

describe('ResponsesTable', () => {
  it('shows a loading skeleton', () => {
    render(<ResponsesTable responses={undefined} loading />);
    expect(screen.getByTestId('responses-loading')).toBeInTheDocument();
  });

  it('shows an error state', () => {
    render(<ResponsesTable responses={undefined} loading={false} error="boom" />);
    expect(screen.getByText(/Failed to load responses: boom/)).toBeInTheDocument();
  });

  it('shows an empty state when there are no rows', () => {
    render(<ResponsesTable responses={[]} loading={false} />);
    expect(screen.getByText(/No checks recorded yet/)).toBeInTheDocument();
  });

  it('renders rows with status, latency and size', () => {
    render(
      <ResponsesTable
        responses={[sample(), sample({ id: 2, ok: false, statusCode: 500, latencyMs: 900 })]}
        loading={false}
      />,
    );
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('142ms')).toBeInTheDocument();
    expect(screen.getByText('900ms')).toBeInTheDocument();
  });

  it('shows the error message for failed checks instead of a payload link', () => {
    render(
      <ResponsesTable
        responses={[
          sample({ statusCode: null, ok: false, error: 'Request timed out after 10000ms' }),
        ]}
        loading={false}
      />,
    );
    expect(screen.getByText(/timed out/)).toBeInTheDocument();
    expect(screen.queryByText('View payload')).not.toBeInTheDocument();
  });

  it('opens the payload drawer on click and closes it again', async () => {
    const user = userEvent.setup();
    render(<ResponsesTable responses={[sample()]} loading={false} />);

    await user.click(screen.getByText('View payload'));
    expect(screen.getByRole('dialog', { name: 'Response detail' })).toBeInTheDocument();
    expect(screen.getAllByText(/"event": "search"/).length).toBeGreaterThan(0);

    await user.click(screen.getByLabelText('Close'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
