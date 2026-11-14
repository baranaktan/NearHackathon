import { PerdeError } from '../errors.js';

const ACCOUNT_ID_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/u;

/** NEAR account id syntax (nomicon rules): 2..64 chars, lowercase, separators `.`, `-`, `_`. */
export function isValidAccountId(id: string): boolean {
  return typeof id === 'string' && id.length >= 2 && id.length <= 64 && ACCOUNT_ID_RE.test(id);
}

/** ed25519 implicit account: 64 lowercase hex chars = the public key. */
export function isImplicitAccountId(id: string): boolean {
  return /^[0-9a-f]{64}$/u.test(id);
}

/** ETH-style implicit account (0x + 40 hex). */
export function isEthImplicitAccountId(id: string): boolean {
  return /^0x[0-9a-f]{40}$/u.test(id);
}

export function assertAccountId(id: string, what = 'account id'): void {
  if (!isValidAccountId(id)) throw new PerdeError('INVALID_ACCOUNT_ID', `invalid NEAR ${what}: "${id}"`);
}
