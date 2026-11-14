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
  readonly fetch?: FetchFn;
  /** Per-request timeout. Default 20 s (send_tx waits server-side up to ~10 s). */
  readonly timeoutMs?: number;
  /** Finality for view queries. Default "optimistic". */
  readonly finality?: Finality;
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

// Node-side conditions where another endpoint may well succeed.
const RETRYABLE_CAUSES = new Set(['NO_SYNCED_BLOCKS', 'UNAVAILABLE_SHARD', 'NOT_SYNCED_YET', 'INTERNAL_ERROR']);

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
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

/** Minimal fetch-based NEAR JSON-RPC client with endpoint failover. */
export class NearRpc {
  readonly urls: readonly string[];
  readonly finality: Finality;
  readonly #fetch: FetchFn;
  readonly #timeoutMs: number;
  #id = 0;

  constructor(options: NearRpcOptions) {
    if (options.urls.length === 0) throw new PerdeError('RPC_UNAVAILABLE', 'at least one RPC URL is required');
    this.urls = [...options.urls];
    this.finality = options.finality ?? 'optimistic';
    const f = options.fetch ?? globalThis.fetch;
    this.#fetch = (url, init) => f(url, init);
    this.#timeoutMs = options.timeoutMs ?? 20_000;
  }

  /** Raw JSON-RPC call. Transport errors, HTTP 408/429/5xx and node-sync errors fail over. */
  async call<T>(method: string, params: unknown): Promise<T> {
    const failures: string[] = [];
    for (const url of this.urls) {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, this.#timeoutMs);
      let body: JsonRpcResponse;
      try {
        const res = await this.#fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: ++this.#id, method, params }),
          signal: controller.signal,
        });
        if (res.status === 408 || res.status === 429 || res.status >= 500) {
          failures.push(`${url}: HTTP ${res.status}`);
          continue;
        }
        body = (await res.json()) as JsonRpcResponse;
      } catch (e) {
        failures.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      } finally {
        clearTimeout(timer);
      }
      if (body.error !== undefined) {
        const err = body.error;
        const causeName = err.cause?.name;
        if (causeName !== undefined && RETRYABLE_CAUSES.has(causeName)) {
          failures.push(`${url}: ${causeName}`);
          continue;
        }
        const detail = typeof err.data === 'string' ? err.data : describeFailure(err.data ?? err.cause);
        throw new RpcError(`${method} failed: ${causeName ?? err.name ?? 'error'}: ${detail}`, err.name ?? 'UNKNOWN', causeName, err);
      }
      return body.result as T;
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
   * polled until `waitUntil` is reached. Throws TX_FAILED (details include the
   * hash) if the transaction is invalid or its execution fails.
   */
  async sendTransaction(stx: SignedTransaction, waitUntil: WaitUntil = 'EXECUTED_OPTIMISTIC'): Promise<TxOutcome> {
    let raw: FinalExecutionOutcomeRaw;
    try {
      const sent = await this.call<unknown>('send_tx', { signed_tx_base64: signedTransactionBase64(stx), wait_until: waitUntil });
      raw = isCompleteOutcome(sent) ? sent : (await this.waitForTx(stx.hash, stx.transaction.signerId, waitUntil)).raw;
    } catch (e) {
      if (e instanceof RpcError && e.causeName === 'TIMEOUT_ERROR') {
        raw = (await this.waitForTx(stx.hash, stx.transaction.signerId, waitUntil)).raw;
      } else if (e instanceof RpcError && e.causeName === 'INVALID_TRANSACTION') {
        throw new PerdeError('TX_FAILED', `transaction rejected: ${describeFailure(e.data)}`, { hash: stx.hash, error: e.data });
      } else {
        throw e;
      }
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

  /** Polls `tx` until a complete outcome is available (TIMEOUT / UNKNOWN_TRANSACTION / partial results are retried). */
  private async waitForTx(hash: string, senderId: string, waitUntil: WaitUntil, attempts = 15): Promise<TxOutcome> {
    let last: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        const raw = await this.call<unknown>('tx', { tx_hash: hash, sender_account_id: senderId, wait_until: waitUntil });
        if (isCompleteOutcome(raw)) return parseOutcome(raw);
        last = new PerdeError('RPC_ERROR', `transaction ${hash} not executed yet: ${describeFailure(raw).slice(0, 200)}`, raw);
      } catch (e) {
        last = e;
        if (!(e instanceof RpcError) || (e.causeName !== 'TIMEOUT_ERROR' && e.causeName !== 'UNKNOWN_TRANSACTION')) throw e;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new PerdeError('RPC_UNAVAILABLE', `transaction ${hash} not confirmed in time`, last);
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
