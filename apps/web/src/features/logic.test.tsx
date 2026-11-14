import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createReceipt, deriveStealth, encodeMetaAddress, keysFromMnemonic, type Announcement } from '@perde/core';
import { initialState } from '../state/schema';
import { buildVerification } from './verify/logic';
import { entryStatus } from './audit/useAudit';
import { statusOf } from './invoice/useInvoice';
import { demoProgress, demoSteps } from './demo/steps';

// Core's network-facing parts are mocked; only pure crypto runs for real.
vi.mock('../lib/perde', () => ({
  getContractConfig: vi.fn(async () => ({ announceFee: 2n * 10n ** 21n, minAmount: 10n ** 22n, version: '1.0.0' })),
  sendGasReserve: vi.fn(async (n: number) => BigInt(n) * 2n * 10n ** 22n),
}));

const keys = keysFromMnemonic('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
const META = encodeMetaAddress(keys);

describe('useSendLimits (core mocked)', () => {
  it('loads fee, minimum and gas headroom', async () => {
    const { useSendLimits } = await import('../lib/useSendLimits');
    const { result } = renderHook(() => useSendLimits());
    await waitFor(() => expect(result.current.limits).not.toBeNull());
    expect(result.current.limits).toEqual({ minAmountYocto: 10n ** 22n, announceFeeYocto: 2n * 10n ** 21n, gasPerSendYocto: 2n * 10n ** 22n, version: '1.0.0' });
    expect(result.current.error).toBeNull();
  });
});

describe('receipt verification checklist', () => {
  const d = deriveStealth(META);
  const receipt = createReceipt({ meta: META, r: d.r, stealthAccountId: d.stealthAccountId, tx: 'TxHash' });
  const ann: Announcement = { index: 12, stealthAccountId: d.stealthAccountId, ephemeralPk: d.ephemeralPk, viewTag: d.viewTag, amount: 5n * 10n ** 22n, timestampMs: 1 };

  it('verifies against a matching announcement', () => {
    const s = buildVerification(receipt, { contractId: 'perde-pay.testnet', announcementCount: 20, announcement: ann, balanceYocto: 0n });
    expect(s.status).toBe('verified');
    if (s.status === 'verified') {
      expect(s.checks.map((c) => c.status)).toEqual(['pass', 'pass', 'pass', 'pass', 'info']);
      expect(s.summary).toMatchObject({ stealthAccount: d.stealthAccountId, amountYocto: ann.amount.toString(), txHash: 'TxHash' });
    }
  });

  it('fails when nothing was announced, or the announcement does not match', () => {
    expect(buildVerification(receipt, { contractId: 'c', announcementCount: 20, announcement: undefined, balanceYocto: 1n }).status).toBe('failed');
    const other = deriveStealth(META);
    const s = buildVerification(receipt, { contractId: 'c', announcementCount: 20, announcement: { ...ann, ephemeralPk: other.ephemeralPk }, balanceYocto: 1n });
    expect(s.status).toBe('failed');
  });

  it('reports unreadable input as invalid', () => {
    expect(buildVerification('perdereceipt:@@', { contractId: 'c', announcementCount: 0, announcement: undefined, balanceYocto: 0n }).status).toBe('invalid');
  });
});

describe('status helpers', () => {
  it('audit: held / partial / moved', () => {
    expect(entryStatus(10n, 10n, true)).toBe('held');
    expect(entryStatus(10n, 3n, true)).toBe('partial');
    expect(entryStatus(10n, 0n, true)).toBe('moved');
    expect(entryStatus(10n, 0n, false)).toBe('moved');
  });

  it('invoice: checking / open / partial / paid / claimed', () => {
    expect(statusOf('10', undefined, false)).toBe('checking');
    expect(statusOf('10', { exists: false, balanceYocto: 0n }, false)).toBe('open');
    expect(statusOf('10', { exists: true, balanceYocto: 4n }, false)).toBe('partial');
    expect(statusOf('10', { exists: true, balanceYocto: 10n }, false)).toBe('paid');
    expect(statusOf(null, { exists: true, balanceYocto: 1n }, false)).toBe('paid');
    expect(statusOf('10', undefined, true)).toBe('claimed');
  });
});

describe('guided demo steps', () => {
  it('tick off only from real state', () => {
    const empty = demoSteps(initialState(), null);
    expect(demoProgress(empty)).toMatchObject({ done: 0, total: 6 });
    const s = {
      ...initialState(),
      wallet: { accountId: 'w.testnet', secretKey: 'ed25519:k', source: 'import' as const, addedAtMs: 0 },
      identity: { mnemonic: 'm', confirmed: true, createdAtMs: 0 },
      scan: { metaAddress: META, nextIndex: 3, payments: [{ index: 1, stealthAccount: 'a'.repeat(64), ephemeralPk: 'b'.repeat(64), viewTag: 1, amountYocto: '1', timestampMs: 0 }], scannedAtMs: 0 },
    };
    const steps = demoSteps(s, META);
    expect(steps.filter((x) => x.done).map((x) => x.id)).toEqual(['wallet', 'identity', 'inbox']);
    expect(steps.find((x) => x.id === 'send')?.to).toContain('/app/send?to=perde');
    expect(demoProgress(steps).next?.id).toBe('send');
  });
});
