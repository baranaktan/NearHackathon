import { base64urlnopad } from '@scure/base';
import { PerdeError } from '../errors.js';
import { decodeMetaAddress, encodeMetaAddress } from './encoding.js';
import type { MetaAddress } from './keys.js';
import { utf8ToBytes } from './primitives.js';
import { type AnnouncementLike, deriveStealth, hexToScalar, scalarToHex } from './stealth.js';

export const RECEIPT_PREFIX = 'perdereceipt:';

/**
 * A sender's proof of payment. Revealing `r` links this one stealth account to
 * the recipient's meta-address (that is the point of a receipt) but gives no
 * spending power and reveals nothing about other payments.
 */
export interface ReceiptData {
  readonly v: 1;
  readonly meta: string;
  /** Ephemeral scalar r, 32-byte little-endian hex. */
  readonly r: string;
  /** Stealth implicit account id (64 hex). */
  readonly stealth: string;
  /** Transaction hash (base58) of the payment, if known. */
  readonly tx?: string;
  /**
   * Signer of that transaction (receipts made since 2026-11-14). Only a lookup
   * hint for the `tx` RPC, and checked against the transaction; it reveals
   * nothing the public transaction does not already show. Older receipts lack it.
   */
  readonly from?: string;
}

export interface ReceiptVerification {
  readonly valid: boolean;
  readonly reason?: string;
  readonly data?: ReceiptData;
  readonly stealthAccountId?: string;
  readonly ephemeralPk?: string;
  readonly viewTag?: number;
}

export function createReceipt(params: {
  meta: MetaAddress | string;
  r: bigint;
  stealthAccountId: string;
  tx?: string;
  /** Signer of `tx` (see `ReceiptData.from`); ignored without `tx`. */
  from?: string;
}): string {
  const meta = typeof params.meta === 'string' ? encodeMetaAddress(decodeMetaAddress(params.meta)) : encodeMetaAddress(params.meta);
  const derived = deriveStealth(meta, params.r);
  if (derived.stealthAccountId !== params.stealthAccountId) {
    throw new PerdeError('INVALID_RECEIPT', 'r does not derive the given stealth account for this meta-address');
  }
  const data: ReceiptData = {
    v: 1,
    meta,
    r: scalarToHex(params.r),
    stealth: params.stealthAccountId,
    ...(params.tx !== undefined ? { tx: params.tx } : {}),
    ...(params.tx !== undefined && params.from !== undefined ? { from: params.from } : {}),
  };
  return RECEIPT_PREFIX + base64urlnopad.encode(utf8ToBytes(JSON.stringify(data)));
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function decodeReceipt(receipt: string): ReceiptData {
  const s = receipt.trim();
  if (!s.startsWith(RECEIPT_PREFIX)) throw new PerdeError('INVALID_PREFIX', `receipt must start with "${RECEIPT_PREFIX}"`);
  let parsed: unknown;
  try {
    const body = s.slice(RECEIPT_PREFIX.length).replace(/=+$/u, '');
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(base64urlnopad.decode(body)));
  } catch (e) {
    throw new PerdeError('INVALID_ENCODING', 'receipt is not base64url JSON', e);
  }
  if (!isRecord(parsed)) throw new PerdeError('INVALID_RECEIPT', 'receipt payload must be an object');
  const { v, meta, r, stealth, tx, from } = parsed;
  if (v !== 1) throw new PerdeError('INVALID_RECEIPT', 'unsupported receipt version');
  if (typeof meta !== 'string' || typeof r !== 'string' || typeof stealth !== 'string') {
    throw new PerdeError('INVALID_RECEIPT', 'receipt fields meta, r, stealth must be strings');
  }
  if (tx !== undefined && typeof tx !== 'string') throw new PerdeError('INVALID_RECEIPT', 'receipt tx must be a string');
  if (from !== undefined && typeof from !== 'string') throw new PerdeError('INVALID_RECEIPT', 'receipt from must be a string');
  return { v: 1, meta, r, stealth, ...(tx !== undefined ? { tx } : {}), ...(from !== undefined ? { from } : {}) };
}

/**
 * Offline verification: r derives `stealth` for `meta`. When an on-chain
 * announcement is supplied, also checks R = r·G and the view tag against it.
 */
export function verifyReceipt(receipt: string, announcement?: AnnouncementLike): ReceiptVerification {
  let data: ReceiptData;
  try {
    data = decodeReceipt(receipt);
  } catch (e) {
    return { valid: false, reason: e instanceof Error ? e.message : 'invalid receipt' };
  }
  let derived;
  try {
    derived = deriveStealth(data.meta, hexToScalar(data.r));
  } catch (e) {
    return { valid: false, reason: e instanceof Error ? e.message : 'invalid receipt', data };
  }
  const base = { data, stealthAccountId: derived.stealthAccountId, ephemeralPk: derived.ephemeralPk, viewTag: derived.viewTag };
  if (derived.stealthAccountId !== data.stealth) {
    return { ...base, valid: false, reason: 'stealth account does not match meta-address and r' };
  }
  if (announcement !== undefined) {
    if (announcement.stealthAccountId !== derived.stealthAccountId) {
      return { ...base, valid: false, reason: 'announcement is for a different stealth account' };
    }
    if (announcement.ephemeralPk !== derived.ephemeralPk || announcement.viewTag !== derived.viewTag) {
      return { ...base, valid: false, reason: 'announcement ephemeral key / view tag do not match r' };
    }
  }
  return { ...base, valid: true };
}
