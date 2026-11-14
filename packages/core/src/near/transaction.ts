import { base58, base64 } from '@scure/base';
import { PerdeError } from '../errors.js';
import { equalBytes, sha256, utf8ToBytes } from '../crypto/primitives.js';
import { assertAccountId } from './accountId.js';
import { BorshWriter } from './borsh.js';
import type { Signer } from './signer.js';

export interface TransferAction {
  readonly type: 'Transfer';
  readonly deposit: bigint;
}

export interface FunctionCallAction {
  readonly type: 'FunctionCall';
  readonly methodName: string;
  /** Raw argument bytes (use `functionCall()` to JSON-encode an object). */
  readonly args: Uint8Array;
  readonly gas: bigint;
  readonly deposit: bigint;
}

export interface DeleteAccountAction {
  readonly type: 'DeleteAccount';
  readonly beneficiaryId: string;
}

export type Action = TransferAction | FunctionCallAction | DeleteAccountAction;

export function transfer(deposit: bigint): TransferAction {
  return { type: 'Transfer', deposit };
}

export function functionCall(methodName: string, args: object | Uint8Array, gas: bigint, deposit = 0n): FunctionCallAction {
  const bytes = args instanceof Uint8Array ? args : utf8ToBytes(JSON.stringify(args));
  return { type: 'FunctionCall', methodName, args: bytes, gas, deposit };
}

export function deleteAccount(beneficiaryId: string): DeleteAccountAction {
  assertAccountId(beneficiaryId, 'beneficiary');
  return { type: 'DeleteAccount', beneficiaryId };
}

export interface Transaction {
  readonly signerId: string;
  readonly publicKey: Uint8Array;
  readonly nonce: bigint;
  readonly receiverId: string;
  /** 32-byte block hash (decoded from base58). */
  readonly blockHash: Uint8Array;
  readonly actions: readonly Action[];
}

// Borsh enum indices of nearcore `Action`.
const ACTION_INDEX = { FunctionCall: 2, Transfer: 3, DeleteAccount: 7 } as const;
const KEY_TYPE_ED25519 = 0;

function writeAction(w: BorshWriter, a: Action): void {
  w.u8(ACTION_INDEX[a.type]);
  switch (a.type) {
    case 'Transfer':
      w.u128(a.deposit);
      break;
    case 'FunctionCall':
      w.string(a.methodName).bytes(a.args).u64(a.gas).u128(a.deposit);
      break;
    case 'DeleteAccount':
      w.string(a.beneficiaryId);
      break;
  }
}

/** Borsh encoding of a `TransactionV0`. */
export function serializeTransaction(tx: Transaction): Uint8Array {
  assertAccountId(tx.signerId, 'signer id');
  assertAccountId(tx.receiverId, 'receiver id');
  const w = new BorshWriter()
    .string(tx.signerId)
    .u8(KEY_TYPE_ED25519)
    .fixed(tx.publicKey, 32)
    .u64(tx.nonce)
    .string(tx.receiverId)
    .fixed(tx.blockHash, 32)
    .u32(tx.actions.length);
  for (const a of tx.actions) writeAction(w, a);
  return w.toBytes();
}

/** sha256 of the borsh-encoded transaction; this is what gets signed. */
export function transactionHash(tx: Transaction): Uint8Array {
  return sha256(serializeTransaction(tx));
}

export interface SignedTransaction {
  readonly transaction: Transaction;
  readonly signature: Uint8Array;
  /** base58 transaction hash (the id shown by explorers). */
  readonly hash: string;
  /** borsh-encoded SignedTransaction. */
  readonly bytes: Uint8Array;
}

export function serializeSignedTransaction(tx: Transaction, signature: Uint8Array): Uint8Array {
  const txBytes = serializeTransaction(tx);
  return new BorshWriter().fixed(txBytes, txBytes.length).u8(KEY_TYPE_ED25519).fixed(signature, 64).toBytes();
}

export async function signTransaction(tx: Transaction, signer: Signer): Promise<SignedTransaction> {
  if (!equalBytes(signer.publicKey, tx.publicKey)) {
    throw new PerdeError('KEY_MISMATCH', 'signer key differs from transaction public key');
  }
  const hashBytes = transactionHash(tx);
  const signature = await signer.sign(hashBytes);
  if (signature.length !== 64) throw new PerdeError('INVALID_KEY', 'signer returned a signature that is not 64 bytes');
  return { transaction: tx, signature, hash: base58.encode(hashBytes), bytes: serializeSignedTransaction(tx, signature) };
}

export function signedTransactionBase64(stx: SignedTransaction): string {
  return base64.encode(stx.bytes);
}
