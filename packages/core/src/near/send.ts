import { PerdeError } from '../errors.js';
import type { NearRpc, TxOutcome, WaitUntil } from './rpc.js';
import type { Signer } from './signer.js';
import { type Action, type SignedTransaction, signTransaction } from './transaction.js';

export interface SendActionsParams {
  readonly rpc: NearRpc;
  readonly signer: Signer;
  readonly signerId: string;
  readonly receiverId: string;
  readonly actions: readonly Action[];
  readonly waitUntil?: WaitUntil;
}

function isInvalidNonce(e: unknown): boolean {
  if (!(e instanceof PerdeError) || e.code !== 'TX_FAILED') return false;
  try {
    return JSON.stringify(e.details).includes('InvalidNonce');
  } catch {
    return false;
  }
}

/** Fetch nonce + recent block hash, then build and sign (does not broadcast). */
export async function buildSignedTransaction(params: Omit<SendActionsParams, 'waitUntil'>): Promise<SignedTransaction> {
  const { rpc, signer, signerId, receiverId, actions } = params;
  const [accessKey, blockHash] = await Promise.all([rpc.getAccessKey(signerId, signer.publicKey), rpc.latestBlockHash('final')]);
  return signTransaction({ signerId, publicKey: signer.publicKey, nonce: accessKey.nonce + 1n, receiverId, blockHash, actions }, signer);
}

/**
 * Sign and broadcast one transaction. Retries (up to 3 attempts) only when the
 * node reports InvalidNonce, which happens when two transactions race.
 */
export async function sendActions(params: SendActionsParams): Promise<TxOutcome> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const stx = await buildSignedTransaction(params);
    try {
      return await params.rpc.sendTransaction(stx, params.waitUntil ?? 'EXECUTED_OPTIMISTIC');
    } catch (e) {
      if (!isInvalidNonce(e)) throw e;
      lastError = e;
    }
  }
  throw lastError;
}
