import { generateMnemonic as bip39Generate, mnemonicToSeedSync, validateMnemonic as bip39Validate } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { PerdeError } from '../errors.js';
import { assertScalar, baseMul, H512s } from './primitives.js';

/** Public half of a Perde identity: what senders need. */
export interface MetaAddress {
  readonly spendPub: Uint8Array;
  readonly viewPub: Uint8Array;
}

/** View-only keys: can find payments (and invoices) but cannot spend. */
export interface ViewKeys extends MetaAddress {
  readonly viewPriv: bigint;
}

/** Full keys: can find and spend. */
export interface SpendKeys extends ViewKeys {
  readonly spendPriv: bigint;
}

export const TAG_SPEND = 'perde/spend/v1';
export const TAG_VIEW = 'perde/view/v1';

export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().split(/\s+/u).join(' ');
}

/** New 12-word BIP-39 mnemonic (128 bits of entropy). */
export function generateMnemonic(): string {
  return bip39Generate(wordlist, 128);
}

export function validateMnemonic(mnemonic: string): boolean {
  return bip39Validate(normalizeMnemonic(mnemonic), wordlist);
}

export function keysFromSeed(seed: Uint8Array): SpendKeys {
  if (seed.length !== 64) throw new PerdeError('INVALID_LENGTH', `BIP-39 seed must be 64 bytes, got ${seed.length}`);
  const spendPriv = H512s(TAG_SPEND, seed);
  const viewPriv = H512s(TAG_VIEW, seed);
  assertScalar(spendPriv);
  assertScalar(viewPriv);
  return {
    spendPriv,
    viewPriv,
    spendPub: baseMul(spendPriv).toBytes(),
    viewPub: baseMul(viewPriv).toBytes(),
  };
}

/** Mnemonic → keys (BIP-39 seed with empty passphrase). */
export function keysFromMnemonic(mnemonic: string): SpendKeys {
  const m = normalizeMnemonic(mnemonic);
  if (!bip39Validate(m, wordlist)) throw new PerdeError('INVALID_MNEMONIC', 'invalid BIP-39 mnemonic (words or checksum)');
  return keysFromSeed(mnemonicToSeedSync(m, ''));
}

export function toViewKeys(keys: ViewKeys): ViewKeys {
  return { spendPub: keys.spendPub, viewPub: keys.viewPub, viewPriv: keys.viewPriv };
}

export function toMetaAddress(keys: MetaAddress): MetaAddress {
  return { spendPub: keys.spendPub, viewPub: keys.viewPub };
}
