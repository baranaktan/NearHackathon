import { describe, expect, it, vi } from 'vitest';
import { encodeMetaAddress, keysFromMnemonic } from '@perde/core';
import { checkAmount, classifyRecipientInput, maxSendable, resolveRecipientInput } from './logic';

const META = encodeMetaAddress(keysFromMnemonic('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'));
const NEAR = 10n ** 24n;

describe('recipient', () => {
  it('classifies input', () => {
    expect(classifyRecipientInput('  ')).toEqual({ kind: 'empty' });
    expect(classifyRecipientInput(` ${META} `)).toEqual({ kind: 'meta', metaAddress: META });
    expect(classifyRecipientInput('Alice.Testnet')).toEqual({ kind: 'name', name: 'alice.testnet' });
    expect(classifyRecipientInput('alice.near')).toMatchObject({ kind: 'invalid', message: expect.stringMatching(/mainnet/) });
    expect(classifyRecipientInput('a'.repeat(64))).toMatchObject({ kind: 'invalid', message: expect.stringMatching(/implicit/) });
    expect(classifyRecipientInput('perdeview:abc')).toMatchObject({ kind: 'invalid', message: expect.stringMatching(/viewing key/) });
    const typo = META.slice(0, 20) + (META[20] === 'a' ? 'b' : 'a') + META.slice(21);
    expect(classifyRecipientInput(typo).kind).toBe('invalid');
  });

  it('resolves names through the directory lookup (mocked)', async () => {
    const lookup = vi.fn(async (name: string) => (name === 'bob.testnet' ? META : null));
    await expect(resolveRecipientInput('bob.testnet', lookup)).resolves.toEqual({ status: 'resolved', input: 'bob.testnet', kind: 'name', metaAddress: META, name: 'bob.testnet' });
    await expect(resolveRecipientInput('carol.testnet', lookup)).resolves.toMatchObject({ status: 'invalid' });
    await expect(resolveRecipientInput(META, lookup)).resolves.toMatchObject({ status: 'resolved', kind: 'meta' });
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});

describe('amount', () => {
  const base = { minYocto: NEAR / 100n, feeYocto: 2n * NEAR / 1000n, gasReserveYocto: NEAR / 50n, spendableYocto: NEAR };
  it('validates minimum and balance including fee + gas headroom', () => {
    expect(checkAmount({ ...base, input: '' })).toEqual({ ok: false, error: null });
    expect(checkAmount({ ...base, input: '0' })).toMatchObject({ ok: false, error: 'Amount must be more than 0' });
    expect(checkAmount({ ...base, input: '0.005' })).toMatchObject({ ok: false, error: expect.stringMatching(/minimum is 0.01/) });
    expect(checkAmount({ ...base, input: '0.99' })).toMatchObject({ ok: false, error: expect.stringMatching(/Not enough balance/) });
    expect(checkAmount({ ...base, input: '0.5' })).toEqual({ ok: true, yocto: NEAR / 2n });
    expect(checkAmount({ ...base, spendableYocto: null, input: '50' })).toEqual({ ok: true, yocto: 50n * NEAR });
  });
  it('computes the max button value', () => {
    expect(maxSendable(NEAR, 2n, 3n)).toBe(NEAR - 5n);
    expect(maxSendable(1n, 2n, 3n)).toBe(0n);
  });
});
