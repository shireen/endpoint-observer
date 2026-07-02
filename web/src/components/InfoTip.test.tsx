import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InfoTip } from './InfoTip';

const TEXT = '95% of responses were faster than this.';

describe('InfoTip', () => {
  it('exposes an accessible trigger and hides the tip by default', () => {
    render(<InfoTip label="p95 latency" text={TEXT} />);
    expect(screen.getByRole('button', { name: 'What is p95 latency?' })).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('opens on tap/click', () => {
    render(<InfoTip label="p95 latency" text={TEXT} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('95% of responses were faster');
  });

  it('opens on keyboard focus and closes on blur', () => {
    render(<InfoTip label="Avg latency" text={TEXT} />);
    const trigger = screen.getByRole('button');
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('dismisses on Escape', () => {
    render(<InfoTip label="Avg latency" text={TEXT} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('dismisses on an outside click', () => {
    render(<InfoTip label="Avg latency" text={TEXT} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
