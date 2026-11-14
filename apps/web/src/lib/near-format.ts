/**
 * Display helpers for NEAR amounts and account ids.
 *
 * Amounts are always carried as yoctoNEAR decimal strings (1 NEAR = 10^24
 * yocto) and converted with BigInt, never with floating point.
 */

export const NEAR_DECIMALS = 24;
const ONE_NEAR = 10n ** BigInt(NEAR_DECIMALS);

export type ParseResult = { ok: true; yocto: string } | { ok: false; error: string };

/** Keep only what a NEAR amount field may contain: digits and one dot. */
export function sanitizeAmountInput(raw: string): string {
  let out = raw.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const firstDot = out.indexOf('.');
  if (firstDot !== -1) {
    out = out.slice(0, firstDot + 1) + out.slice(firstDot + 1).replace(/\./g, '');
    const [whole = '', frac = ''] = out.split('.');
    out = `${whole}.${frac.slice(0, NEAR_DECIMALS)}`;
  }
  // collapse leading zeros ("007" -> "7") but keep "0." intact
  out = out.replace(/^0+(?=\d)/, '');
  return out;
}

/**
 * What an amount field shows after a keystroke or paste. Input whose meaning
 * would change by dropping characters is refused (the field keeps `previous`)
 * instead of being "cleaned": a pasted "1e-3" must not become 13, "-5" must
 * not become 5, and "1,000.50" (thousands separator) must not become 1.0005.
 * A lone comma is still read as a decimal separator ("12,5" -> "12.5").
 */
export function acceptAmountInput(raw: string, previous: string): string {
  const v = raw.trim();
  if (/[eE+-]/.test(v) || (v.includes(',') && v.includes('.')) || (v.match(/,/g)?.length ?? 0) > 1) return previous;
  return sanitizeAmountInput(v);
}

/** "1.5" -> "1500000000000000000000000". Rejects empty, zero-only is allowed (caller decides). */
export function parseNearToYocto(input: string): ParseResult {
  const value = input.trim();
  if (value === '') return { ok: false, error: 'Enter an amount' };
  if (!/^\d*\.?\d*$/.test(value) || value === '.') return { ok: false, error: 'Use digits and a dot, e.g. 2.5' };
  const [whole = '0', frac = ''] = value.split('.');
  if (frac.length > NEAR_DECIMALS) return { ok: false, error: `At most ${NEAR_DECIMALS} decimals` };
  const yocto = BigInt(whole || '0') * ONE_NEAR + BigInt((frac + '0'.repeat(NEAR_DECIMALS)).slice(0, NEAR_DECIMALS) || '0');
  return { ok: true, yocto: yocto.toString() };
}

/** "1500000000000000000000000" -> "1.5". Trims trailing zeros, groups thousands. */
export function formatYocto(yocto: string | bigint, opts: { maxFractionDigits?: number; group?: boolean } = {}): string {
  const { maxFractionDigits = 4, group = true } = opts;
  let v = typeof yocto === 'bigint' ? yocto : BigInt(yocto || '0');
  const negative = v < 0n;
  if (negative) v = -v;
  const whole = v / ONE_NEAR;
  const fracFull = (v % ONE_NEAR).toString().padStart(NEAR_DECIMALS, '0');
  const frac = fracFull.slice(0, maxFractionDigits).replace(/0+$/, '');
  const wholeStr = group ? whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') : whole.toString();
  // Never show a non-zero amount as "0".
  if (whole === 0n && frac === '' && v > 0n) {
    return `${negative ? '-' : ''}<0.${'0'.repeat(Math.max(0, maxFractionDigits - 1))}1`;
  }
  return `${negative ? '-' : ''}${wholeStr}${frac ? `.${frac}` : ''}`;
}

/** Middle-truncate long identifiers: "4f3a91…07c91e". */
export function truncateMiddle(value: string, head = 6, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export const isImplicitAccount = (s: string): boolean => /^[0-9a-f]{64}$/.test(s);

/** NEAR named account ids: 2–64 chars, lowercase, dot-separated parts. */
export const isNamedAccount = (s: string): boolean =>
  s.length >= 2 && s.length <= 64 && /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(s) && !isImplicitAccount(s);

export const isMetaAddress = (s: string): boolean => /^perde:[1-9A-HJ-NP-Za-km-z]{40,}$/.test(s);

export type RecipientKind = 'meta' | 'name' | 'implicit' | 'unknown';

export function classifyRecipient(s: string): RecipientKind {
  const v = s.trim();
  if (v.startsWith('perde:')) return isMetaAddress(v) ? 'meta' : 'unknown';
  if (isImplicitAccount(v)) return 'implicit';
  if (isNamedAccount(v)) return 'name';
  return 'unknown';
}
