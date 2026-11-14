import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LedgerExhibit } from './LedgerExhibit';

describe('LedgerExhibit', () => {
  it('is labelled as an illustration and swaps the exposed recipient for a fresh account', async () => {
    render(<LedgerExhibit />);
    expect(screen.getByText('Illustration')).toBeInTheDocument();
    expect(screen.getAllByText('alice.near').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('tab', { name: 'With Perde' }));

    expect(await screen.findByText(/never appeared on-chain before/, {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.queryByText('alice.near')).not.toBeInTheDocument();
    expect(await screen.findByText(/Alice’s view/, {}, { timeout: 2000 })).toBeInTheDocument();
  });
});
