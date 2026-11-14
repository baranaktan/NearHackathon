import { describe, expect, it } from 'vitest';
import { encodeMetaAddress, keysFromMnemonic } from '@perde/core';
import { buildPayLink, NOTE_MAX, parsePayParams } from './params';

const META = encodeMetaAddress(keysFromMnemonic('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'));
const HEX = '0123456789abcdef'.repeat(4);
const p = (q: string) => parsePayParams(new URLSearchParams(q));

describe('parsePayParams', () => {
  it('accepts a meta-address with amount and note', () => {
    expect(p(`to=${META}&amount=1.25&note=Rent`)).toEqual({ kind: 'meta', metaAddress: META, amountYocto: '1250000000000000000000000', note: 'Rent' });
  });

  it('accepts a 64-hex invoice account without amount', () => {
    expect(p(`to=${HEX}`)).toEqual({ kind: 'invoice', account: HEX, amountYocto: null, note: '' });
  });

  it.each([
    ['', 'no recipient'],
    ['to=alice.testnet', 'must be a perde: meta-address'],
    [`to=${META.slice(0, -2)}xx`, 'damaged'],
    [`to=${HEX.toUpperCase()}`, 'must be a perde: meta-address'],
    [`to=${HEX}&amount=-1`, 'not a plain decimal'],
    [`to=${HEX}&amount=1e3`, 'not a plain decimal'],
    [`to=${HEX}&amount=0`, 'more than 0'],
    [`to=${HEX}&amount=99999999999`, 'implausibly large'],
    [`to=${HEX}&to=${HEX}`, 'ambiguous'],
    [`to=${HEX}&note=${'x'.repeat(NOTE_MAX + 1)}`, 'longer than'],
  ])('rejects %s', (q, reason) => {
    const r = p(q);
    expect(r.kind).toBe('invalid');
    expect(r.kind === 'invalid' && r.reason).toContain(reason);
  });

  it('strips control and bidi characters from the note', () => {
    const r = p(`to=${HEX}&note=${encodeURIComponent('pay‮me\u0000 now')}`);
    expect(r.kind === 'invoice' && r.note).toBe('pay me now');
  });

  it('round-trips with buildPayLink', () => {
    const link = buildPayLink(HEX, { amountYocto: '30000000000000000000000', note: 'Nov & Dec' }, 'https://perde.example/');
    expect(link.startsWith('https://perde.example/#/pay?')).toBe(true);
    const q = new URLSearchParams(link.split('#/pay?')[1]);
    expect(parsePayParams(q)).toEqual({ kind: 'invoice', account: HEX, amountYocto: '30000000000000000000000', note: 'Nov & Dec' });
  });
});
