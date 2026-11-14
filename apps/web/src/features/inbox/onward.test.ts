import { describe, expect, it } from 'vitest';
import { checkOnwardAmount, DUST_FLOOR_YOCTO, ONWARD_HEADROOM_YOCTO, onwardLimits, onwardPreview, sendAllInput, settleOnward, spendState } from './onward';
import { parseNearToYocto } from '../../lib/near-format';

const near = (s: string) => {
  const p = parseNearToYocto(s);
  if (!p.ok) throw new Error(p.error);
  return BigInt(p.yocto);
};

// Testnet values (2026-11-14): announce fee 0.002, minimum 0.01, 20 Tgas reserved at 1e9 yocto/gas = 0.02 NEAR.
const costs = { balanceYocto: near('0.05'), announceFeeYocto: near('0.002'), gasReserveYocto: near('0.02'), minAmountYocto: near('0.01') };

describe('pay onward: amount and fee math', () => {
  it('can pay balance − fee − gas reserve − headroom at most', () => {
    const l = onwardLimits(costs);
    expect(ONWARD_HEADROOM_YOCTO).toBe(near('0.001'));
    expect(l.overheadYocto).toBe(near('0.023'));
    expect(l.maxYocto).toBe(near('0.027'));
    expect(l.canPay).toBe(true);
    expect(sendAllInput(l)).toBe('0.027');
  });

  it('refuses when what is left cannot cover the minimum plus overhead, and says why', () => {
    const l = onwardLimits({ ...costs, balanceYocto: near('0.032') });
    expect(l.canPay).toBe(false);
    expect(l.maxYocto).toBe(near('0.009'));
    expect(l.reason).toMatch(/at least 0\.033 NEAR/);
    expect(onwardLimits({ ...costs, balanceYocto: near('0.01') }).maxYocto).toBe(0n);
  });

  it('validates typed amounts against the minimum and the maximum', () => {
    const l = onwardLimits(costs);
    expect(checkOnwardAmount('', l, costs.minAmountYocto)).toEqual({ ok: false, error: null });
    expect(checkOnwardAmount('0', l, costs.minAmountYocto)).toMatchObject({ ok: false, error: expect.stringMatching(/more than 0/) });
    expect(checkOnwardAmount('0.005', l, costs.minAmountYocto)).toMatchObject({ ok: false, error: expect.stringMatching(/minimum is 0\.01/) });
    expect(checkOnwardAmount('0.0271', l, costs.minAmountYocto)).toMatchObject({ ok: false, error: expect.stringMatching(/at most 0\.027 NEAR/) });
    expect(checkOnwardAmount('0.02', l, costs.minAmountYocto)).toEqual({ ok: true, yocto: near('0.02') });
    expect(checkOnwardAmount(sendAllInput(l), l, costs.minAmountYocto)).toEqual({ ok: true, yocto: near('0.027') });
  });

  it('previews the floor of what stays behind', () => {
    const p = onwardPreview(costs, near('0.02'));
    expect(p.gasReserveYocto).toBe(near('0.021'));
    expect(p.staysAtLeastYocto).toBe(near('0.007'));
    expect(onwardPreview(costs, near('0.027')).staysAtLeastYocto).toBe(0n);
  });

  it('settles from the balances before and after', () => {
    // 0.05 − 0.02 sent − 0.002 fee − 0.0081 network cost = 0.0199 left
    const s = settleOnward(costs, near('0.02'), near('0.0199'));
    expect(s.networkCostYocto).toBe(near('0.0081'));
    expect(s.leftYocto).toBe(near('0.0199'));
    expect(s.leftIsStuck).toBe(true);
    expect(settleOnward({ ...costs, balanceYocto: near('1') }, near('0.1'), near('0.89')).leftIsStuck).toBe(false);
  });
});

describe('pay onward: payment state', () => {
  it('moves from unspent to partially spent to spent', () => {
    expect(spendState({ onwardCount: 0, exists: true, balanceYocto: near('0.05') })).toBe('unspent');
    expect(spendState({ onwardCount: 1, exists: true, balanceYocto: near('0.02') })).toBe('partially-spent');
    expect(spendState({ onwardCount: 1, exists: true, balanceYocto: null })).toBe('partially-spent');
    expect(spendState({ onwardCount: 2, exists: true, balanceYocto: DUST_FLOOR_YOCTO })).toBe('spent');
    expect(spendState({ onwardCount: 1, exists: false, balanceYocto: 0n })).toBe('spent');
  });
});
