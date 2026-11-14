/**
 * Sign in the browser, broadcast, wait for execution. Mirrors core's
 * `sendActions` (retry on InvalidNonce) but reports progress and keeps the
 * transaction hash when the network fails after the broadcast, so the UI can
 * point at the explorer instead of inviting a double payment.
 */
import { buildSignedTransaction, isPerdeError, PerdeError, pollUntil, type Action, type Signer, type TxOutcome } from '@perde/core';
import { rpc } from '../lib/perde';

export type TxStep = 'sign' | 'broadcast' | 'confirm';

/** The transaction was signed and sent, but no node confirmed its outcome. It may still land. */
export class UnconfirmedTxError extends Error {
  readonly txHash: string;
  readonly cause: unknown;
  constructor(txHash: string, cause: unknown) {
    super(`Transaction ${txHash} was broadcast but not confirmed in time. Check the explorer before trying again.`);
    this.name = 'UnconfirmedTxError';
    this.txHash = txHash;
    this.cause = cause;
  }
}

export function txHashOf(e: unknown): string | null {
  if (e instanceof UnconfirmedTxError) return e.txHash;
  if (isPerdeError(e) && typeof e.details === 'object' && e.details !== null && 'hash' in e.details) {
    const h = (e.details as { hash?: unknown }).hash;
    return typeof h === 'string' ? h : null;
  }
  return null;
}

function isInvalidNonce(e: unknown): boolean {
  if (!isPerdeError(e, 'TX_FAILED')) return false;
  try {
    return JSON.stringify(e.details, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)).includes('InvalidNonce');
  } catch {
    return false;
  }
}

/** Outcome of a transaction by hash, polling briefly; null if no node knows it. */
async function lookUp(hash: string, signerId: string): Promise<TxOutcome | null> {
  try {
    return await pollUntil(
      () => rpc.txStatus(hash, signerId, 'EXECUTED_OPTIMISTIC'),
      (o) => o.finalExecutionStatus !== 'NONE' && o.finalExecutionStatus !== 'INCLUDED',
      { timeoutMs: 12_000, intervalMs: 1500, retryOn: () => true, what: 'the transaction' },
    );
  } catch {
    return null;
  }
}

export interface SignAndSendParams {
  signer: Signer;
  signerId: string;
  receiverId: string;
  actions: readonly Action[];
  onStep?: (step: TxStep) => void;
}

export async function signAndSend({ signer, signerId, receiverId, actions, onStep }: SignAndSendParams): Promise<TxOutcome> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    onStep?.('sign');
    const stx = await buildSignedTransaction({ rpc, signer, signerId, receiverId, actions });
    onStep?.('broadcast');
    try {
      return await rpc.sendTransaction(stx, 'EXECUTED_OPTIMISTIC');
    } catch (e) {
      if (isInvalidNonce(e)) {
        last = e;
        continue;
      }
      // The response was lost (endpoint failure, odd HTTP status): the transaction may still
      // have landed. Look it up by hash before reporting anything.
      if (isPerdeError(e, 'RPC_UNAVAILABLE') || isPerdeError(e, 'RPC_ERROR')) {
        const landed = await lookUp(stx.hash, signerId);
        if (landed?.success) return landed;
        if (landed) throw new PerdeError('TX_FAILED', `transaction ${landed.hash} failed`, { hash: landed.hash, outcome: landed });
        throw new UnconfirmedTxError(stx.hash, e);
      }
      throw e;
    }
  }
  throw last;
}

/** The JSON number a contract method returned (Perde `send` returns the announcement index). */
export function returnedNumber(outcome: TxOutcome): number | null {
  if (!outcome.successValue || outcome.successValue.length === 0) return null;
  try {
    const v: unknown = JSON.parse(new TextDecoder().decode(outcome.successValue));
    return typeof v === 'number' && Number.isSafeInteger(v) ? v : null;
  } catch {
    return null;
  }
}
