/**
 * `#/pay?to=…&amount=…&note=…` — what a payer opens from a link or QR code.
 * Parsed strictly: anything ambiguous is rejected rather than guessed. The
 * note is untrusted text from whoever made the link; render it as text only.
 */
import { decodeMetaAddress, encodeMetaAddress } from '@perde/core';
import { formatYocto, parseNearToYocto } from '../../lib/near-format';

export const NOTE_MAX = 140;
const MAX_AMOUNT_YOCTO = 10n ** 33n; // 1e9 NEAR: anything above is a malformed link
/** C0/C1 controls, zero-width characters and bidi overrides (written as escapes on purpose). */
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const UNSAFE_CHARS = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u202a-\\u202e\\u2066-\\u2069]', 'g');

export type PayTarget =
  | { kind: 'meta'; metaAddress: string; amountYocto: string | null; note: string }
  | { kind: 'invoice'; account: string; amountYocto: string | null; note: string }
  | { kind: 'invalid'; reason: string };

function single(params: URLSearchParams, name: string): string | null | 'duplicate' {
  const all = params.getAll(name);
  if (all.length > 1) return 'duplicate';
  return all[0] ?? null;
}

export function parsePayParams(params: URLSearchParams): PayTarget {
  const to = single(params, 'to');
  const amount = single(params, 'amount');
  const note = single(params, 'note');
  if (to === 'duplicate' || amount === 'duplicate' || note === 'duplicate') return { kind: 'invalid', reason: 'The link repeats a parameter, so it is ambiguous.' };
  if (to === null || to.trim() === '') return { kind: 'invalid', reason: 'The link has no recipient (“to”).' };

  let amountYocto: string | null = null;
  if (amount !== null && amount.trim() !== '') {
    const a = amount.trim();
    if (!/^\d+(\.\d{1,24})?$/.test(a)) return { kind: 'invalid', reason: 'The amount in the link is not a plain decimal number of NEAR.' };
    const parsed = parseNearToYocto(a);
    if (!parsed.ok || parsed.yocto === '0') return { kind: 'invalid', reason: 'The amount in the link must be more than 0.' };
    if (BigInt(parsed.yocto) > MAX_AMOUNT_YOCTO) return { kind: 'invalid', reason: 'The amount in the link is implausibly large.' };
    amountYocto = parsed.yocto;
  }

  // Strip control and bidi-override characters; keep it short. It is shown as plain text, never as HTML or a link.
  const cleanNote = (note ?? '').replace(UNSAFE_CHARS, ' ').replace(/\s+/g, ' ').trim();
  if (cleanNote.length > NOTE_MAX) return { kind: 'invalid', reason: `The note is longer than ${NOTE_MAX} characters.` };

  const target = to.trim();
  if (target.startsWith('perde:')) {
    try {
      return { kind: 'meta', metaAddress: encodeMetaAddress(decodeMetaAddress(target)), amountYocto, note: cleanNote };
    } catch {
      return { kind: 'invalid', reason: 'The meta-address in the link is damaged (bad characters or checksum).' };
    }
  }
  if (/^[0-9a-f]{64}$/.test(target)) return { kind: 'invoice', account: target, amountYocto, note: cleanNote };
  return { kind: 'invalid', reason: 'The recipient must be a perde: meta-address or a 64-hex invoice account.' };
}

/** Absolute link to the pay page of this deployment (works on any static host). */
export function buildPayLink(to: string, opts: { amountYocto?: string | null; note?: string } = {}, base?: string): string {
  const root = base ?? `${window.location.origin}${window.location.pathname}`;
  const q = new URLSearchParams({ to });
  if (opts.amountYocto) q.set('amount', formatYocto(opts.amountYocto, { maxFractionDigits: 24, group: false }));
  if (opts.note) q.set('note', opts.note.slice(0, NOTE_MAX));
  return `${root}#/pay?${q.toString()}`;
}
