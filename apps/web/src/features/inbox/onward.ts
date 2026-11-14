/**
 * Pure math and state for "Pay someone from here": a stealth account pays a
 * Perde `send` itself (signed with its derived scalar), so the money moves
 * stealth → fresh stealth without ever touching a named account.
 */
import { estimateClaimFee, FALLBACK_FEE_CONFIG } from '@perde/core';
import { formatYocto, parseNearToYocto } from '../../lib/near-format';

/**
 * Margin for the transaction's own conversion fee, which is burnt before the
 * prepaid gas is reserved (a `send` call converts ≈0.31 Tgas: about
 * 0.00003 NEAR at testnet's 1e8 yocto/gas). 0.001 NEAR leaves room for gas
 * price swings.
 */
export const ONWARD_HEADROOM_YOCTO = 10n ** 21n;

/**
 * Below this balance a stealth account holds nothing worth moving: a full
 * sweep (DeleteAccount) would cost about as much as it moves.
 */
export const DUST_FLOOR_YOCTO = estimateClaimFee({ config: FALLBACK_FEE_CONFIG, gasPrice: 100_000_000n, mode: 'deleteAccount', createsDestination: false }).expectedFee * 2n;

export interface OnwardCosts {
  /** Live balance of the stealth account. */
  balanceYocto: bigint;
  /** Contract `announce_fee`, added to the deposit. */
  announceFeeYocto: bigint;
  /** Prepaid gas for one `send`, reserved up front at max(gas price, min purchase price); unused gas is refunded. */
  gasReserveYocto: bigint;
  /** Contract `min_amount`. */
  minAmountYocto: bigint;
}

export interface OnwardLimits {
  /** Largest amount the account can pay onward right now (0 if none). */
  maxYocto: bigint;
  /** Everything the transaction needs on top of the amount: fee + gas reserve + headroom. */
  overheadYocto: bigint;
  canPay: boolean;
  /** Why it can't pay onward, if so. */
  reason: string | null;
}

export function onwardLimits(c: OnwardCosts): OnwardLimits {
  const overhead = c.announceFeeYocto + c.gasReserveYocto + ONWARD_HEADROOM_YOCTO;
  const max = c.balanceYocto > overhead ? c.balanceYocto - overhead : 0n;
  if (max < c.minAmountYocto) {
    return {
      maxYocto: max,
      overheadYocto: overhead,
      canPay: false,
      reason: `Paying onward needs at least ${formatYocto(c.minAmountYocto + overhead, { maxFractionDigits: 4 })} NEAR here: the ${formatYocto(c.minAmountYocto)} NEAR minimum, the ${formatYocto(c.announceFeeYocto)} NEAR announcement fee and ${formatYocto(c.gasReserveYocto + ONWARD_HEADROOM_YOCTO, { maxFractionDigits: 4 })} NEAR of gas the network reserves up front. This account has ${formatYocto(c.balanceYocto, { maxFractionDigits: 5 })} NEAR.`,
    };
  }
  return { maxYocto: max, overheadYocto: overhead, canPay: true, reason: null };
}

export type OnwardAmount = { ok: true; yocto: bigint } | { ok: false; error: string | null };

/** null error = nothing typed yet. */
export function checkOnwardAmount(input: string, limits: OnwardLimits, minAmountYocto: bigint): OnwardAmount {
  if (input.trim() === '') return { ok: false, error: null };
  const parsed = parseNearToYocto(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const yocto = BigInt(parsed.yocto);
  if (yocto === 0n) return { ok: false, error: 'Amount must be more than 0' };
  if (yocto < minAmountYocto) return { ok: false, error: `The minimum is ${formatYocto(minAmountYocto)} NEAR per payment` };
  if (yocto > limits.maxYocto) return { ok: false, error: `This account can pay at most ${formatYocto(limits.maxYocto, { maxFractionDigits: 6 })} NEAR after fee and gas` };
  return { ok: true, yocto };
}

/** "Send all" as an exact decimal string (the input field's value). */
export function sendAllInput(limits: OnwardLimits): string {
  return formatYocto(limits.maxYocto, { maxFractionDigits: 24, group: false });
}

export interface OnwardPreview {
  amountYocto: bigint;
  announceFeeYocto: bigint;
  gasReserveYocto: bigint;
  /**
   * What stays in the stealth account if the transaction burnt every bit of
   * reserved gas (a floor: the unused part comes back as a refund).
   */
  staysAtLeastYocto: bigint;
}

export function onwardPreview(c: OnwardCosts, amountYocto: bigint): OnwardPreview {
  const left = c.balanceYocto - amountYocto - c.announceFeeYocto - c.gasReserveYocto - ONWARD_HEADROOM_YOCTO;
  return { amountYocto, announceFeeYocto: c.announceFeeYocto, gasReserveYocto: c.gasReserveYocto + ONWARD_HEADROOM_YOCTO, staysAtLeastYocto: left > 0n ? left : 0n };
}

export interface OnwardSettlement {
  /** Network cost actually paid: gas burnt plus the protocol's charge for creating the new account. */
  networkCostYocto: bigint;
  /** What the stealth account holds now. */
  leftYocto: bigint;
  /** The leftover is too small to pay onward again. */
  leftIsStuck: boolean;
}

/** Account for one onward payment from the balances read before and after it. */
export function settleOnward(c: OnwardCosts, amountYocto: bigint, balanceAfterYocto: bigint): OnwardSettlement {
  const cost = c.balanceYocto - amountYocto - c.announceFeeYocto - balanceAfterYocto;
  const after = onwardLimits({ ...c, balanceYocto: balanceAfterYocto });
  return { networkCostYocto: cost > 0n ? cost : 0n, leftYocto: balanceAfterYocto, leftIsStuck: !after.canPay };
}

export type SpendState = 'unspent' | 'partially-spent' | 'spent';

/**
 * Where a received payment stands after onward payments from it:
 * untouched, partly paid onward (something worth moving is left), or spent
 * (gone, or only dust below the cost of moving it).
 */
export function spendState(p: { onwardCount: number; exists: boolean | null; balanceYocto: bigint | null }): SpendState {
  if (p.onwardCount === 0) return 'unspent';
  if (p.exists === false || (p.balanceYocto !== null && p.balanceYocto <= DUST_FLOOR_YOCTO)) return 'spent';
  return 'partially-spent';
}
