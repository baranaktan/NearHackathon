/**
 * Sign in the browser, broadcast, wait for execution. Mirrors core's
 * `sendActions` (retry on InvalidNonce) but reports progress and keeps the
 * transaction hash when the network fails after the broadcast, so the UI can
 * point at the explorer instead of inviting a double payment.
 */
import { buildSignedTransaction, isPerdeError, type Action, type Signer, type TxOutcome } from '@perde/core';
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

export interface SignAndSendParams {
  signer: Signer;
  signerId: string;
  receiverId: string;
  actions: readonly Action[];
  onStep?: (step: TxStep) => void;
  /** The hash, as soon as the transaction is signed (before the broadcast). */
  onTxHash?: (hash: string) => void;
}

export async function signAndSend({ signer, signerId, receiverId, actions, onStep, onTxHash }: SignAndSendParams): Promise<TxOutcome> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    onStep?.('sign');
    const stx = await buildSignedTransaction({ rpc, signer, signerId, receiverId, actions });
    onTxHash?.(stx.hash);
    onStep?.('broadcast');
    try {
      // Core waits for execution, and if no endpoint answered the broadcast it looks the
      // transaction up by hash before giving up (the response may be lost, not the transaction).
      return await rpc.sendTransaction(stx, 'EXECUTED_OPTIMISTIC');
    } catch (e) {
      if (isInvalidNonce(e)) {
        last = e;
        continue;
      }
      if (isPerdeError(e, 'RPC_UNAVAILABLE') || isPerdeError(e, 'RPC_ERROR')) throw new UnconfirmedTxError(stx.hash, e);
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
