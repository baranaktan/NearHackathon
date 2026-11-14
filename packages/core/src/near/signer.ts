import { ed25519 } from '@noble/curves/ed25519.js';
import { base58 } from '@scure/base';
import { PerdeError } from '../errors.js';
import { bytesToHex, equalBytes, randomBytes } from '../crypto/primitives.js';
import { publicKeyFromScalar, signWithScalar } from '../crypto/stealth.js';

/** Signs NEAR transaction hashes with an ed25519 key. */
export interface Signer {
  /** 32-byte ed25519 public key. */
  readonly publicKey: Uint8Array;
  /** Signs `message` (for NEAR transactions: sha256 of the borsh-encoded tx). Returns 64 bytes. */
  sign(message: Uint8Array): Promise<Uint8Array>;
}

export function encodePublicKey(pub: Uint8Array): string {
  if (pub.length !== 32) throw new PerdeError('INVALID_KEY', 'ed25519 public key must be 32 bytes');
  return `ed25519:${base58.encode(pub)}`;
}

export function decodePublicKey(s: string): Uint8Array {
  if (!s.startsWith('ed25519:')) throw new PerdeError('INVALID_KEY', 'public key must start with "ed25519:"');
  let b: Uint8Array;
  try {
    b = base58.decode(s.slice(8));
  } catch (e) {
    throw new PerdeError('INVALID_KEY', 'public key is not base58', e);
  }
  if (b.length !== 32) throw new PerdeError('INVALID_KEY', 'ed25519 public key must be 32 bytes');
  return b;
}

/** Implicit account id for a public key: hex of the 32 key bytes. */
export function implicitAccountId(pub: Uint8Array): string {
  if (pub.length !== 32) throw new PerdeError('INVALID_KEY', 'ed25519 public key must be 32 bytes');
  return bytesToHex(pub);
}

/** Signs with a raw stealth scalar p (public key P = p·G). */
export class ScalarSigner implements Signer {
  readonly publicKey: Uint8Array;
  readonly #scalar: bigint;

  constructor(scalar: bigint) {
    this.#scalar = scalar;
    this.publicKey = publicKeyFromScalar(scalar);
  }

  get accountId(): string {
    return implicitAccountId(this.publicKey);
  }

  sign(message: Uint8Array): Promise<Uint8Array> {
    return Promise.resolve(signWithScalar(this.#scalar, message));
  }
}

/**
 * Standard ed25519 key in NEAR's "ed25519:<base58(seed32 ‖ pub32)>" secret key
 * format (also accepts a bare 32-byte seed in base58).
 */
export class SeedSigner implements Signer {
  readonly publicKey: Uint8Array;
  readonly #seed: Uint8Array;

  private constructor(seed: Uint8Array) {
    this.#seed = seed;
    this.publicKey = ed25519.getPublicKey(seed);
  }

  static generate(): SeedSigner {
    return new SeedSigner(randomBytes(32));
  }

  static fromSeed(seed: Uint8Array): SeedSigner {
    if (seed.length !== 32) throw new PerdeError('INVALID_KEY', 'ed25519 seed must be 32 bytes');
    return new SeedSigner(Uint8Array.from(seed));
  }

  static fromSecretKey(secretKey: string): SeedSigner {
    if (!secretKey.startsWith('ed25519:')) throw new PerdeError('INVALID_KEY', 'secret key must start with "ed25519:"');
    let raw: Uint8Array;
    try {
      raw = base58.decode(secretKey.slice(8));
    } catch (e) {
      throw new PerdeError('INVALID_KEY', 'secret key is not base58', e);
    }
    if (raw.length === 32) return new SeedSigner(raw);
    if (raw.length !== 64) throw new PerdeError('INVALID_KEY', `secret key must be 32 or 64 bytes, got ${raw.length}`);
    const signer = new SeedSigner(raw.slice(0, 32));
    if (!equalBytes(signer.publicKey, raw.slice(32))) {
      throw new PerdeError('INVALID_KEY', 'secret key public half does not match its seed');
    }
    return signer;
  }

  /** NEAR-format secret key string (handle like a password). */
  get secretKey(): string {
    const full = new Uint8Array(64);
    full.set(this.#seed, 0);
    full.set(this.publicKey, 32);
    return `ed25519:${base58.encode(full)}`;
  }

  get publicKeyString(): string {
    return encodePublicKey(this.publicKey);
  }

  sign(message: Uint8Array): Promise<Uint8Array> {
    return Promise.resolve(ed25519.sign(message, this.#seed));
  }
}
