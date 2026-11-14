import { PerdeError } from './errors.js';
import { isImplicitAccountId, isValidAccountId } from './near/accountId.js';
import type { FetchFn } from './near/rpc.js';

export const ONECLICK_BASE_URL = 'https://1click.chaindefuser.com';

/**
 * 1Click asset id for NEAR on the NEAR chain. The token list has no separate
 * native-NEAR entry; per the NEAR Intents docs, wrapping/unwrapping is handled
 * by 1Click. Verified with a live dry quote to a 64-hex implicit recipient.
 */
export const NEAR_ASSET_ID = 'nep141:wrap.near';

export type Blockchain = string;
export type SwapType = 'EXACT_INPUT' | 'EXACT_OUTPUT' | 'FLEX_INPUT' | 'ANY_INPUT';
export type DepositType = 'ORIGIN_CHAIN' | 'INTENTS' | 'CONFIDENTIAL_INTENTS';
export type RecipientType = 'DESTINATION_CHAIN' | 'INTENTS' | 'CONFIDENTIAL_INTENTS';
export type RefundType = 'ORIGIN_CHAIN' | 'INTENTS' | 'CONFIDENTIAL_INTENTS';
export type SwapStatus = 'KNOWN_DEPOSIT_TX' | 'PENDING_DEPOSIT' | 'INCOMPLETE_DEPOSIT' | 'PROCESSING' | 'SUCCESS' | 'REFUNDED' | 'FAILED';

export interface OneClickToken {
  readonly assetId: string;
  readonly decimals: number;
  readonly blockchain: Blockchain;
  readonly symbol: string;
  readonly price: number;
  readonly priceUpdatedAt: string;
  readonly contractAddress?: string;
  readonly coingeckoId?: string;
}

export interface AppFee {
  readonly recipient: string;
  /** Basis points. */
  readonly fee: number;
}

export interface QuoteRequest {
  readonly dry: boolean;
  readonly swapType: SwapType;
  /** Basis points, 100 = 1%. */
  readonly slippageTolerance: number;
  readonly originAsset: string;
  readonly depositType: DepositType;
  readonly destinationAsset: string;
  /** Integer string in the smallest unit of the input (or output for EXACT_OUTPUT). */
  readonly amount: string;
  readonly refundTo: string;
  readonly refundType: RefundType;
  readonly recipient: string;
  readonly recipientType: RecipientType;
  /** ISO 8601. */
  readonly deadline: string;
  readonly depositMode?: 'SIMPLE' | 'MEMO';
  readonly appFees?: readonly AppFee[];
  readonly referral?: string;
  readonly quoteWaitingTimeMs?: number;
  readonly connectedWallets?: readonly string[];
  readonly sessionId?: string;
  readonly confidentiality?: 'public' | 'basic' | 'advanced';
  readonly insured?: boolean;
}

export interface Quote {
  readonly amountIn: string;
  readonly amountInFormatted: string;
  readonly amountInUsd: string;
  readonly minAmountIn: string;
  readonly amountOut: string;
  readonly amountOutFormatted: string;
  readonly amountOutUsd: string;
  readonly minAmountOut: string;
  /** Seconds after the deposit is confirmed. */
  readonly timeEstimate: number;
  readonly refundFee?: string;
  readonly withdrawFee?: string;
  /** Absent for dry quotes. */
  readonly depositAddress?: string;
  readonly depositMemo?: string;
  readonly deadline?: string;
  readonly timeWhenInactive?: string;
}

export interface QuoteResponse {
  readonly correlationId: string;
  readonly timestamp: string;
  readonly signature: string;
  readonly quoteRequest: QuoteRequest;
  readonly quote: Quote;
}

export interface TransactionDetails {
  readonly hash: string;
  readonly explorerUrl: string;
}

export interface SwapDetails {
  readonly intentHashes: readonly string[];
  readonly nearTxHashes: readonly string[];
  readonly originChainTxHashes: readonly TransactionDetails[];
  readonly destinationChainTxHashes: readonly TransactionDetails[];
  readonly amountIn?: string;
  readonly amountInFormatted?: string;
  readonly amountInUsd?: string;
  readonly amountOut?: string;
  readonly amountOutFormatted?: string;
  readonly amountOutUsd?: string;
  readonly slippage?: number;
  readonly refundedAmount?: string;
  readonly refundedAmountFormatted?: string;
  readonly refundedAmountUsd?: string;
  readonly refundReason?: string;
  readonly depositedAmount?: string;
  readonly depositedAmountFormatted?: string;
  readonly depositedAmountUsd?: string;
  readonly withdrawFee?: string;
  readonly referral?: string;
}

export interface StatusResponse {
  readonly correlationId: string;
  readonly quoteResponse: QuoteResponse;
  readonly status: SwapStatus;
  readonly updatedAt: string;
  readonly swapDetails: SwapDetails;
}

export interface OneClickOptions {
  readonly baseUrl?: string;
  /** Optional partner key, sent as `X-API-Key`. Without it 1Click adds a small extra fee. */
  readonly apiKey?: string;
  readonly fetch?: FetchFn;
  readonly timeoutMs?: number;
}

export type QuoteParams = Omit<QuoteRequest, 'dry'> & { readonly dry?: boolean };

export class OneClickError extends PerdeError {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super('ONECLICK_ERROR', message, body);
    this.name = 'OneClickError';
    this.status = status;
    this.body = body;
  }
}

export class OneClickClient {
  readonly baseUrl: string;
  readonly #apiKey: string | undefined;
  readonly #fetch: FetchFn;
  readonly #timeoutMs: number;

  constructor(options: OneClickOptions = {}) {
    this.baseUrl = (options.baseUrl ?? ONECLICK_BASE_URL).replace(/\/+$/u, '');
    this.#apiKey = options.apiKey;
    const f = options.fetch ?? globalThis.fetch;
    this.#fetch = (url, init) => f(url, init);
    this.#timeoutMs = options.timeoutMs ?? 20_000;
  }

  async #request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.#apiKey !== undefined && this.#apiKey !== '') headers['X-API-Key'] = this.#apiKey;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.#timeoutMs);
    let res: Response;
    try {
      res = await this.#fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        signal: controller.signal,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (e) {
      throw new OneClickError(0, `1Click request failed: ${e instanceof Error ? e.message : String(e)}`, undefined);
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text === '' ? undefined : JSON.parse(text);
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      const msg =
        typeof parsed === 'object' && parsed !== null && 'message' in parsed && typeof parsed.message === 'string' ? parsed.message : text.slice(0, 300);
      throw new OneClickError(res.status, `1Click ${method} ${path} → HTTP ${res.status}: ${msg}`, parsed);
    }
    return parsed as T;
  }

  listTokens(): Promise<OneClickToken[]> {
    return this.#request<OneClickToken[]>('GET', '/v0/tokens');
  }

  /** Request a quote. `dry` defaults to true: no deposit address is created. */
  quote(params: QuoteParams): Promise<QuoteResponse> {
    if (!/^\d+$/u.test(params.amount) || params.amount === '0') throw new PerdeError('INVALID_AMOUNT', 'amount must be a positive integer string in base units');
    return this.#request<QuoteResponse>('POST', '/v0/quote', { ...params, dry: params.dry ?? true });
  }

  status(depositAddress: string, depositMemo?: string): Promise<StatusResponse> {
    const q = new URLSearchParams({ depositAddress });
    if (depositMemo !== undefined) q.set('depositMemo', depositMemo);
    return this.#request<StatusResponse>('GET', `/v0/status?${q.toString()}`);
  }
}

export interface QuoteToStealthParams {
  readonly originAsset: string;
  /** Exact NEAR (yocto) the stealth account should receive → EXACT_OUTPUT. */
  readonly amountOutYocto?: bigint;
  /** Exact input amount in the origin asset's base units → EXACT_INPUT. */
  readonly amountIn?: bigint | string;
  readonly stealthAccountId: string;
  /** Refund address on the origin chain (or an Intents account with refundType INTENTS). */
  readonly refundTo: string;
  readonly refundType?: RefundType;
  readonly dry?: boolean;
  /** Basis points. Default 100 (1%). */
  readonly slippageTolerance?: number;
  /** Default: now + 30 minutes. */
  readonly deadline?: Date;
}

/** Quote delivering NEAR on the NEAR chain to a stealth (or any NEAR) account. */
export function quoteToStealth(client: OneClickClient, params: QuoteToStealthParams): Promise<QuoteResponse> {
  if (!isImplicitAccountId(params.stealthAccountId) && !isValidAccountId(params.stealthAccountId)) {
    throw new PerdeError('INVALID_ACCOUNT_ID', `invalid NEAR recipient: ${params.stealthAccountId}`);
  }
  const hasOut = params.amountOutYocto !== undefined;
  const hasIn = params.amountIn !== undefined;
  if (hasOut === hasIn) throw new PerdeError('INVALID_AMOUNT', 'pass exactly one of amountOutYocto or amountIn');
  const amount = params.amountOutYocto !== undefined ? params.amountOutYocto.toString() : String(params.amountIn);
  return client.quote({
    dry: params.dry ?? true,
    swapType: hasOut ? 'EXACT_OUTPUT' : 'EXACT_INPUT',
    slippageTolerance: params.slippageTolerance ?? 100,
    originAsset: params.originAsset,
    depositType: 'ORIGIN_CHAIN',
    destinationAsset: NEAR_ASSET_ID,
    amount,
    refundTo: params.refundTo,
    refundType: params.refundType ?? 'ORIGIN_CHAIN',
    recipient: params.stealthAccountId,
    recipientType: 'DESTINATION_CHAIN',
    deadline: (params.deadline ?? new Date(Date.now() + 30 * 60_000)).toISOString(),
  });
}
