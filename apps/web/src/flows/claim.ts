/**
 * Claim a stealth/invoice account, signed in the browser with the recovered
 * stealth scalar, through core's `PerdeClient.claim` (fee math from
 * `estimateClaimFee`; a broadcast whose response got lost is looked up by
 * hash, and errors after signing carry the hash).
 */
import { invoiceMatch, recoverSpendScalar, ScalarSigner, type Claimable, type ClaimFeeEstimate, type ClaimMode, type SpendKeys } from '@perde/core';
import { perde } from '../lib/perde';
import type { TxStep } from './tx';

export interface ClaimDone {
  txHash: string;
  balanceBefore: bigint;
  /** What left the stealth account: the transfer amount, or the whole balance for a full sweep (fees come out of it). */
  movedYocto: bigint;
  fee: ClaimFeeEstimate;
}

/** The stealth account's own signer (its key is derived from the spend key and the announcement or invoice index). */
export function stealthSigner(keys: SpendKeys, target: Claimable): ScalarSigner {
  const match = 'invoiceIndex' in target ? invoiceMatch(keys, target.invoiceIndex) : target;
  return new ScalarSigner(recoverSpendScalar(keys, match));
}

export async function claimStealth(keys: SpendKeys, target: Claimable, destination: string, mode: ClaimMode, onStep?: (s: TxStep) => void): Promise<ClaimDone> {
  onStep?.('sign');
  const res = await perde.claim(keys, target, destination, { mode, onTxHash: () => onStep?.('broadcast') });
  return { txHash: res.txHash, balanceBefore: res.balanceBefore, movedYocto: res.amountYocto, fee: res.fee };
}
