import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFaucetAccount, NearRpc, NETWORKS, pollUntil, SeedSigner, YOCTO_PER_NEAR } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
// node_modules/.cache is git-ignored and disposable; the faucet allows only ~10 accounts per 12 h per IP.
const CACHE = join(here, '..', 'node_modules', '.cache', 'perde-testnet', 'funder.json');

export interface Funder {
  accountId: string;
  signer: SeedSigner;
  createdNow: boolean;
  faucetMs: number | undefined;
  faucetBalance: bigint | undefined;
  rateLimit: { limit: number | undefined; remaining: number | undefined; resetAt: number | undefined } | undefined;
  txHash: string | undefined;
}

/** Reuse a cached faucet account while it holds ≥ minNear, otherwise create one. */
export async function getFunder(rpc: NearRpc, minNear = 3n): Promise<Funder> {
  try {
    const cached = JSON.parse(readFileSync(CACHE, 'utf8')) as { accountId: string; secretKey: string; faucet?: { ms: number; balance: string; rateLimit: Funder['rateLimit']; txHash?: string } };
    const balance = await rpc.getBalance(cached.accountId);
    if (balance >= minNear * YOCTO_PER_NEAR) {
      return {
        accountId: cached.accountId,
        signer: SeedSigner.fromSecretKey(cached.secretKey),
        createdNow: false,
        faucetMs: cached.faucet?.ms,
        faucetBalance: cached.faucet === undefined ? undefined : BigInt(cached.faucet.balance),
        rateLimit: cached.faucet?.rateLimit,
        txHash: cached.faucet?.txHash,
      };
    }
  } catch {
    // no usable cache
  }
  const t0 = Date.now();
  const acc = await createFaucetAccount({ rpcUrls: NETWORKS.testnet.rpcUrls });
  const faucetMs = Date.now() - t0;
  mkdirSync(dirname(CACHE), { recursive: true });
  const faucet = { ms: faucetMs, balance: (acc.balance ?? 0n).toString(), rateLimit: acc.rateLimit, ...(acc.txHash !== undefined ? { txHash: acc.txHash } : {}) };
  writeFileSync(CACHE, JSON.stringify({ accountId: acc.accountId, secretKey: acc.secretKey, faucet }));
  return { accountId: acc.accountId, signer: SeedSigner.fromSecretKey(acc.secretKey), createdNow: true, faucetMs, faucetBalance: acc.balance, rateLimit: acc.rateLimit, txHash: acc.txHash };
}

/** Bounded read-after-write polling (retries reads that hit an RPC node lagging behind our last transaction). */
export function waitFor<T>(fn: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 30_000): Promise<T> {
  return pollUntil(fn, ok, { timeoutMs, intervalMs: 1000 });
}
