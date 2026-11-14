import { describe, expect, it } from 'vitest';
import { acceptAmountInput, classifyRecipient, formatYocto, parseNearToYocto, sanitizeAmountInput, truncateMiddle } from './near-format';

describe('parseNearToYocto', () => {
  it('converts decimals without floating point', () => {
    expect(parseNearToYocto('1.5')).toEqual({ ok: true, yocto: '1500000000000000000000000' });
    expect(parseNearToYocto('0.000000000000000000000001')).toEqual({ ok: true, yocto: '1' });
    expect(parseNearToYocto('123456789.123456789')).toEqual({ ok: true, yocto: '123456789123456789000000000000000' });
  });
  it('rejects bad input', () => {
    expect(parseNearToYocto('').ok).toBe(false);
    expect(parseNearToYocto('-1').ok).toBe(false);
    expect(parseNearToYocto('1.2.3').ok).toBe(false);
    expect(parseNearToYocto('0.' + '1'.repeat(25)).ok).toBe(false);
  });
});

describe('formatYocto', () => {
  it('trims and groups', () => {
    expect(formatYocto('250000000000000000000000000')).toBe('250');
    expect(formatYocto('1240500000000000000000000000')).toBe('1,240.5');
    expect(formatYocto('2502000000000000000000000')).toBe('2.502');
  });
  it('never shows dust as zero', () => {
    expect(formatYocto('1')).toBe('<0.0001');
    expect(formatYocto('0')).toBe('0');
  });
});

describe('sanitizeAmountInput', () => {
  it('keeps digits and one dot', () => {
    expect(sanitizeAmountInput('12,5')).toBe('12.5');
    expect(sanitizeAmountInput('1.2.3')).toBe('1.23');
    expect(sanitizeAmountInput('007')).toBe('7');
    expect(sanitizeAmountInput('0.5abc')).toBe('0.5');
  });
});

describe('acceptAmountInput', () => {
  it('refuses input whose meaning would change when cleaned', () => {
    expect(acceptAmountInput('1e-3', '0.5')).toBe('0.5');
    expect(acceptAmountInput('1E3', '')).toBe('');
    expect(acceptAmountInput('-5', '2')).toBe('2');
    expect(acceptAmountInput('+5', '2')).toBe('2');
    expect(acceptAmountInput('1,000.50', '')).toBe('');
    expect(acceptAmountInput('1,000,000', '')).toBe('');
  });
  it('accepts plain decimals, a decimal comma and surrounding spaces', () => {
    expect(acceptAmountInput(' 12,5 ', '')).toBe('12.5');
    expect(acceptAmountInput('0.25', '0.2')).toBe('0.25');
    expect(acceptAmountInput('', '3')).toBe('');
    expect(acceptAmountInput('0.' + '1'.repeat(30), '')).toBe('0.' + '1'.repeat(24));
  });
});

describe('identifiers', () => {
  it('middle-truncates', () => {
    expect(truncateMiddle('f1746fde79b38d7a2ca71e273164a5d4b4e5c13511af89f242409608a1261e84')).toBe('f1746f…261e84');
    expect(truncateMiddle('short')).toBe('short');
  });
  it('classifies recipients', () => {
    expect(classifyRecipient('alice.testnet')).toBe('name');
    expect(classifyRecipient('f1746fde79b38d7a2ca71e273164a5d4b4e5c13511af89f242409608a1261e84')).toBe('implicit');
    expect(classifyRecipient('perde:KiueHztcJDDjak6937JRQKxEJQ5GPiEjk2Y72ESDcQiqmZYmi4wCeiYR16ztLyQ')).toBe('meta');
    expect(classifyRecipient('perde:0OIl')).toBe('unknown');
    expect(classifyRecipient('Not An Account')).toBe('unknown');
  });
});
