import { PerdeError } from '../errors.js';

export const NEAR_DECIMALS = 24;
export const YOCTO_PER_NEAR = 10n ** 24n;
export const GAS_PER_TGAS = 10n ** 12n;

/** "1.5" → 1500000000000000000000000n. Exact decimal parsing, no floats. */
export function parseNear(amount: string): bigint {
  const s = amount.trim();
  const m = /^(\d+)(?:\.(\d*))?$/u.exec(s) ?? /^()\.(\d+)$/u.exec(s);
  if (m === null) throw new PerdeError('INVALID_AMOUNT', `not a NEAR amount: "${amount}"`);
  const whole = m[1] === '' || m[1] === undefined ? '0' : m[1];
  const frac = m[2] ?? '';
  if (frac.length > NEAR_DECIMALS) throw new PerdeError('INVALID_AMOUNT', `more than ${NEAR_DECIMALS} decimals: "${amount}"`);
  return BigInt(whole) * YOCTO_PER_NEAR + BigInt(frac.padEnd(NEAR_DECIMALS, '0') || '0');
}

export interface FormatNearOptions {
  /** Maximum fraction digits to keep (truncates toward zero). Default 24 (exact). */
  readonly maxDecimals?: number;
}

/** 1500000000000000000000000n → "1.5". Trailing zeros are removed. */
export function formatNear(yocto: bigint, options: FormatNearOptions = {}): string {
  const maxDecimals = options.maxDecimals ?? NEAR_DECIMALS;
  if (!Number.isInteger(maxDecimals) || maxDecimals < 0 || maxDecimals > NEAR_DECIMALS) {
    throw new PerdeError('INVALID_AMOUNT', 'maxDecimals must be an integer in [0, 24]');
  }
  const neg = yocto < 0n;
  const abs = neg ? -yocto : yocto;
  const whole = abs / YOCTO_PER_NEAR;
  const frac = (abs % YOCTO_PER_NEAR).toString().padStart(NEAR_DECIMALS, '0').slice(0, maxDecimals).replace(/0+$/u, '');
  const body = frac === '' ? whole.toString() : `${whole.toString()}.${frac}`;
  return neg && body !== '0' ? `-${body}` : body;
}

export function tgas(n: number | bigint): bigint {
  if (typeof n === 'number' && (!Number.isInteger(n) || n < 0)) throw new PerdeError('INVALID_AMOUNT', 'Tgas must be a non-negative integer');
  return BigInt(n) * GAS_PER_TGAS;
}

/** Parse a non-negative integer yocto amount from string/bigint input. */
export function toYocto(amount: bigint | string): bigint {
  if (typeof amount === 'bigint') {
    if (amount < 0n) throw new PerdeError('INVALID_AMOUNT', 'amount must be non-negative');
    return amount;
  }
  if (!/^\d+$/u.test(amount)) throw new PerdeError('INVALID_AMOUNT', `not an integer yocto amount: "${amount}"`);
  return BigInt(amount);
}
