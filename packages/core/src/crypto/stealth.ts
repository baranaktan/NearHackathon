import { PerdeError } from '../errors.js';
import { decodeMetaAddress, decodeViewingKey } from './encoding.js';
import type { MetaAddress, SpendKeys, ViewKeys } from './keys.js';
import {
  assertScalar,
  baseMul,
  bytesToHex,
  concatBytes,
  H512s,
  hexToBytes,
  mod,
  type Point,
  pointFromBytes,
  pointFromHex,
  randomScalar,
  scalarFromBytes,
  scalarToBytes,
  sha256,
  u32be,
  utf8ToBytes,
} from './primitives.js';

export const TAG_STEALTH = 'perde/stealth/v1';
export const TAG_VIEW_TAG = 'perde/tag/v1';
export const TAG_INVOICE = 'perde/invoice/v1';

/** Result of deriving a one-time stealth destination for a meta-address. */
export interface StealthDerivation {
  /** NEAR implicit account id: hex(P), 64 lowercase hex chars. */
  readonly stealthAccountId: string;
  /** R = r·G as 64 lowercase hex chars (what the contract stores). */
  readonly ephemeralPk: string;
  /** First byte of sha256("perde/tag/v1" ‖ S), 0..255. */
  readonly viewTag: number;
  /** Ephemeral secret scalar. Only the sender (or a receipt holder) knows it. */
  readonly r: bigint;
}

/** The fields of an on-chain announcement needed for scanning. */
export interface AnnouncementLike {
  readonly stealthAccountId: string;
  readonly ephemeralPk: string;
  readonly viewTag: number;
}

export interface StealthMatch {
  readonly stealthAccountId: string;
  readonly ephemeralPk: string;
  /** Tweak h = H512s("perde/stealth/v1", S); spend scalar is k_spend + h. */
  readonly tweak: bigint;
}

export interface InvoiceDerivation extends StealthDerivation {
  readonly index: number;
}

function asMeta(meta: MetaAddress | string): MetaAddress {
  if (typeof meta === 'string') return decodeMetaAddress(meta);
  pointFromBytes(meta.spendPub);
  pointFromBytes(meta.viewPub);
  return meta;
}

function asViewKeys(vk: ViewKeys | string): ViewKeys {
  return typeof vk === 'string' ? decodeViewingKey(vk) : vk;
}

function toScalar(r: bigint | Uint8Array): bigint {
  if (typeof r === 'bigint') {
    assertScalar(r);
    return r;
  }
  return scalarFromBytes(r);
}

function tweakFromShared(S: Point): bigint {
  const h = H512s(TAG_STEALTH, S.toBytes());
  assertScalar(h);
  return h;
}

export function viewTagFromShared(S: Point): number {
  return sha256(concatBytes(utf8ToBytes(TAG_VIEW_TAG), S.toBytes()))[0] as number;
}

function stealthPoint(spendPub: Uint8Array, h: bigint): Point {
  const P = pointFromBytes(spendPub).add(baseMul(h));
  if (P.is0()) throw new PerdeError('INVALID_POINT', 'degenerate stealth point');
  return P;
}

/**
 * Sender side: derive a fresh stealth account for `meta`.
 * `r` may be passed for deterministic derivation (tests, invoices, receipts).
 */
export function deriveStealth(meta: MetaAddress | string, r?: bigint | Uint8Array): StealthDerivation {
  const m = asMeta(meta);
  const rs = r === undefined ? randomScalar() : toScalar(r);
  const R = baseMul(rs);
  const S = pointFromBytes(m.viewPub).multiply(rs);
  const h = tweakFromShared(S);
  const P = stealthPoint(m.spendPub, h);
  return {
    stealthAccountId: bytesToHex(P.toBytes()),
    ephemeralPk: bytesToHex(R.toBytes()),
    viewTag: viewTagFromShared(S),
    r: rs,
  };
}

/**
 * Recipient side: check one announcement. Returns null for anything that is
 * not ours, including malformed announcements (anyone can post garbage).
 */
export function scanAnnouncement(viewKeys: ViewKeys | string, ann: AnnouncementLike): StealthMatch | null {
  const vk = asViewKeys(viewKeys);
  let R: Point;
  try {
    R = pointFromHex(ann.ephemeralPk);
  } catch {
    return null;
  }
  const S = R.multiply(vk.viewPriv);
  if (viewTagFromShared(S) !== ann.viewTag) return null;
  const h = tweakFromShared(S);
  const P = stealthPoint(vk.spendPub, h);
  if (bytesToHex(P.toBytes()) !== ann.stealthAccountId.toLowerCase()) return null;
  return { stealthAccountId: bytesToHex(P.toBytes()), ephemeralPk: ann.ephemeralPk, tweak: h };
}

/**
 * p = (k_spend + h) mod L for the stealth account in `ann`.
 * Throws KEY_MISMATCH if the announcement does not belong to these keys.
 */
export function recoverSpendScalar(keys: SpendKeys, ann: AnnouncementLike | StealthMatch): bigint {
  const match = 'tweak' in ann ? ann : scanAnnouncement(keys, ann);
  if (match === null) throw new PerdeError('KEY_MISMATCH', 'announcement does not belong to these keys');
  const p = mod(keys.spendPriv + match.tweak);
  assertScalar(p);
  if (bytesToHex(baseMul(p).toBytes()) !== match.stealthAccountId) {
    throw new PerdeError('KEY_MISMATCH', 'recovered scalar does not match the stealth account');
  }
  return p;
}

/** Public key bytes (= implicit account id bytes) for a spend scalar. */
export function publicKeyFromScalar(p: bigint): Uint8Array {
  return baseMul(p).toBytes();
}

/** r_i = H512s("perde/invoice/v1", k_view ‖ u32be(i)) */
export function invoiceScalar(viewPriv: bigint, index: number): bigint {
  const r = H512s(TAG_INVOICE, scalarToBytes(viewPriv), u32be(index));
  assertScalar(r);
  return r;
}

/**
 * Invoice `i`: a deterministic stealth account the recipient can derive from
 * the viewing key alone; no on-chain announcement is needed.
 */
export function deriveInvoice(keys: ViewKeys | string, index: number): InvoiceDerivation {
  const vk = asViewKeys(keys);
  const r = invoiceScalar(vk.viewPriv, index);
  return { ...deriveStealth({ spendPub: vk.spendPub, viewPub: vk.viewPub }, r), index };
}

export function invoiceMatch(keys: ViewKeys | string, index: number): StealthMatch {
  const inv = deriveInvoice(keys, index);
  const vk = asViewKeys(keys);
  const match = scanAnnouncement(vk, inv);
  if (match === null) throw new PerdeError('KEY_MISMATCH', 'invoice derivation inconsistent');
  return match;
}

/** Spend scalar for invoice `i`. */
export function recoverInvoiceScalar(keys: SpendKeys, index: number): bigint {
  return recoverSpendScalar(keys, invoiceMatch(keys, index));
}

export const TAG_NONCE = 'perde/nonce/v1';

/**
 * EdDSA over ed25519 with a raw scalar (no seed / no clamping):
 * nonce = H512s("perde/nonce/v1", p ‖ M), Rsig = nonce·G,
 * k = SHA512(Rsig ‖ A ‖ M) mod L, s = nonce + k·p.
 * Output verifies under standard RFC 8032 / ZIP-215 ed25519 verification.
 */
export function signWithScalar(p: bigint, message: Uint8Array): Uint8Array {
  assertScalar(p);
  const pBytes = scalarToBytes(p);
  const A = baseMul(p).toBytes();
  const nonce = H512s(TAG_NONCE, pBytes, message);
  assertScalar(nonce);
  const Rsig = baseMul(nonce).toBytes();
  const k = H512s('', Rsig, A, message);
  const s = mod(nonce + k * p);
  return concatBytes(Rsig, scalarToBytes(s));
}

export function hexToScalar(hex: string): bigint {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new PerdeError('INVALID_ENCODING', 'scalar hex must be 64 lowercase hex chars');
  return scalarFromBytes(hexToBytes(hex));
}

export function scalarToHex(s: bigint): string {
  return bytesToHex(scalarToBytes(s));
}
