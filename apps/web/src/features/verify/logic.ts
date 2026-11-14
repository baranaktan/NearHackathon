/** Turn core's receipt verification into the checklist the Verify page shows. */
import { decodeReceipt, verifyReceipt, type Announcement, type ReceiptData } from '@perde/core';
import { formatYocto, truncateMiddle } from '../../lib/near-format';
import type { ReceiptSummary, VerifyCheck, VerifyState } from './types';

export interface OnChain {
  contractId: string;
  announcementCount: number;
  announcement: Announcement | undefined;
  balanceYocto: bigint;
}

export function parseReceipt(text: string): { ok: true; data: ReceiptData } | { ok: false; message: string } {
  try {
    return { ok: true, data: decodeReceipt(text) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'invalid receipt';
    return { ok: false, message: `This is not a readable Perde receipt: ${msg}.` };
  }
}

export function buildVerification(receipt: string, chain: OnChain): VerifyState {
  const parsed = parseReceipt(receipt);
  if (!parsed.ok) return { status: 'invalid', message: parsed.message };
  const data = parsed.data;
  const offline = verifyReceipt(receipt);
  const ann = chain.announcement;
  const matched = ann ? verifyReceipt(receipt, ann) : null;
  const checks: VerifyCheck[] = [
    {
      id: 'format',
      label: 'Receipt is well-formed',
      detail: `perdereceipt v1 · meta ${truncateMiddle(data.meta, 12, 6)} · stealth ${truncateMiddle(data.stealth, 8, 8)}`,
      status: 'pass',
    },
    {
      id: 'derive',
      label: 'The stealth account derives from the meta-address',
      detail: offline.valid
        ? `R = r·G = ${truncateMiddle(offline.ephemeralPk ?? '', 8, 8)} · P = K_spend + H(r·K_view)·G = ${truncateMiddle(data.stealth, 8, 8)}`
        : (offline.reason ?? 'derivation failed'),
      status: offline.valid ? 'pass' : 'fail',
    },
    {
      id: 'announced',
      label: `The payment is announced on ${chain.contractId}`,
      detail: ann ? `announcement #${ann.index} · ${formatYocto(ann.amount)} NEAR` : `no announcement for this account among ${chain.announcementCount}`,
      status: !offline.valid ? 'skipped' : ann ? 'pass' : 'fail',
    },
    {
      id: 'match',
      label: 'The announcement’s ephemeral key and view tag match the receipt',
      detail: ann && matched ? (matched.valid ? `ephemeral_pk ${truncateMiddle(ann.ephemeralPk, 8, 8)} · view_tag ${ann.viewTag}` : (matched.reason ?? 'mismatch')) : 'needs the announcement',
      status: ann && matched ? (matched.valid ? 'pass' : 'fail') : 'skipped',
    },
    {
      id: 'balance',
      label: 'Stealth account today',
      detail: chain.balanceYocto > 0n ? `holds ${formatYocto(chain.balanceYocto, { maxFractionDigits: 6 })} NEAR` : 'empty or closed — the recipient may already have claimed it',
      status: 'info',
    },
  ];
  const summary: ReceiptSummary = {
    metaAddress: data.meta,
    stealthAccount: data.stealth,
    amountYocto: ann ? ann.amount.toString() : null,
    txHash: data.tx ?? null,
    timestampMs: ann?.timestampMs ?? null,
  };
  const ok = offline.valid && !!ann && !!matched?.valid;
  if (ok) return { status: 'verified', summary, checks };
  const reason = !offline.valid
    ? 'The stealth account in this receipt does not derive from the stated meta-address.'
    : !ann
      ? 'No on-chain announcement exists for this stealth account, so the receipt proves no Perde payment.'
      : 'The on-chain announcement does not match this receipt.';
  return { status: 'failed', summary, reason, checks };
}
