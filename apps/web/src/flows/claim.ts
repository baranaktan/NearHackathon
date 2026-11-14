/**
 * Claim a stealth/invoice account, signed in the browser with the recovered
 * stealth scalar. Same rules as core's `PerdeClient.claim` (fee math from
 * `estimateClaimFee`), but sent through `signAndSend` so a broadcast whose
 * response got lost is looked up by hash instead of failing blindly.
 */
import {
  deleteAccount,
  estimateClaimFee,
  invoiceMatch,
  isImplicitAccountId,
  PerdeError,
  recoverSpendScalar,
  ScalarSigner,
  transfer,
  type Claimable,
  type ClaimFeeEstimate,
  type ClaimMode,
  type SpendKeys,
} from '@perde/core';
import { perde, rpc } from '../lib/perde';
import { signAndSend } from './tx';

export interface ClaimDone {
  txHash: string;
  balanceBefore: bigint;
  /** What left the stealth account: the transfer amount, or the whole balance for a full sweep (fees come out of it). */
  movedYocto: bigint;
  fee: ClaimFeeEstimate;
}

export async function claimStealth(keys: SpendKeys, target: Claimable, destination: string, mode: ClaimMode): Promise<ClaimDone> {
  const match = 'invoiceIndex' in target ? invoiceMatch(keys, target.invoiceIndex) : target;
  const signer = new ScalarSigner(recoverSpendScalar(keys, match));
  const stealthId = signer.accountId;
  if (destination === stealthId) throw new PerdeError('INVALID_ACCOUNT_ID', 'destination is the stealth account itself');
  const [view, destExists, config, gasPrice] = await Promise.all([
    rpc.viewAccountOrNull(stealthId),
    rpc.accountExists(destination),
    perde.claimFeeConfig(),
    rpc.gasPrice(),
  ]);
  if (view === null) throw new PerdeError('INSUFFICIENT_BALANCE', 'nothing to claim: the account does not exist (already swept?)');
  if (!destExists && (mode === 'deleteAccount' || !isImplicitAccountId(destination))) {
    throw new PerdeError('DESTINATION_NOT_FOUND', `destination ${destination} does not exist`);
  }
  const fee = estimateClaimFee({ config, gasPrice, mode, createsDestination: !destExists });
  const balance = view.amount;
  if (mode === 'deleteAccount') {
    if (balance <= fee.expectedFee) throw new PerdeError('INSUFFICIENT_BALANCE', 'balance does not cover the claim fee');
    const outcome = await signAndSend({ signer, signerId: stealthId, receiverId: stealthId, actions: [deleteAccount(destination)] });
    return { txHash: outcome.hash, balanceBefore: balance, movedYocto: balance, fee };
  }
  const amount = balance - fee.reserve;
  if (amount <= 0n) throw new PerdeError('INSUFFICIENT_BALANCE', 'balance does not cover the gas reserve');
  const outcome = await signAndSend({ signer, signerId: stealthId, receiverId: destination, actions: [transfer(amount)] });
  return { txHash: outcome.hash, balanceBefore: balance, movedYocto: amount, fee };
}
