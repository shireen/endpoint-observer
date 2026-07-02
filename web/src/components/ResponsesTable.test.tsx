import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

// Row content renders in both the mobile card list and the desktop table, so
// scope row assertions to the table to keep queries unambiguous.
const table = () => within(screen.getByRole('table'));

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
    expect(table().getByText('200')).toBeInTheDocument();
    expect(table().getByText('500')).toBeInTheDocument();
    expect(table().getByText('142ms')).toBeInTheDocument();
    expect(table().getByText('900ms')).toBeInTheDocument();
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
    expect(table().getByText(/timed out/)).toBeInTheDocument();
    expect(table().queryByText('View payload')).not.toBeInTheDocument();
  });

  it('labels timeouts distinctly from other network errors', () => {
    render(
      <ResponsesTable
        responses={[
          sample({ id: 1, statusCode: null, ok: false, error: 'Request timed out after 10000ms' }),
          sample({ id: 2, statusCode: null, ok: false, error: 'fetch failed' }),
        ]}
        loading={false}
      />,
    );
    expect(table().getByText('timeout')).toBeInTheDocument();
    expect(table().getByText('error')).toBeInTheDocument();
  });

  it('opens the drawer for a failed check, showing the sent payload and a no-response note', async () => {
    const user = userEvent.setup();
    render(
      <ResponsesTable
        responses={[
          sample({
            statusCode: null,
            ok: false,
            error: 'Request timed out after 10000ms',
            responseBody: null,
            responseSizeBytes: null,
          }),
        ]}
        loading={false}
      />,
    );

    await user.click(table().getByText(/timed out/));
    const dialog = screen.getByRole('dialog', { name: 'Response detail' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/"event": "search"/)).toBeInTheDocument(); // sent payload
    expect(screen.getByText(/No response was received/)).toBeInTheDocument();
  });

  it('opens the payload drawer on click and closes it again', async () => {
    const user = userEvent.setup();
    render(<ResponsesTable responses={[sample()]} loading={false} />);

    await user.click(table().getByText('View payload'));
    expect(screen.getByRole('dialog', { name: 'Response detail' })).toBeInTheDocument();
    expect(screen.getAllByText(/"event": "search"/).length).toBeGreaterThan(0);

    await user.click(screen.getByLabelText('Close'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
