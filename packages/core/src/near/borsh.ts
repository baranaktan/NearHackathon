import { PerdeError } from '../errors.js';

const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;

/** Minimal borsh writer covering the types used by NEAR transactions. */
export class BorshWriter {
  private chunks: Uint8Array[] = [];
  private size = 0;

  private push(b: Uint8Array): this {
    this.chunks.push(b);
    this.size += b.length;
    return this;
  }

  u8(n: number): this {
    if (!Number.isInteger(n) || n < 0 || n > 0xff) throw new PerdeError('INVALID_AMOUNT', `u8 out of range: ${n}`);
    return this.push(Uint8Array.of(n));
  }

  u32(n: number): this {
    if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new PerdeError('INVALID_AMOUNT', `u32 out of range: ${n}`);
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    return this.push(b);
  }

  private uint(n: bigint, bytes: number, max: bigint, name: string): this {
    if (n < 0n || n > max) throw new PerdeError('INVALID_AMOUNT', `${name} out of range: ${n}`);
    const b = new Uint8Array(bytes);
    let x = n;
    for (let i = 0; i < bytes; i++) {
      b[i] = Number(x & 0xffn);
      x >>= 8n;
    }
    return this.push(b);
  }

  u64(n: bigint): this {
    return this.uint(n, 8, U64_MAX, 'u64');
  }

  u128(n: bigint): this {
    return this.uint(n, 16, U128_MAX, 'u128');
  }

  fixed(b: Uint8Array, len: number): this {
    if (b.length !== len) throw new PerdeError('INVALID_LENGTH', `expected ${len} bytes, got ${b.length}`);
    return this.push(b);
  }

  bytes(b: Uint8Array): this {
    return this.u32(b.length).push(b);
  }

  string(s: string): this {
    return this.bytes(new TextEncoder().encode(s));
  }

  toBytes(): Uint8Array {
    const out = new Uint8Array(this.size);
    let off = 0;
    for (const c of this.chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }
}
