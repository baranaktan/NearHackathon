/**
 * Stealth payments through the Perde contract. The stealth derivation is done
 * BEFORE review so the account shown to the person is exactly the one paid.
 */
import { createReceipt, deriveStealth, functionCall, pollUntil, transfer, type Signer, type StealthDerivation, type TxOutcome } from '@perde/core';
import { APP_CONFIG } from '../config';
import { perde } from '../lib/perde';
import { returnedNumber, signAndSend, type TxStep } from './tx';

export { deriveStealth };

function sendAction(stealth: StealthDerivation, depositYocto: bigint) {
  return functionCall(
    'send',
    { stealth_account: stealth.stealthAccountId, ephemeral_pk: stealth.ephemeralPk, view_tag: stealth.viewTag },
    perde.gasPerSend,
    depositYocto,
  );
}

/**
 * Find the announcement indices of these stealth accounts, starting at
 * `fromIndex`. RPC nodes are load-balanced and may lag the block that holds
 * the transaction, so poll (bounded) until every one is visible.
 */
async function locateAnnouncements(stealthIds: readonly string[], fromIndex: number): Promise<Map<string, number>> {
  if (fromIndex < 0) return new Map();
  const wanted = new Set(stealthIds);
  const read = async () => {
    const page = await perde.fetchAnnouncements({ fromIndex, limit: Math.min(200, stealthIds.length + 10) });
    const found = new Map<string, number>();
    for (const a of page.announcements) if (wanted.has(a.stealthAccountId)) found.set(a.stealthAccountId, a.index);
    return found;
  };
  return pollUntil(read, (m) => m.size === wanted.size, { timeoutMs: 15_000, what: 'the announcement' });
}

export interface SendResultLite {
  txHash: string;
  receipt: string;
  announcementIndex: number | null;
  outcome: TxOutcome;
}

export async function executeSend(params: {
  signer: Signer;
  senderId: string;
  metaAddress: string;
  stealth: StealthDerivation;
  amountYocto: bigint;
  announceFeeYocto: bigint;
  onStep?: (s: TxStep) => void;
}): Promise<SendResultLite> {
  const { signer, senderId, metaAddress, stealth, amountYocto, announceFeeYocto, onStep } = params;
  const outcome = await signAndSend({
    signer,
    signerId: senderId,
    receiverId: APP_CONFIG.contractId,
    actions: [sendAction(stealth, amountYocto + announceFeeYocto)],
    onStep,
  });
  onStep?.('confirm');
  // The contract returns the announcement index; read it back from chain to be sure.
  const claimed = returnedNumber(outcome);
  let announcementIndex: number | null = null;
  if (claimed !== null) {
    try {
      announcementIndex = (await locateAnnouncements([stealth.stealthAccountId], claimed)).get(stealth.stealthAccountId) ?? null;
    } catch {
      announcementIndex = claimed;
    }
  }
  const receipt = createReceipt({ meta: metaAddress, r: stealth.r, stealthAccountId: stealth.stealthAccountId, tx: outcome.hash });
  return { txHash: outcome.hash, receipt, announcementIndex, outcome };
}

export interface BatchLeg {
  metaAddress: string;
  amountYocto: bigint;
}

export interface BatchLegResult {
  stealth: StealthDerivation;
  receipt: string;
  announcementIndex: number | null;
}

/** One transaction with one `send` action per leg (atomic). */
export async function executeBatch(params: {
  signer: Signer;
  senderId: string;
  legs: readonly BatchLeg[];
  announceFeeYocto: bigint;
  onStep?: (s: TxStep) => void;
}): Promise<{ txHash: string; legs: BatchLegResult[] }> {
  const { signer, senderId, legs, announceFeeYocto, onStep } = params;
  if (legs.length === 0 || legs.length > perde.maxBatchSize) throw new RangeError(`a batch holds 1–${perde.maxBatchSize} payments`);
  const derived = legs.map((l) => ({ leg: l, stealth: deriveStealth(l.metaAddress) }));
  const outcome = await signAndSend({
    signer,
    signerId: senderId,
    receiverId: APP_CONFIG.contractId,
    actions: derived.map((d) => sendAction(d.stealth, d.leg.amountYocto + announceFeeYocto)),
    onStep,
  });
  onStep?.('confirm');
  // Actions of one receipt run back to back, so the indices are consecutive and the
  // receipt's return value is the last one. Confirm against the chain anyway.
  const last = returnedNumber(outcome);
  let indices = new Map<string, number>();
  if (last !== null) {
    try {
      indices = await locateAnnouncements(
        derived.map((d) => d.stealth.stealthAccountId),
        last - derived.length + 1,
      );
    } catch {
      indices = new Map(derived.map((d, i) => [d.stealth.stealthAccountId, last - derived.length + 1 + i]));
    }
  }
  return {
    txHash: outcome.hash,
    legs: derived.map((d) => ({
      stealth: d.stealth,
      receipt: createReceipt({ meta: d.leg.metaAddress, r: d.stealth.r, stealthAccountId: d.stealth.stealthAccountId, tx: outcome.hash }),
      announcementIndex: indices.get(d.stealth.stealthAccountId) ?? null,
    })),
  };
}

/** Pay an invoice account with a plain Transfer: no contract, no announcement. */
export async function payInvoiceTransfer(params: {
  signer: Signer;
  senderId: string;
  invoiceAccount: string;
  amountYocto: bigint;
  onStep?: (s: TxStep) => void;
}): Promise<{ txHash: string }> {
  const outcome = await signAndSend({
    signer: params.signer,
    signerId: params.senderId,
    receiverId: params.invoiceAccount,
    actions: [transfer(params.amountYocto)],
    onStep: params.onStep,
  });
  params.onStep?.('confirm');
  return { txHash: outcome.hash };
}
