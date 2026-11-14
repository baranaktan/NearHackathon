import { base58, base64 } from '@scure/base';
import { PerdeError } from '../errors.js';
import { utf8ToBytes } from '../crypto/primitives.js';
import { encodePublicKey } from './signer.js';
import { type SignedTransaction, signedTransactionBase64 } from './transaction.js';

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export type Finality = 'optimistic' | 'final';
export type WaitUntil = 'EXECUTED_OPTIMISTIC' | 'EXECUTED' | 'FINAL';

export interface NearRpcOptions {
  /** Endpoints tried in order; transport failures fail over to the next one. */
  readonly urls: readonly string[];
  /**
   * Per-method endpoint order that overrides `urls` for that JSON-RPC method,
   * e.g. `{ send_tx: [...] }` to broadcast through endpoints without a short
   * server-side request cap (some free tiers answer 408 after ~2 s).
   */
  readonly methodUrls?: Readonly<Partial<Record<string, readonly string[]>>>;
  readonly fetch?: FetchFn;
  /** Per-request timeout. Default 20 s (send_tx waits server-side up to ~10 s). */
  readonly timeoutMs?: number;
  /** Finality for view queries. Default "optimistic". */
  readonly finality?: Finality;
  /**
   * After an endpoint fails at the transport/HTTP level (network error, 429,
   * 5xx, a non-JSON-RPC answer, a node-sync error) it moves to the back of the
   * order for this long, so the next calls go straight to an endpoint that
   * answered instead of hitting the failing one again. Default 30 s; 0 keeps
   * the configured order on every call.
   */
  readonly cooldownMs?: number;
  /** Read de-duplication and short-lived caching (off by default). */
  readonly cache?: boolean | RpcCacheOptions;
  /**
   * When `send_tx` returns no outcome (server timeout, or every endpoint
   * failed after the broadcast may have arrived), `sendTransaction` looks the
   * transaction up by hash for this long. Default 30 s.
   */
  readonly confirmTimeoutMs?: number;
  /** Delay between those lookups. Default 1000 ms. */
  readonly confirmIntervalMs?: number;
}

/**
 * With caching on, identical concurrent read requests share one HTTP request,
 * and idempotent reads are reused for a short time. Every `sendTransaction`
 * clears the cache, so reads that follow a write always go to the network.
 * Access-key queries (nonces) and transaction lookups are never cached, only
 * de-duplicated.
 */
export interface RpcCacheOptions {
  /** `query` results (accounts, contract views). Default 1000 ms. */
  readonly queryTtlMs?: number;
  /** `gas_price`. Default 30 s. */
  readonly gasPriceTtlMs?: number;
  /** `block` at `final` finality (used for the transaction's recent block hash). Default 10 s. */
  readonly finalBlockTtlMs?: number;
  /** `EXPERIMENTAL_protocol_config`. Default 10 min. */
  readonly protocolConfigTtlMs?: number;
}

export interface WaitForTransactionOptions {
  /** Status to wait for. Default "EXECUTED_OPTIMISTIC". */
  readonly waitUntil?: WaitUntil;
  /** Give up after this long. Default 30 s. */
  readonly timeoutMs?: number;
  /** Delay between lookups. Default 1000 ms. */
  readonly intervalMs?: number;
}

/** JSON-RPC error returned by a node (not a transport failure). */
export class RpcError extends PerdeError {
  readonly rpcName: string;
  readonly causeName: string | undefined;
  readonly data: unknown;

  constructor(message: string, rpcName: string, causeName: string | undefined, data: unknown) {
    super('RPC_ERROR', message, data);
    this.name = 'RpcError';
    this.rpcName = rpcName;
    this.causeName = causeName;
    this.data = data;
  }
}

export interface AccountView {
  readonly amount: bigint;
  readonly locked: bigint;
  readonly codeHash: string;
  readonly storageUsage: number;
  readonly blockHeight: number;
  readonly blockHash: string;
}

export interface AccessKeyView {
  readonly nonce: bigint;
  readonly permission: 'FullAccess' | { readonly FunctionCall: { readonly allowance: string | null; readonly receiver_id: string; readonly method_names: readonly string[] } };
  readonly blockHash: string;
  readonly blockHeight: number;
}

export interface BlockInfo {
  readonly hash: string;
  readonly height: number;
}

export type ExecutionStatus =
  | { readonly SuccessValue: string }
  | { readonly SuccessReceiptId: string }
  | { readonly Failure: unknown }
  | 'Unknown'
  | 'Pending';

export interface ExecutionOutcomeRaw {
  readonly id: string;
  readonly block_hash: string;
  readonly outcome: {
    readonly executor_id: string;
    readonly gas_burnt: number;
    readonly tokens_burnt: string;
    readonly logs: readonly string[];
    readonly receipt_ids: readonly string[];
    readonly status: ExecutionStatus;
  };
}

export interface FinalExecutionOutcomeRaw {
  readonly final_execution_status?: string;
  readonly status: ExecutionStatus;
  readonly transaction: { readonly hash: string; readonly signer_id: string; readonly receiver_id: string };
  readonly transaction_outcome: ExecutionOutcomeRaw;
  readonly receipts_outcome: readonly ExecutionOutcomeRaw[];
}

export interface TxOutcome {
  readonly hash: string;
  readonly signerId: string;
  readonly receiverId: string;
  readonly success: boolean;
  /** Decoded SuccessValue bytes of the last receipt, when present. */
  readonly successValue: Uint8Array | undefined;
  readonly failure: unknown;
  /** Total gas burnt across the transaction and all its receipts. */
  readonly gasBurnt: bigint;
  /** Total tokens burnt (yocto) across the transaction and all its receipts. */
  readonly tokensBurnt: bigint;
  readonly logs: readonly string[];
  readonly finalExecutionStatus: string | undefined;
  readonly raw: FinalExecutionOutcomeRaw;
}

interface JsonRpcErrorBody {
  name?: string;
  cause?: { name?: string; info?: unknown };
  message?: string;
  data?: unknown;
  code?: number;
}

interface JsonRpcResponse {
  result?: unknown;
  error?: JsonRpcErrorBody;
}

// Node-side conditions where another endpoint may well succeed. UNKNOWN_BLOCK: load-balancing
// gateways (seen on dRPC's testnet endpoint for `gas_price`) pin a block their upstream lacks.
const RETRYABLE_CAUSES = new Set(['NO_SYNCED_BLOCKS', 'UNAVAILABLE_SHARD', 'NOT_SYNCED_YET', 'INTERNAL_ERROR', 'UNKNOWN_BLOCK']);

/** Methods that only read chain state: safe to de-duplicate (and, per method, to cache). */
const READ_METHODS = new Set(['query', 'block', 'gas_price', 'EXPERIMENTAL_protocol_config', 'tx', 'EXPERIMENTAL_tx_status', 'status', 'chunk', 'validators']);

/** `final_execution_status` values that mean the transaction and its receipts ran, per requested level. */
const REACHED: Readonly<Record<WaitUntil, readonly string[]>> = {
  EXECUTED_OPTIMISTIC: ['EXECUTED_OPTIMISTIC', 'EXECUTED', 'FINAL'],
  EXECUTED: ['EXECUTED', 'FINAL'],
  FINAL: ['FINAL'],
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

/** A JSON-RPC error object in nearcore's shape (`name` and/or `cause.name`), as opposed to a proxy's or rate limiter's. */
function isNodeError(e: unknown): e is JsonRpcErrorBody {
  return isRecord(e) && (typeof e.name === 'string' || (isRecord(e.cause) && typeof e.cause.name === 'string'));
}

/**
 * True when a `tx` / `send_tx` result shows the transaction executed to at
 * least `waitUntil` (a complete outcome with a matching
 * `final_execution_status`; nodes without that field count once complete).
 */
export function hasReached(raw: unknown, waitUntil: WaitUntil = 'EXECUTED_OPTIMISTIC'): raw is FinalExecutionOutcomeRaw {
  if (!isCompleteOutcome(raw)) return false;
  const s = raw.final_execution_status;
  if (s === undefined) return raw.status !== 'Pending' && raw.status !== 'Unknown';
  return REACHED[waitUntil].includes(s);
}

/**
 * True when a `send_tx` / `tx` result carries a full execution outcome.
 * Nodes answer with only `{final_execution_status: "NONE" | "INCLUDED"}` when
 * the transaction has not executed yet.
 */
export function isCompleteOutcome(raw: unknown): raw is FinalExecutionOutcomeRaw {
  if (!isRecord(raw)) return false;
  const tx = raw.transaction;
  const txo = raw.transaction_outcome;
  return (
    isRecord(tx) &&
    typeof tx.hash === 'string' &&
    isRecord(txo) &&
    isRecord(txo.outcome) &&
    Array.isArray(raw.receipts_outcome) &&
    raw.receipts_outcome.every((r) => isRecord(r) && isRecord(r.outcome)) &&
    raw.status !== undefined
  );
}

export function parseOutcome(raw: FinalExecutionOutcomeRaw): TxOutcome {
  if (!isCompleteOutcome(raw)) {
    throw new PerdeError('RPC_ERROR', `incomplete transaction outcome from RPC: ${describeFailure(raw).slice(0, 300)}`, raw);
  }
  const all = [raw.transaction_outcome, ...raw.receipts_outcome];
  let gasBurnt = 0n;
  let tokensBurnt = 0n;
  const logs: string[] = [];
  for (const o of all) {
    gasBurnt += BigInt(o.outcome.gas_burnt);
    tokensBurnt += BigInt(o.outcome.tokens_burnt);
    logs.push(...o.outcome.logs);
  }
  const status = raw.status;
  const success = isRecord(status) && ('SuccessValue' in status || 'SuccessReceiptId' in status);
  const successValue = isRecord(status) && 'SuccessValue' in status ? base64.decode(status.SuccessValue) : undefined;
  const failure = isRecord(status) && 'Failure' in status ? status.Failure : undefined;
  return {
    hash: raw.transaction.hash,
    signerId: raw.transaction.signer_id,
    receiverId: raw.transaction.receiver_id,
    success,
    successValue,
    failure,
    gasBurnt,
    tokensBurnt,
    logs,
    finalExecutionStatus: raw.final_execution_status,
    raw,
  };
}

/** BigInt of a numeric RPC field, or a PerdeError naming the field (never a raw TypeError/SyntaxError). */
function bigintField(value: unknown, what: string, raw: unknown): bigint {
  if ((typeof value === 'string' && /^\d+$/.test(value)) || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)) return BigInt(value);
  throw new PerdeError('RPC_ERROR', `unexpected RPC response: ${what} is ${JSON.stringify(value)} (${describeFailure(raw).slice(0, 200)})`, raw);
}

function describeFailure(failure: unknown): string {
  try {
    return JSON.stringify(failure);
  } catch {
    return String(failure);
  }
}

interface CacheEntry {
  readonly value: unknown;
  readonly expiresAt: number;
}

/**
 * Minimal fetch-based NEAR JSON-RPC client with adaptive endpoint failover
 * (cooldown for failing endpoints) and optional read de-duplication/caching.
 */
export class NearRpc {
  readonly urls: readonly string[];
  readonly finality: Finality;
  readonly #methodUrls: Readonly<Partial<Record<string, readonly string[]>>>;
  readonly #fetch: FetchFn;
  readonly #timeoutMs: number;
  readonly #cooldownMs: number;
  readonly #cacheTtl: Required<RpcCacheOptions> | null;
  readonly #confirmTimeoutMs: number;
  readonly #confirmIntervalMs: number;
  /** url → time until which it is tried last. */
  readonly #coolUntil = new Map<string, number>();
  readonly #cache = new Map<string, CacheEntry>();
  readonly #inflight = new Map<string, Promise<unknown>>();
  /** Bumped by every cache clear, so responses to requests started earlier are not stored. */
  #generation = 0;
  #id = 0;

  constructor(options: NearRpcOptions) {
    if (options.urls.length === 0) throw new PerdeError('RPC_UNAVAILABLE', 'at least one RPC URL is required');
    this.urls = [...options.urls];
    this.#methodUrls = { ...options.methodUrls };
    this.finality = options.finality ?? 'optimistic';
    const f = options.fetch ?? globalThis.fetch;
    this.#fetch = (url, init) => f(url, init);
    this.#timeoutMs = options.timeoutMs ?? 20_000;
    this.#cooldownMs = options.cooldownMs ?? 30_000;
    this.#confirmTimeoutMs = options.confirmTimeoutMs ?? 30_000;
    this.#confirmIntervalMs = options.confirmIntervalMs ?? 1000;
    const c = options.cache;
    this.#cacheTtl =
      c === undefined || c === false
        ? null
        : {
            queryTtlMs: (c === true ? undefined : c.queryTtlMs) ?? 1000,
            gasPriceTtlMs: (c === true ? undefined : c.gasPriceTtlMs) ?? 30_000,
            finalBlockTtlMs: (c === true ? undefined : c.finalBlockTtlMs) ?? 10_000,
            protocolConfigTtlMs: (c === true ? undefined : c.protocolConfigTtlMs) ?? 600_000,
          };
  }

  /**
   * Endpoints for `method` in the order they will be tried: the configured
   * order, except that endpoints still cooling down after a failure go last
   * (soonest-recovered first).
   */
  endpointOrder(method: string): readonly string[] {
    const base = this.#methodUrls[method] ?? this.urls;
    const now = Date.now();
    const cooling = (u: string) => (this.#coolUntil.get(u) ?? 0) > now;
    const healthy = base.filter((u) => !cooling(u));
    const resting = base.filter(cooling).sort((a, b) => (this.#coolUntil.get(a) ?? 0) - (this.#coolUntil.get(b) ?? 0));
    return [...healthy, ...resting];
  }

  /** Forget cached reads (called automatically around every `sendTransaction`). */
  clearCache(): void {
    this.#generation++;
    this.#cache.clear();
    this.#inflight.clear();
  }

  #ttl(method: string, params: unknown): number {
    const t = this.#cacheTtl;
    if (t === null) return 0;
    switch (method) {
      case 'query':
        return isRecord(params) && params.request_type === 'view_access_key' ? 0 : t.queryTtlMs;
      case 'gas_price':
        return t.gasPriceTtlMs;
      case 'block':
        return isRecord(params) && params.finality === 'final' ? t.finalBlockTtlMs : 0;
      case 'EXPERIMENTAL_protocol_config':
        return t.protocolConfigTtlMs;
      default:
        return 0;
    }
  }

  /**
   * Raw JSON-RPC call. Fails over to the next endpoint on anything that is not
   * a node's JSON-RPC answer: transport errors, HTTP 429, other non-2xx
   * responses without a nearcore error body (rate limiters, proxies, free-tier
   * timeouts), unparseable bodies, and node-sync errors. Errors a node
   * reports about the request itself (`UNKNOWN_ACCOUNT`, …) are thrown as
   * `RpcError` without trying other endpoints.
   */
  async call<T>(method: string, params: unknown): Promise<T> {
    if (this.#cacheTtl === null || !READ_METHODS.has(method)) return this.#callNetwork<T>(method, params);
    const key = `${method}\u0000${JSON.stringify(params)}`;
    const hit = this.#cache.get(key);
    if (hit !== undefined && hit.expiresAt > Date.now()) return hit.value as T;
    const pending = this.#inflight.get(key);
    if (pending !== undefined) return pending as Promise<T>;
    const generation = this.#generation;
    const ttl = this.#ttl(method, params);
    const p = this.#callNetwork<T>(method, params)
      .then((value) => {
        if (ttl > 0 && generation === this.#generation) this.#cache.set(key, { value, expiresAt: Date.now() + ttl });
        return value;
      })
      .finally(() => {
        if (this.#inflight.get(key) === p) this.#inflight.delete(key);
      });
    this.#inflight.set(key, p);
    return p;
  }

  async #callNetwork<T>(method: string, params: unknown): Promise<T> {
    const failures: string[] = [];
    const fail = (url: string, why: string) => {
      failures.push(`${url}: ${why}`);
      if (this.#cooldownMs > 0) this.#coolUntil.set(url, Date.now() + this.#cooldownMs);
    };
    for (const url of this.endpointOrder(method)) {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, this.#timeoutMs);
      let status: number;
      let body: unknown;
      try {
        const res = await this.#fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: ++this.#id, method, params }),
          signal: controller.signal,
        });
        status = res.status;
        const text = await res.text();
        try {
          body = JSON.parse(text);
        } catch {
          body = undefined;
        }
      } catch (e) {
        fail(url, e instanceof Error ? e.message : String(e));
        continue;
      } finally {
        clearTimeout(timer);
      }
      const answer = isRecord(body) ? (body as JsonRpcResponse) : undefined;
      const nodeAnswer = answer !== undefined && (('result' in answer && answer.error === undefined) || isNodeError(answer.error));
      if (status === 429 || !nodeAnswer) {
        const msg = isRecord(answer?.error) && typeof answer.error.message === 'string' ? `: ${answer.error.message.slice(0, 120)}` : '';
        fail(url, `HTTP ${status}${msg}`);
        continue;
      }
      if (answer.error !== undefined) {
        const err = answer.error;
        const causeName = err.cause?.name;
        if (causeName !== undefined && RETRYABLE_CAUSES.has(causeName)) {
          fail(url, causeName);
          continue;
        }
        this.#coolUntil.delete(url);
        const detail = typeof err.data === 'string' ? err.data : describeFailure(err.data ?? err.cause);
        throw new RpcError(`${method} failed: ${causeName ?? err.name ?? 'error'}: ${detail}`, err.name ?? 'UNKNOWN', causeName, err);
      }
      this.#coolUntil.delete(url);
      return answer.result as T;
    }
    throw new PerdeError('RPC_UNAVAILABLE', `all RPC endpoints failed for ${method}: ${failures.join('; ')}`, failures);
  }

  /**
   * `query` RPC. Some errors arrive as a *successful* JSON-RPC response whose
   * result is `{error: "...", logs, block_height, block_hash}` (nearcore's
   * legacy shape, still served by testnet RPCs for contract panics and
   * missing access keys). Those are turned into `RpcError`s here so callers
   * never read fields off an error object.
   */
  private async query<T>(params: Record<string, unknown>): Promise<T> {
    const r = await this.call<unknown>('query', { finality: this.finality, ...params });
    if (isRecord(r) && typeof r.error === 'string') {
      const what = `${String(params.request_type)} ${String(params.account_id)}${typeof params.method_name === 'string' ? `.${params.method_name}` : ''}`;
      const causeName =
        params.request_type === 'call_function'
          ? 'CONTRACT_EXECUTION_ERROR'
          : params.request_type === 'view_access_key' && /does not exist|not found/i.test(r.error)
            ? 'UNKNOWN_ACCESS_KEY'
            : 'QUERY_ERROR';
      throw new RpcError(`query ${what} failed: ${causeName}: ${r.error}`, 'HANDLER_ERROR', causeName, r);
    }
    if (!isRecord(r)) throw new PerdeError('RPC_ERROR', `query ${String(params.request_type)}: unexpected response ${describeFailure(r).slice(0, 300)}`, r);
    return r as T;
  }

  async viewAccount(accountId: string): Promise<AccountView> {
    const r = await this.query<{ amount: string; locked: string; code_hash: string; storage_usage: number; block_height: number; block_hash: string }>({
      request_type: 'view_account',
      account_id: accountId,
    });
    return {
      amount: bigintField(r.amount, `view_account ${accountId}.amount`, r),
      locked: bigintField(r.locked, `view_account ${accountId}.locked`, r),
      codeHash: r.code_hash,
      storageUsage: r.storage_usage,
      blockHeight: r.block_height,
      blockHash: r.block_hash,
    };
  }

  /** null when the account does not exist. */
  async viewAccountOrNull(accountId: string): Promise<AccountView | null> {
    try {
      return await this.viewAccount(accountId);
    } catch (e) {
      if (e instanceof RpcError && e.causeName === 'UNKNOWN_ACCOUNT') return null;
      throw e;
    }
  }

  async accountExists(accountId: string): Promise<boolean> {
    return (await this.viewAccountOrNull(accountId)) !== null;
  }

  /** Liquid balance in yocto; 0n for accounts that do not exist. */
  async getBalance(accountId: string): Promise<bigint> {
    return (await this.viewAccountOrNull(accountId))?.amount ?? 0n;
  }

  /**
   * Call a view method. A contract panic is thrown as `RpcError` with
   * `causeName` "CONTRACT_EXECUTION_ERROR" whichever way the node reports it:
   * as a JSON-RPC error, or (nearcore's legacy shape, still returned by
   * testnet RPCs) as `result: {error: "wasm execution failed ...", logs}`
   * without a `result` byte array.
   */
  async viewFunction<T>(contractId: string, methodName: string, args: object = {}): Promise<T> {
    const r = await this.query<{ result?: unknown; error?: unknown; logs?: string[]; block_height?: number }>({
      request_type: 'call_function',
      account_id: contractId,
      method_name: methodName,
      args_base64: base64.encode(utf8ToBytes(JSON.stringify(args))),
    });
    if (!Array.isArray(r.result) || !r.result.every((b) => typeof b === 'number')) {
      throw new PerdeError('RPC_ERROR', `${contractId}.${methodName}: unexpected view response ${describeFailure(r).slice(0, 300)}`, r);
    }
    const text = new TextDecoder().decode(Uint8Array.from(r.result));
    return (text === '' ? null : JSON.parse(text)) as T;
  }

  async getAccessKey(accountId: string, publicKey: Uint8Array | string): Promise<AccessKeyView> {
    const pk = typeof publicKey === 'string' ? publicKey : encodePublicKey(publicKey);
    const r = await this.query<{ nonce: number | string; permission: AccessKeyView['permission']; block_hash: string; block_height: number }>({
      request_type: 'view_access_key',
      account_id: accountId,
      public_key: pk,
    });
    return { nonce: bigintField(r.nonce, `access key ${pk} of ${accountId}: nonce`, r), permission: r.permission, blockHash: r.block_hash, blockHeight: r.block_height };
  }

  async latestBlock(finality: Finality = 'final'): Promise<BlockInfo> {
    const r = await this.call<{ header?: { hash: string; height: number } }>('block', { finality });
    if (r.header === undefined || typeof r.header.hash !== 'string') throw new PerdeError('RPC_ERROR', `block: unexpected response ${describeFailure(r).slice(0, 300)}`, r);
    return { hash: r.header.hash, height: r.header.height };
  }

  async latestBlockHash(finality: Finality = 'final'): Promise<Uint8Array> {
    return base58.decode((await this.latestBlock(finality)).hash);
  }

  async gasPrice(): Promise<bigint> {
    const r = await this.call<{ gas_price?: unknown }>('gas_price', [null]);
    return bigintField(r.gas_price, 'gas_price', r);
  }

  async protocolConfig(): Promise<ProtocolFeeConfig> {
    const r = await this.call<ProtocolConfigRaw>('EXPERIMENTAL_protocol_config', { finality: 'final' });
    return parseProtocolFeeConfig(r);
  }

  /**
   * Broadcast and wait (`send_tx`). On a server-side timeout the status is
   * polled until `waitUntil` is reached. If every endpoint failed to answer
   * the broadcast, the transaction may still have reached a node, so it is
   * looked up by hash before giving up. Throws TX_FAILED if the transaction is
   * invalid or its execution fails, and RPC_UNAVAILABLE if its outcome could
   * not be confirmed; both carry `details.hash`.
   */
  async sendTransaction(stx: SignedTransaction, waitUntil: WaitUntil = 'EXECUTED_OPTIMISTIC'): Promise<TxOutcome> {
    const signerId = stx.transaction.signerId;
    this.clearCache();
    let raw: FinalExecutionOutcomeRaw;
    try {
      const sent = await this.call<unknown>('send_tx', { signed_tx_base64: signedTransactionBase64(stx), wait_until: waitUntil });
      raw = isCompleteOutcome(sent) ? sent : (await this.#confirm(stx.hash, signerId, waitUntil)).raw;
    } catch (e) {
      if (e instanceof RpcError && e.causeName === 'TIMEOUT_ERROR') {
        raw = (await this.#confirm(stx.hash, signerId, waitUntil)).raw;
      } else if (e instanceof RpcError && e.causeName === 'INVALID_TRANSACTION') {
        throw new PerdeError('TX_FAILED', `transaction rejected: ${describeFailure(e.data)}`, { hash: stx.hash, error: e.data });
      } else if (e instanceof PerdeError && e.code === 'RPC_UNAVAILABLE') {
        // No endpoint answered the broadcast, but one may have accepted it before the response was lost.
        raw = (await this.#confirm(stx.hash, signerId, waitUntil, e)).raw;
      } else {
        throw e;
      }
    } finally {
      this.clearCache();
    }
    const outcome = parseOutcome(raw);
    if (!outcome.success) {
      throw new PerdeError('TX_FAILED', `transaction ${outcome.hash} failed: ${describeFailure(outcome.failure)}`, { hash: outcome.hash, outcome });
    }
    return outcome;
  }

  async txStatus(txHash: string, senderAccountId: string, waitUntil: WaitUntil = 'EXECUTED_OPTIMISTIC'): Promise<TxOutcome> {
    const raw = await this.call<FinalExecutionOutcomeRaw>('tx', { tx_hash: txHash, sender_account_id: senderAccountId, wait_until: waitUntil });
    return parseOutcome(raw);
  }

  /**
   * Outcome of a transaction by hash, e.g. to recover a result whose response
   * was lost. Polls `tx` with `wait_until: "NONE"` (answered immediately, so
   * no endpoint's request-time cap is ever hit) until the transaction executed
   * to `waitUntil`; "unknown transaction", partial outcomes and endpoint
   * failures are retried. Returns the outcome whether it succeeded or failed
   * (check `success`); throws RPC_UNAVAILABLE (`details.hash`) on timeout.
   */
  async waitForTransaction(txHash: string, senderAccountId: string, options: WaitForTransactionOptions = {}): Promise<TxOutcome> {
    const waitUntil = options.waitUntil ?? 'EXECUTED_OPTIMISTIC';
    const timeoutMs = options.timeoutMs ?? 30_000;
    const intervalMs = options.intervalMs ?? 1000;
    const start = Date.now();
    let last: unknown;
    for (;;) {
      try {
        const raw = await this.#callNetwork<unknown>('tx', { tx_hash: txHash, sender_account_id: senderAccountId, wait_until: 'NONE' });
        if (hasReached(raw, waitUntil)) return parseOutcome(raw);
        last = new PerdeError('RPC_ERROR', `transaction ${txHash} not executed yet: ${describeFailure(raw).slice(0, 200)}`, raw);
      } catch (e) {
        last = e;
        const retry = (e instanceof RpcError && (e.causeName === 'UNKNOWN_TRANSACTION' || e.causeName === 'TIMEOUT_ERROR')) || (e instanceof PerdeError && e.code === 'RPC_UNAVAILABLE');
        if (!retry) throw e;
      }
      if (Date.now() - start + intervalMs > timeoutMs) {
        throw new PerdeError('RPC_UNAVAILABLE', `transaction ${txHash} not confirmed within ${Math.round(timeoutMs / 1000)} s`, { hash: txHash, last });
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  async #confirm(hash: string, senderId: string, waitUntil: WaitUntil, broadcastError?: PerdeError): Promise<TxOutcome> {
    try {
      return await this.waitForTransaction(hash, senderId, { waitUntil, timeoutMs: this.#confirmTimeoutMs, intervalMs: this.#confirmIntervalMs });
    } catch (e) {
      if (broadcastError !== undefined && e instanceof PerdeError && e.code === 'RPC_UNAVAILABLE') {
        throw new PerdeError('RPC_UNAVAILABLE', `transaction ${hash} was signed and sent, but no endpoint confirmed it: ${broadcastError.message}`, {
          hash,
          broadcast: broadcastError.details,
          lookup: e.details,
        });
      }
      throw e;
    }
  }
}

export interface FeeTriple {
  readonly sendNotSir: bigint;
  readonly sendSir: bigint;
  readonly execution: bigint;
}

/** The subset of the runtime fee config Perde needs for gas-reserve math. */
export interface ProtocolFeeConfig {
  readonly protocolVersion: number;
  readonly actionReceiptCreation: FeeTriple;
  readonly transfer: FeeTriple;
  readonly createAccount: FeeTriple;
  readonly addFullAccessKey: FeeTriple;
  readonly deleteAccount: FeeTriple;
  /** yocto per gas floor used when purchasing gas, if the protocol defines one. */
  readonly minGasPurchasePrice: bigint | undefined;
  /** yocto charged for creating a new account, if the protocol defines one. */
  readonly accountCreationCharge: bigint | undefined;
  readonly pessimisticInflation: readonly [number, number];
}

export interface FeeTripleRaw {
  execution: number;
  send_not_sir: number;
  send_sir: number;
}

export interface ProtocolConfigRaw {
  protocol_version: number;
  runtime_config: {
    min_gas_purchase_price?: string;
    account_creation_charge?: string;
    transaction_costs: {
      action_receipt_creation_config: FeeTripleRaw;
      pessimistic_gas_price_inflation_ratio: [number, number];
      action_creation_config: {
        transfer_cost: FeeTripleRaw;
        create_account_cost: FeeTripleRaw;
        add_key_cost: { full_access_cost: FeeTripleRaw };
        delete_account_cost: FeeTripleRaw;
      };
    };
  };
}

function triple(f: FeeTripleRaw): FeeTriple {
  return { sendNotSir: BigInt(f.send_not_sir), sendSir: BigInt(f.send_sir), execution: BigInt(f.execution) };
}

export function parseProtocolFeeConfig(r: ProtocolConfigRaw): ProtocolFeeConfig {
  const tc = r.runtime_config.transaction_costs;
  const ac = tc.action_creation_config;
  return {
    protocolVersion: r.protocol_version,
    actionReceiptCreation: triple(tc.action_receipt_creation_config),
    transfer: triple(ac.transfer_cost),
    createAccount: triple(ac.create_account_cost),
    addFullAccessKey: triple(ac.add_key_cost.full_access_cost),
    deleteAccount: triple(ac.delete_account_cost),
    minGasPurchasePrice: r.runtime_config.min_gas_purchase_price === undefined ? undefined : BigInt(r.runtime_config.min_gas_purchase_price),
    accountCreationCharge: r.runtime_config.account_creation_charge === undefined ? undefined : BigInt(r.runtime_config.account_creation_charge),
    pessimisticInflation: tc.pessimistic_gas_price_inflation_ratio,
  };
}
