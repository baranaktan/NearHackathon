import { PerdeError } from './errors.js';
import { bytesToHex, randomBytes } from './crypto/primitives.js';
import { assertAccountId } from './near/accountId.js';
import { NETWORKS } from './near/network.js';
import { type FetchFn, NearRpc } from './near/rpc.js';
import { SeedSigner } from './near/signer.js';

export const FAUCET_URL = 'https://helper.nearprotocol.com/account';

export interface FaucetOptions {
  /** Full account id ending in ".testnet". Default: "perde-<random>.testnet". */
  readonly accountId?: string;
  /** Key to install as the account's full-access key. Default: freshly generated. */
  readonly signer?: SeedSigner;
  readonly fetch?: FetchFn;
  readonly rpcUrls?: readonly string[];
  readonly faucetUrl?: string;
  /** Wait until the account is visible over RPC. Default true. */
  readonly waitForAccount?: boolean;
  /** Attempts for transport / 5xx failures. Default 3. */
  readonly attempts?: number;
}

export interface FaucetAccount {
  readonly accountId: string;
  /** NEAR-format secret key ("ed25519:..."). Treat as a password; never log it. */
  readonly secretKey: string;
  readonly publicKey: string;
  /** Faucet transaction hash, when the helper returned one. */
  readonly txHash: string | undefined;
  /** Balance seen over RPC (yocto), when `waitForAccount` is on. */
  readonly balance: bigint | undefined;
}

export interface FaucetRateLimit {
  readonly limit: number | undefined;
  readonly remaining: number | undefined;
  /** Unix seconds when the window resets. */
  readonly resetAt: number | undefined;
}

function numHeader(h: Headers, name: string): number | undefined {
  const v = h.get(name);
  if (v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function randomTestnetAccountId(prefix = 'perde'): string {
  return `${prefix}-${bytesToHex(randomBytes(6))}.testnet`;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Create a funded testnet account through the public NEAR faucet helper.
 * Observed 2026-11-14: funds 10 NEAR, ~3.5 s, rate limit 10 accounts per
 * window per client (`x-ratelimit-*` headers, ~12 h reset).
 */
export async function createFaucetAccount(options: FaucetOptions = {}): Promise<FaucetAccount & { rateLimit: FaucetRateLimit }> {
  const accountId = options.accountId ?? randomTestnetAccountId();
  assertAccountId(accountId);
  if (!accountId.endsWith('.testnet') || accountId.split('.').length !== 2) {
    throw new PerdeError('INVALID_ACCOUNT_ID', 'faucet accounts must be top-level "<name>.testnet" ids');
  }
  const signer = options.signer ?? SeedSigner.generate();
  const fetchFn: FetchFn = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const attempts = options.attempts ?? 3;
  const body = JSON.stringify({ newAccountId: accountId, newAccountPublicKey: signer.publicKeyString });

  let lastError = '';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let res: Response;
    try {
      res = await fetchFn(options.faucetUrl ?? FAUCET_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      await sleep(1000 * attempt);
      continue;
    }
    const rateLimit: FaucetRateLimit = {
      limit: numHeader(res.headers, 'x-ratelimit-limit'),
      remaining: numHeader(res.headers, 'x-ratelimit-remaining'),
      resetAt: numHeader(res.headers, 'x-ratelimit-reset'),
    };
    const text = await res.text();
    if (res.status === 429) {
      throw new PerdeError('FAUCET_ERROR', `faucet rate limit reached; resets at ${rateLimit.resetAt ?? 'unknown'} (unix s)`, { status: 429, rateLimit });
    }
    if (res.status >= 500) {
      lastError = `HTTP ${res.status}: ${text.slice(0, 300)}`;
      await sleep(1000 * attempt);
      continue;
    }
    if (!res.ok) throw new PerdeError('FAUCET_ERROR', `faucet rejected the request (HTTP ${res.status}): ${text.slice(0, 300)}`, { status: res.status });

    let txHash: string | undefined;
    try {
      const parsed = JSON.parse(text) as { status?: Record<string, unknown>; transaction?: { hash?: string } };
      if (parsed.status !== undefined && 'Failure' in parsed.status) {
        throw new PerdeError('FAUCET_ERROR', `faucet transaction failed: ${JSON.stringify(parsed.status.Failure)}`);
      }
      txHash = parsed.transaction?.hash;
    } catch (e) {
      if (e instanceof PerdeError) throw e;
    }

    let balance: bigint | undefined;
    if (options.waitForAccount ?? true) {
      const rpc = new NearRpc({ urls: options.rpcUrls ?? NETWORKS.testnet.rpcUrls, ...(options.fetch ? { fetch: options.fetch } : {}) });
      for (let i = 0; i < 30 && balance === undefined; i++) {
        const view = await rpc.viewAccountOrNull(accountId);
        if (view !== null) balance = view.amount;
        else await sleep(1000);
      }
      if (balance === undefined) throw new PerdeError('FAUCET_ERROR', `account ${accountId} not visible over RPC after 30 s`, { txHash });
    }
    return { accountId, secretKey: signer.secretKey, publicKey: signer.publicKeyString, txHash, balance, rateLimit };
  }
  throw new PerdeError('FAUCET_ERROR', `faucet unavailable after ${attempts} attempts: ${lastError}`);
}
