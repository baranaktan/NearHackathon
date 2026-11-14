import { base58 } from '@scure/base';
import { PerdeError } from '../errors.js';
import type { MetaAddress, ViewKeys } from './keys.js';
import { baseMul, checksum4, concatBytes, equalBytes, pointFromBytes, scalarFromBytes, scalarToBytes } from './primitives.js';

export const META_PREFIX = 'perde:';
export const VIEWING_KEY_PREFIX = 'perdeview:';

function decodeChecked(input: string, prefix: string, payloadLen: number, what: string): Uint8Array {
  if (typeof input !== 'string' || !input.startsWith(prefix)) {
    throw new PerdeError('INVALID_PREFIX', `${what} must start with "${prefix}"`);
  }
  let raw: Uint8Array;
  try {
    raw = base58.decode(input.slice(prefix.length));
  } catch (e) {
    throw new PerdeError('INVALID_ENCODING', `${what} is not valid base58`, e);
  }
  if (raw.length !== payloadLen + 4) {
    throw new PerdeError('INVALID_LENGTH', `${what} must decode to ${payloadLen + 4} bytes, got ${raw.length}`);
  }
  const payload = raw.slice(0, payloadLen);
  if (!equalBytes(checksum4(payload), raw.slice(payloadLen))) {
    throw new PerdeError('BAD_CHECKSUM', `${what} checksum mismatch (typo?)`);
  }
  return payload;
}

function encodeChecked(prefix: string, payload: Uint8Array): string {
  return prefix + base58.encode(concatBytes(payload, checksum4(payload)));
}

/** "perde:" + base58(K_spend ‖ K_view ‖ sha256(K_spend ‖ K_view)[0..4]) */
export function encodeMetaAddress(meta: MetaAddress): string {
  pointFromBytes(meta.spendPub);
  pointFromBytes(meta.viewPub);
  return encodeChecked(META_PREFIX, concatBytes(meta.spendPub, meta.viewPub));
}

export function decodeMetaAddress(s: string): MetaAddress {
  const payload = decodeChecked(s.trim(), META_PREFIX, 64, 'meta-address');
  const spendPub = payload.slice(0, 32);
  const viewPub = payload.slice(32, 64);
  pointFromBytes(spendPub);
  pointFromBytes(viewPub);
  return { spendPub, viewPub };
}

export function isMetaAddress(s: string): boolean {
  try {
    decodeMetaAddress(s);
    return true;
  } catch {
    return false;
  }
}

/** "perdeview:" + base58(K_spend ‖ k_view ‖ sha256(K_spend ‖ k_view)[0..4]) */
export function encodeViewingKey(keys: ViewKeys): string {
  pointFromBytes(keys.spendPub);
  return encodeChecked(VIEWING_KEY_PREFIX, concatBytes(keys.spendPub, scalarToBytes(keys.viewPriv)));
}

export function decodeViewingKey(s: string): ViewKeys {
  const payload = decodeChecked(s.trim(), VIEWING_KEY_PREFIX, 64, 'viewing key');
  const spendPub = payload.slice(0, 32);
  pointFromBytes(spendPub);
  const viewPriv = scalarFromBytes(payload.slice(32, 64));
  return { spendPub, viewPriv, viewPub: baseMul(viewPriv).toBytes() };
}

export function isViewingKey(s: string): boolean {
  try {
    decodeViewingKey(s);
    return true;
  } catch {
    return false;
  }
}
