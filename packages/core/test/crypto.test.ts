import { createHash } from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519.js';
import { mnemonicToSeedSync } from '@scure/bip39';
import { base58 } from '@scure/base';
import { describe, expect, it } from 'vitest';
import {
  bytesToHex,
  createReceipt,
  decodeMetaAddress,
  decodeReceipt,
  decodeViewingKey,
  deriveInvoice,
  deriveStealth,
  encodeMetaAddress,
  encodeViewingKey,
  generateMnemonic,
  isMetaAddress,
  isPerdeError,
  keysFromMnemonic,
  L,
  pointFromBytes,
  recoverInvoiceScalar,
  recoverSpendScalar,
  scanAnnouncement,
  scalarToBytes,
  signWithScalar,
  toMetaAddress,
  toViewKeys,
  validateMnemonic,
  verifyReceipt,
  type SpendKeys,
} from '../src/index.js';

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/** Independent re-implementation of H512s with node:crypto, for cross-checking. */
function h512sNode(tag: string, ...data: Uint8Array[]): bigint {
  const h = createHash('sha512');
  h.update(Buffer.from(tag, 'utf8'));
  for (const d of data) h.update(d);
  const digest = h.digest();
  let n = 0n;
  for (let i = digest.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(digest[i] as number);
  return n % L;
}

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (e) {
    expect(isPerdeError(e)).toBe(true);
    expect((e as { code: string }).code).toBe(code);
    return;
  }
  throw new Error(`expected PerdeError ${code}`);
}

const G = ed25519.Point.BASE;

describe('key derivation (known-answer)', () => {
  const keys = keysFromMnemonic(MNEMONIC);

  it('matches an independent node:crypto computation of PLAN §2', () => {
    const seed = mnemonicToSeedSync(MNEMONIC, '');
    expect(keys.spendPriv).toBe(h512sNode('perde/spend/v1', seed));
    expect(keys.viewPriv).toBe(h512sNode('perde/view/v1', seed));
    expect(bytesToHex(keys.spendPub)).toBe(bytesToHex(G.multiply(keys.spendPriv).toBytes()));
  });

  it('stealth + invoice derivation match an independent computation', () => {
    const r = 987654321n;
    const S = ed25519.Point.fromBytes(keys.viewPub).multiply(r).toBytes();
    const h = h512sNode('perde/stealth/v1', S);
    const P = ed25519.Point.fromBytes(keys.spendPub).add(G.multiply(h)).toBytes();
    const tag = createHash('sha256').update(Buffer.from('perde/tag/v1')).update(S).digest()[0];
    expect(deriveStealth(keys, r)).toEqual({
      stealthAccountId: Buffer.from(P).toString('hex'),
      ephemeralPk: Buffer.from(G.multiply(r).toBytes()).toString('hex'),
      viewTag: tag,
      r,
    });
    const idx = Buffer.alloc(4);
    idx.writeUInt32BE(7);
    const r7 = h512sNode('perde/invoice/v1', scalarToBytes(keys.viewPriv), idx);
    expect(deriveInvoice(keys, 7).stealthAccountId).toBe(deriveStealth(keys, r7).stealthAccountId);
    expect(recoverSpendScalar(keys, deriveStealth(keys, r))).toBe((keys.spendPriv + h) % L);
  });

  it('pins the test-vector keys and encodings', () => {
    expect(bytesToHex(keys.spendPub)).toMatchInlineSnapshot(`"e7227ce7fde1ecd9247a02acfc2b27f81e70b23b17006edef79f8d48cb37ff83"`);
    expect(bytesToHex(keys.viewPub)).toMatchInlineSnapshot(`"ed1cef11202898411e732fe2437a17f1b195cd758bbe41584385efc7c931ac22"`);
    expect(encodeMetaAddress(keys)).toMatchInlineSnapshot(`"perde:XEs19o3wLmbQ5FsNyX2dHdc7sgtL1SfmGrJbjtxiDhwB51Q3tHd4VTCXM8HH8URojB1yqkmBF7Zoe45ppiUBGpCDFBidX"`);
    expect(encodeViewingKey(keys)).toMatchInlineSnapshot(`"perdeview:XEs19o3wLmbQ5FsNyX2dHdc7sgtL1SfmGrJbjtxiDhwAKarkpBJvjy5DjsavGoEFRUcNiwRfSRQ3VETpcsA9iBpYC4NXm"`);
  });

  it('pins a stealth derivation with fixed r', () => {
    const d = deriveStealth(keys, 123456789n);
    expect(d).toMatchInlineSnapshot(`
      {
        "ephemeralPk": "17ffad8068dc0de9935d36636f3ad1b5de6de3413b12388e453b05f2a4c1d3db",
        "r": 123456789n,
        "stealthAccountId": "e9574c5956a56b32ae630e0b983ecd7d6de0dd3f33be7688a8c45fe61a114f88",
        "viewTag": 116,
      }
    `);
  });

  it('pins invoice 0 and 7', () => {
    const i0 = deriveInvoice(keys, 0);
    const i7 = deriveInvoice(keys, 7);
    expect([i0.stealthAccountId, i0.ephemeralPk, i0.viewTag]).toMatchInlineSnapshot(`
      [
        "8a30b197599df1f407e586db6a7bdec380e96b3c775e4a112a568140d5057fa9",
        "0b36a5b8bac185778893766ebabbea3acab2ad6489108af96407ec65b8c3527b",
        208,
      ]
    `);
    expect([i7.stealthAccountId, i7.ephemeralPk, i7.viewTag]).toMatchInlineSnapshot(`
      [
        "b031f91c8b916a30dccd95ca440887970640f82db83294b2dc69eb1a2a2d0e49",
        "00b849fe5bbd966f1f40c7fd4f3f91dfaceef429e1cfa251ec8c6164f44a2f6f",
        122,
      ]
    `);
  });

  it('pins a scalar signature', () => {
    const p = recoverSpendScalar(keys, deriveStealth(keys, 123456789n));
    expect(bytesToHex(signWithScalar(p, new TextEncoder().encode('perde')))).toMatchInlineSnapshot(`"2174b33f4b350b98256710ff91d08338336410e65a59efdf4f0208ec2cc5b0a573773480f77c0f3073ed368e51bc906379b367c5967fc6a87c7e49020b2d200f"`);
  });

  it('normalizes whitespace/case in mnemonics and rejects bad ones', () => {
    const k2 = keysFromMnemonic(`  ${MNEMONIC.toUpperCase().replace(/ /g, '   ')} `);
    expect(k2.spendPriv).toBe(keys.spendPriv);
    expect(validateMnemonic(MNEMONIC)).toBe(true);
    expectCode(() => keysFromMnemonic(MNEMONIC.replace('about', 'abandon')), 'INVALID_MNEMONIC');
    expectCode(() => keysFromMnemonic('hello world'), 'INVALID_MNEMONIC');
  });

  it('generates valid 12-word mnemonics', () => {
    const m = generateMnemonic();
    expect(m.split(' ')).toHaveLength(12);
    expect(validateMnemonic(m)).toBe(true);
  });
});

describe('protocol properties (random keys)', () => {
  const N = 25;
  const fresh = (): SpendKeys => keysFromMnemonic(generateMnemonic());

  it('send → scan finds the payment; wrong view key does not', () => {
    for (let i = 0; i < N; i++) {
      const alice = fresh();
      const eve = fresh();
      const meta = encodeMetaAddress(alice);
      const d = deriveStealth(meta);
      const match = scanAnnouncement(toViewKeys(alice), d);
      expect(match?.stealthAccountId).toBe(d.stealthAccountId);
      expect(scanAnnouncement(eve, d)).toBeNull();
      expect(scanAnnouncement(encodeViewingKey(alice), d)?.stealthAccountId).toBe(d.stealthAccountId);
    }
  });

  it('recovered scalar · G == P and the scalar signature verifies with noble', () => {
    for (let i = 0; i < N; i++) {
      const alice = fresh();
      const d = deriveStealth(toMetaAddress(alice));
      const p = recoverSpendScalar(alice, d);
      expect(bytesToHex(G.multiply(p).toBytes())).toBe(d.stealthAccountId);
      const msg = crypto.getRandomValues(new Uint8Array(32));
      const sig = signWithScalar(p, msg);
      const P = Buffer.from(d.stealthAccountId, 'hex');
      expect(ed25519.verify(sig, msg, P)).toBe(true);
      expect(ed25519.verify(sig, msg, P, { zip215: false })).toBe(true);
      const bad = Uint8Array.from(msg);
      bad[0] = (bad[0] as number) ^ 1;
      expect(ed25519.verify(sig, bad, P)).toBe(false);
    }
  });

  it('signWithScalar agrees with RFC 8032 keys: expanded secret scalar signs for the seed public key', () => {
    for (let i = 0; i < 5; i++) {
      const seed = crypto.getRandomValues(new Uint8Array(32));
      const { scalar, pointBytes } = ed25519.utils.getExtendedPublicKey(seed);
      const msg = crypto.getRandomValues(new Uint8Array(64));
      const s = scalar % L;
      expect(ed25519.verify(signWithScalar(s, msg), msg, pointBytes)).toBe(true);
    }
  });

  it('wrong announcement data is ignored, never throws', () => {
    const alice = fresh();
    const d = deriveStealth(alice);
    expect(scanAnnouncement(alice, { ...d, viewTag: (d.viewTag + 1) % 256 })).toBeNull();
    expect(scanAnnouncement(alice, { ...d, ephemeralPk: 'zz' })).toBeNull();
    expect(scanAnnouncement(alice, { ...d, ephemeralPk: '00'.repeat(32) })).toBeNull();
    const other = deriveStealth(fresh());
    expect(scanAnnouncement(alice, { ...d, stealthAccountId: other.stealthAccountId })).toBeNull();
    expectCode(() => recoverSpendScalar(alice, other), 'KEY_MISMATCH');
  });

  it('invoice i is derivable from the viewing key only, and spendable with full keys', () => {
    for (let i = 0; i < 10; i++) {
      const alice = fresh();
      const vkString = encodeViewingKey(alice);
      const fromFull = deriveInvoice(alice, i);
      const fromView = deriveInvoice(vkString, i);
      expect(fromView).toEqual(fromFull);
      const p = recoverInvoiceScalar(alice, i);
      expect(bytesToHex(G.multiply(p).toBytes())).toBe(fromFull.stealthAccountId);
      expect(deriveInvoice(alice, i + 1).stealthAccountId).not.toBe(fromFull.stealthAccountId);
    }
  });

  it('receipt verifies; tampered receipt fails', () => {
    const alice = fresh();
    const meta = encodeMetaAddress(alice);
    const d = deriveStealth(meta);
    const receipt = createReceipt({ meta, r: d.r, stealthAccountId: d.stealthAccountId, tx: 'abc' });
    const v = verifyReceipt(receipt, d);
    expect(v.valid).toBe(true);
    expect(v.data?.tx).toBe('abc');
    expect(decodeReceipt(receipt).stealth).toBe(d.stealthAccountId);

    const other = deriveStealth(meta);
    const data = decodeReceipt(receipt);
    const forge = (patch: object): string =>
      'perdereceipt:' + Buffer.from(JSON.stringify({ ...data, ...patch })).toString('base64url');
    expect(verifyReceipt(forge({ stealth: other.stealthAccountId })).valid).toBe(false);
    expect(verifyReceipt(forge({ r: bytesToHex(scalarToBytes(other.r)) })).valid).toBe(false);
    expect(verifyReceipt(forge({ meta: encodeMetaAddress(fresh()) })).valid).toBe(false);
    expect(verifyReceipt(forge({ v: 2 })).valid).toBe(false);
    expect(verifyReceipt(receipt, other).valid).toBe(false);
    expect(verifyReceipt(receipt, { ...d, viewTag: (d.viewTag + 1) % 256 }).valid).toBe(false);
    expect(verifyReceipt('perdereceipt:!!!').valid).toBe(false);
    expect(verifyReceipt('nope').valid).toBe(false);
    expectCode(() => createReceipt({ meta, r: other.r, stealthAccountId: d.stealthAccountId }), 'INVALID_RECEIPT');
  });
});

describe('encodings', () => {
  const keys = keysFromMnemonic(MNEMONIC);
  const meta = encodeMetaAddress(keys);
  const vk = encodeViewingKey(keys);

  it('round-trips meta-address and viewing key', () => {
    const m = decodeMetaAddress(meta);
    expect(bytesToHex(m.spendPub)).toBe(bytesToHex(keys.spendPub));
    expect(bytesToHex(m.viewPub)).toBe(bytesToHex(keys.viewPub));
    const v = decodeViewingKey(vk);
    expect(v.viewPriv).toBe(keys.viewPriv);
    expect(bytesToHex(v.viewPub)).toBe(bytesToHex(keys.viewPub));
    expect(encodeViewingKey(v)).toBe(vk);
    expect(isMetaAddress(meta)).toBe(true);
  });

  it('round-trips random keys', () => {
    for (let i = 0; i < 10; i++) {
      const k = keysFromMnemonic(generateMnemonic());
      expect(encodeMetaAddress(decodeMetaAddress(encodeMetaAddress(k)))).toBe(encodeMetaAddress(k));
      expect(encodeViewingKey(decodeViewingKey(encodeViewingKey(k)))).toBe(encodeViewingKey(k));
    }
  });

  it('detects typos via checksum and rejects bad prefixes/lengths', () => {
    const body = meta.slice('perde:'.length);
    const pos = 10;
    const swapped = body[pos] === '2' ? '3' : '2';
    expectCode(() => decodeMetaAddress('perde:' + body.slice(0, pos) + swapped + body.slice(pos + 1)), 'BAD_CHECKSUM');
    expectCode(() => decodeMetaAddress('stealth:' + body), 'INVALID_PREFIX');
    expectCode(() => decodeMetaAddress('perde:0OIl'), 'INVALID_ENCODING');
    expectCode(() => decodeMetaAddress('perde:' + body.slice(0, -3)), 'INVALID_LENGTH');
    expectCode(() => decodeViewingKey(meta), 'INVALID_PREFIX');
    expectCode(() => decodeMetaAddress(vk), 'INVALID_PREFIX');
    expect(isMetaAddress('perde:abc')).toBe(false);
  });

  it('rejects low-order and invalid points in meta-addresses', () => {
    const lowOrder = ['0100000000000000000000000000000000000000000000000000000000000000', 'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f', '0000000000000000000000000000000000000000000000000000000000000000'];
    for (const hex of lowOrder) {
      const bad = Buffer.from(hex, 'hex');
      expectCode(() => pointFromBytes(bad), 'INVALID_POINT');
      const payload = new Uint8Array([...bad, ...keys.viewPub]);
      const sum = createHash('sha256').update(payload).digest().subarray(0, 4);
      expectCode(() => decodeMetaAddress('perde:' + base58.encode(new Uint8Array([...payload, ...sum]))), 'INVALID_POINT');
    }
    const mixed = G.multiply(5n).add(ed25519.Point.fromHex('c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa')).toBytes();
    expectCode(() => pointFromBytes(mixed), 'INVALID_POINT');
    expectCode(() => encodeMetaAddress({ spendPub: new Uint8Array(32), viewPub: keys.viewPub }), 'INVALID_POINT');
  });

  it('rejects zero / out-of-range scalars', () => {
    expectCode(() => deriveStealth(keys, 0n), 'INVALID_SCALAR');
    expectCode(() => deriveStealth(keys, L), 'INVALID_SCALAR');
    expectCode(() => signWithScalar(0n, new Uint8Array(1)), 'INVALID_SCALAR');
    const zeroVk = new Uint8Array([...keys.spendPub, ...new Uint8Array(32)]);
    const sum = createHash('sha256').update(zeroVk).digest().subarray(0, 4);
    expectCode(() => decodeViewingKey('perdeview:' + base58.encode(new Uint8Array([...zeroVk, ...sum]))), 'INVALID_SCALAR');
  });
});
