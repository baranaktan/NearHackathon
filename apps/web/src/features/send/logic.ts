/** Pure pieces of the Send flow (tested without a network). */
import { decodeMetaAddress, encodeMetaAddress, isValidAccountId } from '@perde/core';
import { formatYocto, parseNearToYocto } from '../../lib/near-format';
import type { RecipientResolution } from './types';

export type RecipientInput =
  | { kind: 'empty' }
  | { kind: 'meta'; metaAddress: string }
  | { kind: 'name'; name: string }
  | { kind: 'invalid'; message: string };

export function classifyRecipientInput(raw: string): RecipientInput {
  const v = raw.trim();
  if (!v) return { kind: 'empty' };
  if (v.startsWith('perde:')) {
    try {
      return { kind: 'meta', metaAddress: encodeMetaAddress(decodeMetaAddress(v)) };
    } catch (e) {
      const code = (e as { code?: string }).code;
      return {
        kind: 'invalid',
        message: code === 'BAD_CHECKSUM' ? 'Checksum mismatch: a character of this meta-address is wrong or missing.' : 'This meta-address is damaged or incomplete.',
      };
    }
  }
  if (v.startsWith('perdeview:')) return { kind: 'invalid', message: 'That is a viewing key, not an address. Ask for the perde: meta-address.' };
  if (/^[0-9a-f]{64}$/.test(v)) {
    return { kind: 'invalid', message: 'That is a plain implicit account. Ask for a perde: address or a registered name — or, for a Perde invoice, open its pay link.' };
  }
  const name = v.toLowerCase();
  if (isValidAccountId(name)) {
    if (name.endsWith('.near')) return { kind: 'invalid', message: 'That is a mainnet name. This build runs on NEAR testnet (names end in .testnet).' };
    return { kind: 'name', name };
  }
  return { kind: 'invalid', message: 'Enter a perde: meta-address or a NEAR account name like alice.testnet.' };
}

/** Classify, then look a name up in the on-chain directory. */
export async function resolveRecipientInput(raw: string, lookup: (name: string) => Promise<string | null>): Promise<RecipientResolution> {
  const c = classifyRecipientInput(raw);
  switch (c.kind) {
    case 'empty':
      return { status: 'empty' };
    case 'invalid':
      return { status: 'invalid', message: c.message };
    case 'meta':
      return { status: 'resolved', input: raw.trim(), kind: 'meta', metaAddress: c.metaAddress, name: null };
    case 'name': {
      const meta = await lookup(c.name);
      if (meta === null) return { status: 'invalid', message: `${c.name} hasn’t registered a Perde meta-address (or the account doesn’t exist).` };
      return { status: 'resolved', input: raw.trim(), kind: 'name', metaAddress: meta, name: c.name };
    }
  }
}

export interface AmountCheckInput {
  input: string;
  minYocto: bigint | null;
  /** Extra cost per payment on top of the amount (announcement fee). */
  feeYocto: bigint | null;
  gasReserveYocto: bigint | null;
  spendableYocto: bigint | null;
}

export type AmountCheck = { ok: true; yocto: bigint } | { ok: false; error: string | null };

/** null error = nothing typed yet (no message, but not reviewable). */
export function checkAmount({ input, minYocto, feeYocto, gasReserveYocto, spendableYocto }: AmountCheckInput): AmountCheck {
  if (input.trim() === '') return { ok: false, error: null };
  const parsed = parseNearToYocto(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const yocto = BigInt(parsed.yocto);
  if (yocto === 0n) return { ok: false, error: 'Amount must be more than 0' };
  if (minYocto !== null && yocto < minYocto) return { ok: false, error: `The minimum is ${formatYocto(minYocto)} NEAR per payment` };
  if (spendableYocto !== null && feeYocto !== null && gasReserveYocto !== null) {
    const need = yocto + feeYocto + gasReserveYocto;
    if (need > spendableYocto) {
      return {
        ok: false,
        error: `Not enough balance: ${formatYocto(need)} NEAR needed with fee and gas headroom, ${formatYocto(spendableYocto)} NEAR available`,
      };
    }
  }
  return { ok: true, yocto };
}

/** Largest amount that still leaves room for the fee and gas (0 if none). */
export function maxSendable(spendable: bigint, fee: bigint, gasReserve: bigint): bigint {
  const max = spendable - fee - gasReserve;
  return max > 0n ? max : 0n;
}
