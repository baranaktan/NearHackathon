/**
 * Does the transaction a receipt names (`tx`) really make that payment?
 *
 * A receipt's meta-address, `r` and stealth account are proven by the
 * derivation and the on-chain announcement. Its `tx` field is just a claim
 * until the transaction itself is read: this module checks an
 * `EXPERIMENTAL_tx_status` answer (it lists every receipt with its sender,
 * receiver and actions) against what the receipt says.
 *
 * A transaction matches when it succeeded and one of its receipts moved NEAR
 * into exactly the receipt's stealth account, either
 *  - from the Perde contract, in a transaction whose contract execution
 *    announced that stealth account with the receipt's ephemeral key and view
 *    tag (direct sends, batches, DAO payouts through `perde.send`), or
 *  - as a plain Transfer signed by the payer straight to the stealth account.
 * Gas refunds (sender `system`) never count as funding.
 */
import { base58 } from '@scure/base';

export type ReceiptTxCheck =
  | {
      readonly status: 'match';
      readonly txHash: string;
      readonly signerId: string;
      /** How the stealth account was paid. */
      readonly via: 'perde' | 'transfer';
      /** NEAR that this transaction moved into the stealth account (yocto). */
      readonly amountYocto: bigint;
      /** Announcement index from the contract's `announce` event (Perde route). */
      readonly announcementIndex?: number;
    }
  | { readonly status: 'mismatch'; readonly txHash: string; readonly reason: string }
  /** Not checked: the receipt names no transaction, or the chain could not answer. Never a pass. */
  | { readonly status: 'unchecked'; readonly txHash?: string; readonly reason: string };

export interface ReceiptTxExpectation {
  readonly txHash: string;
  readonly stealthAccountId: string;
  /** Derived from the receipt's meta-address and r. */
  readonly ephemeralPk: string;
  readonly viewTag: number;
  /** The Perde contract; without it only a plain transfer can match. */
  readonly contractId?: string;
  /** Signer the receipt names (`from`), if any. */
  readonly signerId?: string;
}

/** A NEAR transaction hash: base58 of 32 bytes. */
export function isTxHash(s: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(s)) return false;
  try {
    return base58.decode(s).length === 32;
  } catch {
    return false;
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isSuccess(status: unknown): boolean {
  return isRecord(status) && ('SuccessValue' in status || 'SuccessReceiptId' in status);
}

function failureText(status: unknown): string {
  try {
    return JSON.stringify(isRecord(status) ? status.Failure : status).slice(0, 160);
  } catch {
    return 'failure';
  }
}

/** Sum of Transfer deposits in an action receipt (0n when it has none). */
function transferredIn(receipt: Record<string, unknown>): bigint {
  const body = receipt.receipt;
  if (!isRecord(body) || !isRecord(body.Action) || !Array.isArray(body.Action.actions)) return 0n;
  let total = 0n;
  for (const a of body.Action.actions as unknown[]) {
    if (isRecord(a) && isRecord(a.Transfer) && typeof a.Transfer.deposit === 'string' && /^\d+$/u.test(a.Transfer.deposit)) total += BigInt(a.Transfer.deposit);
  }
  return total;
}

interface AnnounceEvent {
  index?: number;
  stealth_account?: string;
  ephemeral_pk?: string;
  view_tag?: number;
}

/** Perde `announce` events logged by successful executions of the contract. */
function announceEvents(outcomes: readonly Record<string, unknown>[], contractId: string): AnnounceEvent[] {
  const events: AnnounceEvent[] = [];
  for (const o of outcomes) {
    const out = o.outcome;
    if (!isRecord(out) || out.executor_id !== contractId || !isSuccess(out.status) || !Array.isArray(out.logs)) continue;
    for (const log of out.logs as unknown[]) {
      if (typeof log !== 'string' || !log.startsWith('EVENT_JSON:')) continue;
      try {
        const ev: unknown = JSON.parse(log.slice('EVENT_JSON:'.length));
        if (isRecord(ev) && ev.standard === 'perde' && ev.event === 'announce' && Array.isArray(ev.data)) {
          for (const d of ev.data as unknown[]) {
            if (!isRecord(d)) continue;
            events.push({
              ...(typeof d.index === 'number' ? { index: d.index } : {}),
              ...(typeof d.stealth_account === 'string' ? { stealth_account: d.stealth_account } : {}),
              ...(typeof d.ephemeral_pk === 'string' ? { ephemeral_pk: d.ephemeral_pk } : {}),
              ...(typeof d.view_tag === 'number' ? { view_tag: d.view_tag } : {}),
            });
          }
        }
      } catch {
        /* not an event we read */
      }
    }
  }
  return events;
}

/** Compare an `EXPERIMENTAL_tx_status` result with what the receipt claims. Pure; no network. */
export function matchReceiptTransaction(raw: unknown, expected: ReceiptTxExpectation): ReceiptTxCheck {
  const txHash = expected.txHash;
  const stealth = expected.stealthAccountId;
  if (!isRecord(raw) || !isRecord(raw.transaction)) return { status: 'unchecked', txHash, reason: 'the RPC answer holds no transaction' };
  const tx = raw.transaction;
  if (tx.hash !== txHash) return { status: 'mismatch', txHash, reason: `the RPC returned transaction ${String(tx.hash)} for this hash` };
  const signerId = typeof tx.signer_id === 'string' ? tx.signer_id : '';
  if (expected.signerId !== undefined && signerId !== expected.signerId) {
    return { status: 'mismatch', txHash, reason: `signed by ${signerId}, but the receipt says ${expected.signerId}` };
  }
  if (!Array.isArray(raw.receipts_outcome) || raw.status === undefined) {
    return { status: 'unchecked', txHash, reason: 'the transaction has not finished executing yet' };
  }
  if (isRecord(raw.status) && 'Failure' in raw.status) return { status: 'mismatch', txHash, reason: `the transaction failed (${failureText(raw.status)})` };
  if (!isSuccess(raw.status)) return { status: 'unchecked', txHash, reason: 'the transaction has not finished executing yet' };
  if (!Array.isArray(raw.receipts)) return { status: 'unchecked', txHash, reason: 'the RPC answer lists no receipts' };

  const outcomes = (raw.receipts_outcome as unknown[]).filter(isRecord);
  const outcomeById = new Map<string, Record<string, unknown>>();
  for (const o of outcomes) if (typeof o.id === 'string' && isRecord(o.outcome)) outcomeById.set(o.id, o.outcome);

  const funding = (raw.receipts as unknown[]).filter(isRecord).filter((r) => {
    if (r.receiver_id !== stealth || r.predecessor_id === 'system' || typeof r.receipt_id !== 'string') return false;
    const out = outcomeById.get(r.receipt_id);
    return transferredIn(r) > 0n && out !== undefined && out.executor_id === stealth && isSuccess(out.status);
  });
  if (funding.length === 0) {
    const to = typeof tx.receiver_id === 'string' ? tx.receiver_id : '?';
    return { status: 'mismatch', txHash, reason: `this transaction (${signerId} → ${to}) paid nothing into ${stealth}` };
  }

  const contractId = expected.contractId;
  const viaContract = contractId === undefined ? [] : funding.filter((r) => r.predecessor_id === contractId);
  if (contractId !== undefined && viaContract.length > 0) {
    const events = announceEvents(outcomes, contractId).filter((e) => e.stealth_account === stealth);
    if (events.length === 0) return { status: 'mismatch', txHash, reason: `${contractId} did not announce ${stealth} in this transaction` };
    const same = events.find((e) => e.ephemeral_pk === expected.ephemeralPk && e.view_tag === expected.viewTag);
    if (same === undefined) return { status: 'mismatch', txHash, reason: 'this transaction announced the account with a different ephemeral key / view tag than the receipt’s r gives' };
    return {
      status: 'match',
      txHash,
      signerId,
      via: 'perde',
      amountYocto: viaContract.reduce((s, r) => s + transferredIn(r), 0n),
      ...(typeof same.index === 'number' ? { announcementIndex: same.index } : {}),
    };
  }

  const direct = funding.filter((r) => r.predecessor_id === signerId && tx.receiver_id === stealth);
  if (direct.length > 0) return { status: 'match', txHash, signerId, via: 'transfer', amountYocto: direct.reduce((s, r) => s + transferredIn(r), 0n) };

  const from = [...new Set(funding.map((r) => String(r.predecessor_id)))].join(', ');
  return { status: 'mismatch', txHash, reason: `${stealth} was paid by ${from}, not through ${contractId ?? 'the Perde contract'} or a plain transfer` };
}
