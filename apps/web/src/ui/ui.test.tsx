import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';
import { SecretPhrase } from './SecretPhrase';
import { Tabs } from './Tabs';
import { AmountInput } from './AmountInput';
import { AddressChip } from './AddressChip';
import { Field, Input } from './Field';

const HEX = 'f1746fde79b38d7a2ca71e273164a5d4b4e5c13511af89f242409608a1261e84';
const WORDS = ['velvet', 'harbor', 'lantern', 'quiet', 'orbit', 'meadow', 'stage', 'copper', 'whisper', 'ladder', 'autumn', 'ribbon'];

describe('Button', () => {
  it('is busy and disabled while loading, announcing the label', () => {
    render(
      <Button loading loadingLabel="Sending">
        Send
      </Button>,
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Sending')).toBeInTheDocument();
  });
});

describe('SecretPhrase', () => {
  it('keeps words out of the DOM until revealed', async () => {
    render(<SecretPhrase words={WORDS} />);
    expect(screen.queryByText('lantern')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /reveal recovery phrase/i }));
    expect(screen.getByText('lantern')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /hide/i }));
    expect(screen.queryByText('lantern')).not.toBeInTheDocument();
  });
});

describe('Tabs', () => {
  function Harness() {
    const [v, setV] = useState<'a' | 'b'>('a');
    return <Tabs aria-label="Views" value={v} onChange={setV} items={[{ value: 'a', label: 'Without' }, { value: 'b', label: 'With' }]} />;
  }
  it('moves selection and focus with arrow keys', async () => {
    render(<Harness />);
    const [a, b] = screen.getAllByRole('tab');
    expect(a).toHaveAttribute('aria-selected', 'true');
    a?.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(b).toHaveAttribute('aria-selected', 'true');
    expect(b).toHaveFocus();
    expect(a).toHaveAttribute('tabindex', '-1');
  });
});

describe('AmountInput', () => {
  function Harness() {
    const [v, setV] = useState('');
    return (
      <Field label="Amount">
        {(p) => <AmountInput {...p} value={v} onValueChange={setV} />}
      </Field>
    );
  }
  it('is labelled and sanitises typed text', async () => {
    render(<Harness />);
    const input = screen.getByLabelText('Amount');
    await userEvent.type(input, '1,5x.2');
    expect(input).toHaveValue('1.52');
  });
});

describe('Field', () => {
  it('wires error text to the control', () => {
    render(<Field label="Recipient" error="No meta-address">{(p) => <Input {...p} />}</Field>);
    const input = screen.getByLabelText('Recipient');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('No meta-address');
  });
});

describe('AddressChip', () => {
  it('middle-truncates stealth accounts but not named accounts', () => {
    render(
      <>
        <AddressChip value={HEX} copy={false} />
        <AddressChip value="perde-demo-alice.testnet" copy={false} />
      </>,
    );
    expect(screen.getByText('f1746f…261e84')).toBeInTheDocument();
    expect(screen.getByText('perde-demo-alice.testnet')).toBeInTheDocument();
  });
});
