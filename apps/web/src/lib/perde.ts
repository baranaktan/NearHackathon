/**
 * Shared @perde/core instances for the browser. Everything chain-related goes
 * through these: one PerdeClient (testnet RPC with failover), one 1Click
 * client, and a cache of keys derived from the identity's recovery phrase.
 */
import {
  encodeMetaAddress,
  encodeViewingKey,
  keysFromMnemonic,
  NearRpc,
  OneClickClient,
  PerdeClient,
  SeedSigner,
  SputnikDao,
  toViewKeys,
  type PerdeConfig,
  type SpendKeys,
  type ViewKeys,
} from '@perde/core';
import { APP_CONFIG } from '../config';

/** At most this many RPC requests in flight from this tab: public RPCs rate-limit bursts. */
export const MAX_IN_FLIGHT = 4;

let inFlight = 0;
const waiters: Array<() => void> = [];
async function acquire(): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight++;
    return;
  }
  await new Promise<void>((r) => waiters.push(r));
}
function release(): void {
  const next = waiters.shift();
  if (next) next();
  else inFlight--;
}

/** fetch for NEAR RPC with a small concurrency limit (bursts are what trip public rate limiters). */
export async function limitedFetch(url: string, init: RequestInit): Promise<Response> {
  await acquire();
  try {
    return await fetch(url, init);
  } finally {
    release();
  }
}

/**
 * One RPC client for the whole tab, shared by the Perde client and the DAO
 * client: reads go to the most forgiving endpoint first, broadcasts to the
 * one without a request-time cap; an endpoint that fails rests for 30 s
 * (calls stick to the one that answered); identical concurrent reads share a
 * request and idempotent reads are reused for a moment (cleared by every
 * transaction, so read-after-write polling always sees fresh data).
 */
export const rpc = new NearRpc({
  urls: APP_CONFIG.rpcUrls,
  // dRPC answers `gas_price` with HTTP 422 UNKNOWN_BLOCK about a third of the time (it pins a block its upstream
  // lacks; measured 9 of 25 on 2026-11-14), so gas price — cached for 30 s — comes from FastNEAR.
  methodUrls: { send_tx: APP_CONFIG.broadcastUrls, gas_price: APP_CONFIG.broadcastUrls },
  fetch: limitedFetch,
  cooldownMs: 30_000,
  cache: true,
});
export const perde = new PerdeClient({ network: APP_CONFIG.networkId, contractId: APP_CONFIG.contractId, rpc });
export const oneClick = new OneClickClient();
export const dao = new SputnikDao({ network: APP_CONFIG.networkId, daoId: APP_CONFIG.daoId, perdeContractId: APP_CONFIG.contractId, rpc });

/** NEAR's storage staking price (protocol constant `storage_amount_per_byte`). */
export const STORAGE_BYTE_COST = 10n ** 19n;

/** Deposit attached to `register`; the contract keeps the exact storage cost and refunds the rest. */
export const REGISTER_DEPOSIT = 2_500_000_000_000_000_000_000n; // 0.0025 NEAR

export interface DerivedIdentity {
  keys: SpendKeys;
  viewKeys: ViewKeys;
  metaAddress: string;
  viewingKey: string;
}

const identityCache = new Map<string, DerivedIdentity>();

/** BIP-39 phrase → spend/view keys, meta-address and viewing key (memoised; derivation runs PBKDF2). */
export function deriveIdentity(mnemonic: string): DerivedIdentity {
  const hit = identityCache.get(mnemonic);
  if (hit) return hit;
  const keys = keysFromMnemonic(mnemonic);
  const derived: DerivedIdentity = {
    keys,
    viewKeys: toViewKeys(keys),
    metaAddress: encodeMetaAddress(keys),
    viewingKey: encodeViewingKey(keys),
  };
  identityCache.clear();
  identityCache.set(mnemonic, derived);
  return derived;
}

const signerCache = new Map<string, SeedSigner>();

export function signerFor(secretKey: string): SeedSigner {
  let s = signerCache.get(secretKey);
  if (!s) {
    s = SeedSigner.fromSecretKey(secretKey);
    signerCache.clear();
    signerCache.set(secretKey, s);
  }
  return s;
}

let configPromise: Promise<PerdeConfig> | null = null;

/** Contract `get_config` (announce fee, minimum amount, version), fetched once per session. */
export function getContractConfig(): Promise<PerdeConfig> {
  if (!configPromise) {
    configPromise = perde.getConfig().catch((e: unknown) => {
      configPromise = null;
      throw e;
    });
  }
  return configPromise;
}

/**
 * Upper bound of what a transaction with `sends` Perde `send` actions can
 * reserve for gas: prepaid gas is bought at max(gas price, min purchase price)
 * from the protocol config. Unused gas is refunded after execution.
 */
export async function sendGasReserve(sends: number): Promise<bigint> {
  const [fees, gasPrice] = await Promise.all([perde.claimFeeConfig(), rpc.gasPrice()]);
  const floor = fees.minGasPurchasePrice ?? 0n;
  const price = gasPrice > floor ? gasPrice : floor;
  return perde.gasPerSend * BigInt(sends) * price;
}

/** Same bound for a single plain Transfer (invoice payments): one action receipt, priced like a send. */
export async function transferGasReserve(createsAccount: boolean): Promise<bigint> {
  const [fees, gasPrice] = await Promise.all([perde.claimFeeConfig(), rpc.gasPrice()]);
  const floor = fees.minGasPurchasePrice ?? 0n;
  const price = gasPrice > floor ? gasPrice : floor;
  const cost = (t: { sendNotSir: bigint; execution: bigint }) => t.sendNotSir + t.execution;
  let gas = cost(fees.actionReceiptCreation) + cost(fees.transfer);
  if (createsAccount) gas += cost(fees.createAccount) + cost(fees.addFullAccessKey);
  return gas * price + (createsAccount ? (fees.accountCreationCharge ?? 0n) : 0n);
}

/** Balance a NEAR account can actually spend: liquid amount minus what its storage locks. */
export async function fetchSpendable(accountId: string): Promise<{ totalYocto: bigint; spendableYocto: bigint } | null> {
  const view = await rpc.viewAccountOrNull(accountId);
  if (!view) return null;
  const locked = BigInt(view.storageUsage) * STORAGE_BYTE_COST;
  const spendable = view.amount > locked ? view.amount - locked : 0n;
  return { totalYocto: view.amount, spendableYocto: spendable };
}
