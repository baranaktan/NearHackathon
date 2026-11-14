import { ed25519 } from '@noble/curves/ed25519.js';
import type { EdwardsPoint } from '@noble/curves/abstract/edwards.js';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, hexToBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { PerdeError } from '../errors.js';

/**
 * Low-level ed25519 helpers for Perde v1.
 *
 * Constant-time note: all scalar arithmetic uses JS bigint, which is not
 * constant-time. Perde runs in the key owner's own browser/process, so timing
 * side channels are out of scope (documented in the README).
 */

export type Point = EdwardsPoint;

export const Point = ed25519.Point;
/** Prime order of the ed25519 base point subgroup. */
export const L: bigint = ed25519.Point.Fn.ORDER;

export { bytesToHex, hexToBytes, concatBytes, utf8ToBytes, randomBytes, sha256, sha512 };

export function bytesToNumberLE(bytes: Uint8Array): bigint {
  let n = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i] as number);
  return n;
}

export function mod(a: bigint, m: bigint = L): bigint {
  const r = a % m;
  return r >= 0n ? r : r + m;
}

/** 32-byte little-endian encoding of a scalar in [0, L). */
export function scalarToBytes(s: bigint): Uint8Array {
  if (s < 0n || s >= L) throw new PerdeError('INVALID_SCALAR', 'scalar out of range');
  const out = new Uint8Array(32);
  let x = s;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

/** Strict decode: exactly 32 bytes, canonical (< L) and non-zero. */
export function scalarFromBytes(bytes: Uint8Array): bigint {
  if (bytes.length !== 32) throw new PerdeError('INVALID_LENGTH', `scalar must be 32 bytes, got ${bytes.length}`);
  const s = bytesToNumberLE(bytes);
  assertScalar(s);
  return s;
}

export function assertScalar(s: bigint): void {
  if (s <= 0n || s >= L) throw new PerdeError('INVALID_SCALAR', 'scalar must be in [1, L)');
}

/** H512s(tag, ...data) = SHA-512(utf8(tag) ‖ data...) interpreted little-endian, reduced mod L. */
export function H512s(tag: string, ...data: Uint8Array[]): bigint {
  return mod(bytesToNumberLE(sha512(concatBytes(utf8ToBytes(tag), ...data))));
}

/** Uniform random non-zero scalar (512 random bits reduced mod L). */
export function randomScalar(): bigint {
  for (;;) {
    const s = mod(bytesToNumberLE(randomBytes(64)));
    if (s !== 0n) return s;
  }
}

export function baseMul(s: bigint): Point {
  assertScalar(s);
  return Point.BASE.multiply(s);
}

/**
 * Decode a public point and reject anything that is not a canonical encoding
 * of a non-identity element of the prime-order subgroup (low-order and
 * mixed-order points are refused).
 */
export function pointFromBytes(bytes: Uint8Array): Point {
  if (bytes.length !== 32) throw new PerdeError('INVALID_LENGTH', `point must be 32 bytes, got ${bytes.length}`);
  let p: Point;
  try {
    p = Point.fromBytes(bytes, false);
  } catch (e) {
    throw new PerdeError('INVALID_POINT', 'not a valid ed25519 point encoding', e);
  }
  if (p.is0() || p.isSmallOrder() || !p.isTorsionFree()) {
    throw new PerdeError('INVALID_POINT', 'point is low-order or not in the prime-order subgroup');
  }
  if (!equalBytes(p.toBytes(), bytes)) throw new PerdeError('INVALID_POINT', 'non-canonical point encoding');
  return p;
}

export function pointFromHex(hex: string): Point {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new PerdeError('INVALID_ENCODING', 'point hex must be 64 lowercase hex chars');
  return pointFromBytes(hexToBytes(hex));
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

export function u32be(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new PerdeError('INVALID_AMOUNT', `u32 out of range: ${n}`);
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

export function checksum4(data: Uint8Array): Uint8Array {
  return sha256(data).slice(0, 4);
}
