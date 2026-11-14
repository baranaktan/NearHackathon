import { PerdeError } from '../errors.js';
import { decodeMetaAddress, decodeViewingKey, encodeMetaAddress } from '../crypto/encoding.js';
import type { MetaAddress, SpendKeys, ViewKeys } from '../crypto/keys.js';
import { createReceipt, type ReceiptData, type ReceiptVerification, verifyReceipt } from '../crypto/receipt.js';
import {
  type AnnouncementLike,
  deriveInvoice,
  deriveStealth,
  invoiceMatch,
  recoverSpendScalar,
  scanAnnouncement,
  type StealthDerivation,
  type StealthMatch,
} from '../crypto/stealth.js';
import { assertAccountId, isImplicitAccountId, isValidAccountId } from '../near/accountId.js';
import { explorerAccountUrl, explorerTxUrl, NETWORKS, type NetworkId } from '../near/network.js';
import { type FetchFn, NearRpc, type ProtocolFeeConfig, RpcError, type TxOutcome, type WaitForTransactionOptions, type WaitUntil } from '../near/rpc.js';
import { isTxHash, matchReceiptTransaction, type ReceiptTxCheck } from './receipt-tx.js';
import { sendActions } from '../near/send.js';
import { ScalarSigner, type Signer } from '../near/signer.js';
import { type Action, deleteAccount, functionCall, transfer } from '../near/transaction.js';
import { tgas, toYocto } from '../near/units.js';
import { type ClaimFeeEstimate, type ClaimMode, estimateClaimFee, FALLBACK_FEE_CONFIG } from './fees.js';

export interface PerdeClientOptions {
  readonly network: NetworkId;
  /** Perde announcement contract. Optional: invoices and claims work without it. */
  readonly contractId?: string;
  readonly rpcUrls?: readonly string[];
  readonly fetch?: FetchFn;
  /**
   * Use this RPC client (shared endpoint health, cache and de-duplication)
   * instead of creating one from `rpcUrls`/`fetch`.
   */
  readonly rpc?: NearRpc;
  readonly waitUntil?: WaitUntil;
  /**
   * Gas attached to each `send` FunctionCall action. Default 20 Tgas: on
   * testnet a send used ~2.4 Tgas in the contract plus ~7.5 Tgas for the
   * Transfer receipt that creates the implicit account (its 0.007 NEAR
   * account-creation charge is paid out of this prepaid gas). Unused gas is
   * refunded to the sender.
   */
  readonly gasPerSend?: bigint;
}

export interface PerdeConfig {
  readonly announceFee: bigint;
  readonly minAmount: bigint;
  readonly version: string;
}

export interface Announcement extends AnnouncementLike {
  readonly index: number;
  /** Amount forwarded to the stealth account (yocto). */
  readonly amount: bigint;
  readonly timestampMs: number;
}

export interface AnnouncementPage {
  readonly announcements: readonly Announcement[];
  /** Cursor for the next call (`fromIndex`). */
  readonly nextIndex: number;
  /** True when the page was full and more announcements may follow. */
  readonly hasMore: boolean;
}

export interface ScannedPayment extends Announcement {
  /** Live liquid balance of the stealth account (0n if it no longer exists). */
  readonly balance: bigint;
  readonly exists: boolean;
  readonly tweak: bigint;
}

export interface ScanResult {
  readonly payments: readonly ScannedPayment[];
  /** Pass as `fromIndex` next time to scan only new announcements. */
  readonly nextIndex: number;
  readonly scanned: number;
}

export interface InvoicePayment {
  readonly index: number;
  readonly stealthAccountId: string;
  readonly ephemeralPk: string;
  readonly viewTag: number;
  readonly balance: bigint;
  readonly tweak: bigint;
}

export interface SendResult {
  readonly txHash: string;
  readonly explorerUrl: string;
  readonly receipt: string;
  readonly stealthAccountId: string;
  readonly ephemeralPk: string;
  readonly viewTag: number;
  readonly amountYocto: bigint;
  /** Announcement index returned by the contract. */
  readonly announcementIndex: number | undefined;
  readonly outcome: TxOutcome;
}

/** Called with the hash right after signing (before broadcast), so a lost response can be recovered by hash. */
export type TxHashCallback = (hash: string) => void;

export interface SendOptions {
  /**
   * A stealth derivation made earlier with `deriveStealth(meta)`, e.g. so a UI
   * can show the exact one-time account before the person signs. It is
   * checked against the recipient's meta-address (KEY_MISMATCH otherwise).
   * Default: a fresh derivation.
   */
  readonly stealth?: StealthDerivation;
  readonly onTxHash?: TxHashCallback;
}

export interface BatchItem {
  readonly to: string;
  readonly amountYocto: bigint | string;
  /** Pre-derived stealth account for this item (see `SendOptions.stealth`). */
  readonly stealth?: StealthDerivation;
}

export interface BatchOptions {
  readonly onTxHash?: TxHashCallback;
}

/** Outcome of an earlier claim, looked up by its transaction hash. */
export interface ClaimStatus {
  readonly txHash: string;
  readonly explorerUrl: string;
  readonly stealthAccountId: string;
  readonly success: boolean;
  readonly failure: unknown;
  readonly tokensBurnt: bigint;
  readonly outcome: TxOutcome;
}

export interface BatchItemResult {
  readonly to: string;
  readonly metaAddress: string;
  readonly stealthAccountId: string;
  readonly ephemeralPk: string;
  readonly viewTag: number;
  readonly amountYocto: bigint;
  readonly receipt: string;
}

export interface BatchResult {
  readonly txHash: string;
  readonly explorerUrl: string;
  readonly items: readonly BatchItemResult[];
  readonly totalDeposit: bigint;
  readonly outcome: TxOutcome;
}

/** A stealth account to claim: an announcement/scan match or an invoice index. */
export type Claimable = AnnouncementLike | StealthMatch | { readonly invoiceIndex: number };

export interface ClaimOptions {
  /** Transfer this exact amount instead of sweeping. */
  readonly amountYocto?: bigint;
  /**
   * "transfer" (default): Transfer(balance − reserve); a little dust stays.
   * "deleteAccount": DeleteAccount(beneficiary = destination) moves the entire
   * balance minus the exact fee; requires an existing destination account.
   */
  readonly mode?: ClaimMode;
  /** Receives the claim's transaction hash before it is broadcast (recover with `claimStatus`). */
  readonly onTxHash?: TxHashCallback;
}

export interface ClaimResult {
  readonly txHash: string;
  readonly explorerUrl: string;
  readonly stealthAccountId: string;
  readonly destinationAccountId: string;
  readonly mode: ClaimMode;
  readonly balanceBefore: bigint;
  /** Transferred amount (transfer mode) or balance handed to DeleteAccount. */
  readonly amountYocto: bigint;
  readonly fee: ClaimFeeEstimate;
  /** Tokens actually burnt by the claim (from the execution outcome). */
  readonly tokensBurnt: bigint;
  readonly outcome: TxOutcome;
}

export interface ReceiptVerificationOnChain extends ReceiptVerification {
  readonly announced: boolean;
  readonly announcement?: Announcement;
  readonly balance?: bigint;
  /** The receipt's `tx` checked against the chain. */
  readonly transaction: ReceiptTxCheck;
}

type TxLookup =
  | { readonly kind: 'none' }
  | { readonly kind: 'malformed' }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'unavailable'; readonly message: string }
  | { readonly kind: 'found'; readonly raw: unknown };

/** A lookup that misses a payment announced this recently may just be a lagging node. */
const TX_VISIBLE_GRACE_MS = 2 * 60_000;
/**
 * Public testnet nodes keep 5 epochs (43 200 blocks of ~0.6 s ≈ 36 h, measured
 * 2026-11-14); below 24 h an unknown transaction is really unknown.
 */
const TX_RETENTION_MS = 24 * 3_600_000;

const MAX_PAGE = 200;
const MAX_TX_GAS = tgas(300);
const REGISTER_DEPOSIT = 10_000_000_000_000_000_000_000n; // 0.01 NEAR, excess refunded by the contract

interface AnnouncementJson {
  index: number;
  stealth_account: string;
  ephemeral_pk: string;
  view_tag: number;
  amount: string;
  timestamp_ms: number;
}

function toAnnouncement(a: AnnouncementJson): Announcement {
  return {
    index: a.index,
    stealthAccountId: a.stealth_account,
    ephemeralPk: a.ephemeral_pk,
    viewTag: a.view_tag,
    amount: BigInt(a.amount),
    timestampMs: a.timestamp_ms,
  };
}

function asViewKeys(vk: ViewKeys | string): ViewKeys {
  return typeof vk === 'string' ? decodeViewingKey(vk) : vk;
}

function parseIndex(outcome: TxOutcome): number | undefined {
  if (outcome.successValue === undefined || outcome.successValue.length === 0) return undefined;
  const v: unknown = JSON.parse(new TextDecoder().decode(outcome.successValue));
  return typeof v === 'number' ? v : undefined;
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export class PerdeClient {
  readonly network: NetworkId;
  readonly contractId: string | undefined;
  readonly rpc: NearRpc;
  readonly waitUntil: WaitUntil;
  readonly gasPerSend: bigint;
  #feeConfig: ProtocolFeeConfig | undefined;

  constructor(options: PerdeClientOptions) {
    this.network = options.network;
    if (options.contractId !== undefined) assertAccountId(options.contractId, 'contract id');
    this.contractId = options.contractId;
    this.rpc = options.rpc ?? new NearRpc({ urls: options.rpcUrls ?? NETWORKS[options.network].rpcUrls, ...(options.fetch ? { fetch: options.fetch } : {}) });
    this.waitUntil = options.waitUntil ?? 'EXECUTED_OPTIMISTIC';
    this.gasPerSend = options.gasPerSend ?? tgas(20);
  }

  private contract(): string {
    if (this.contractId === undefined) throw new PerdeError('INVALID_ACCOUNT_ID', 'this operation needs a contractId');
    return this.contractId;
  }

  txUrl(hash: string): string {
    return explorerTxUrl(this.network, hash);
  }

  accountUrl(accountId: string): string {
    return explorerAccountUrl(this.network, accountId);
  }

  async getConfig(): Promise<PerdeConfig> {
    const c = await this.rpc.viewFunction<{ announce_fee: string; min_amount: string; version: string }>(this.contract(), 'get_config');
    return { announceFee: BigInt(c.announce_fee), minAmount: BigInt(c.min_amount), version: c.version };
  }

  async announcementCount(): Promise<number> {
    return this.rpc.viewFunction<number>(this.contract(), 'announcement_count');
  }

  /** Registered meta-address of `accountId`, or null. Invalid stored values are reported as null. */
  async getMetaAddress(accountId: string): Promise<string | null> {
    assertAccountId(accountId);
    const meta = await this.rpc.viewFunction<string | null>(this.contract(), 'get_meta_address', { account_id: accountId });
    if (meta === null) return null;
    try {
      return encodeMetaAddress(decodeMetaAddress(meta));
    } catch {
      return null;
    }
  }

  async register(signer: Signer, accountId: string, metaAddress: string | MetaAddress, deposit: bigint = REGISTER_DEPOSIT): Promise<TxOutcome> {
    const meta = typeof metaAddress === 'string' ? encodeMetaAddress(decodeMetaAddress(metaAddress)) : encodeMetaAddress(metaAddress);
    return this.#send(signer, accountId, this.contract(), [functionCall('register', { meta_address: meta }, tgas(30), deposit)]);
  }

  async unregister(signer: Signer, accountId: string): Promise<TxOutcome> {
    return this.#send(signer, accountId, this.contract(), [functionCall('unregister', {}, tgas(30), 0n)]);
  }

  /** Meta-address string or a registered account id → canonical meta-address. */
  async resolveRecipient(recipient: string): Promise<string> {
    const r = recipient.trim();
    if (r.startsWith('perde:')) return encodeMetaAddress(decodeMetaAddress(r));
    const meta = await this.getMetaAddress(r);
    if (meta === null) throw new PerdeError('RECIPIENT_NOT_REGISTERED', `${r} has no registered Perde meta-address`);
    return meta;
  }

  #sendAction(stealth: { stealthAccountId: string; ephemeralPk: string; viewTag: number }, deposit: bigint): Action {
    return functionCall(
      'send',
      { stealth_account: stealth.stealthAccountId, ephemeral_pk: stealth.ephemeralPk, view_tag: stealth.viewTag },
      this.gasPerSend,
      deposit,
    );
  }

  /**
   * `amountYocto` is what the stealth account receives; the announce fee is
   * added on top. Any signer works: a named account's `SeedSigner`, or a
   * stealth account's `ScalarSigner` to pay onward from a stealth account
   * without touching another account.
   */
  async send(signer: Signer, senderId: string, recipientMetaOrAccountId: string, amountYocto: bigint | string, options: SendOptions = {}): Promise<SendResult> {
    const amount = toYocto(amountYocto);
    const [meta, config] = await Promise.all([this.resolveRecipient(recipientMetaOrAccountId), this.getConfig()]);
    if (amount < config.minAmount) throw new PerdeError('INVALID_AMOUNT', `amount is below the contract minimum of ${config.minAmount} yocto`);
    const stealth = options.stealth === undefined ? deriveStealth(meta) : checkedStealth(meta, options.stealth);
    const outcome = await this.#send(signer, senderId, this.contract(), [this.#sendAction(stealth, amount + config.announceFee)], options.onTxHash);
    return {
      txHash: outcome.hash,
      explorerUrl: this.txUrl(outcome.hash),
      receipt: createReceipt({ meta, r: stealth.r, stealthAccountId: stealth.stealthAccountId, tx: outcome.hash, from: senderId }),
      stealthAccountId: stealth.stealthAccountId,
      ephemeralPk: stealth.ephemeralPk,
      viewTag: stealth.viewTag,
      amountYocto: amount,
      announcementIndex: parseIndex(outcome),
      outcome,
    };
  }

  /** Largest batch that fits in one transaction with the configured gas per send. */
  get maxBatchSize(): number {
    return Number(MAX_TX_GAS / this.gasPerSend);
  }

  /** One transaction with one `send` FunctionCall per item (atomic: all or nothing). */
  async sendBatch(signer: Signer, senderId: string, items: readonly BatchItem[], options: BatchOptions = {}): Promise<BatchResult> {
    if (items.length === 0) throw new PerdeError('INVALID_AMOUNT', 'batch is empty');
    if (items.length > this.maxBatchSize) {
      throw new PerdeError('INVALID_AMOUNT', `batch of ${items.length} exceeds the ${this.maxBatchSize}-action gas limit; split it`);
    }
    const config = await this.getConfig();
    const uniqueTargets = [...new Set(items.map((i) => i.to.trim()))];
    const resolved = new Map<string, string>();
    await mapLimit(uniqueTargets, 6, async (t) => {
      resolved.set(t, await this.resolveRecipient(t));
    });
    const prepared = items.map((item) => {
      const amount = toYocto(item.amountYocto);
      if (amount < config.minAmount) throw new PerdeError('INVALID_AMOUNT', `amount for ${item.to} is below the minimum of ${config.minAmount} yocto`);
      const meta = resolved.get(item.to.trim()) as string;
      return { item, meta, amount, stealth: item.stealth === undefined ? deriveStealth(meta) : checkedStealth(meta, item.stealth) };
    });
    if (new Set(prepared.map((p) => p.stealth.stealthAccountId)).size !== prepared.length) {
      throw new PerdeError('INVALID_AMOUNT', 'two batch items use the same stealth account');
    }
    const actions = prepared.map((p) => this.#sendAction(p.stealth, p.amount + config.announceFee));
    const totalDeposit = prepared.reduce((s, p) => s + p.amount + config.announceFee, 0n);
    const outcome = await this.#send(signer, senderId, this.contract(), actions, options.onTxHash);
    return {
      txHash: outcome.hash,
      explorerUrl: this.txUrl(outcome.hash),
      totalDeposit,
      outcome,
      items: prepared.map((p) => ({
        to: p.item.to,
        metaAddress: p.meta,
        stealthAccountId: p.stealth.stealthAccountId,
        ephemeralPk: p.stealth.ephemeralPk,
        viewTag: p.stealth.viewTag,
        amountYocto: p.amount,
        receipt: createReceipt({ meta: p.meta, r: p.stealth.r, stealthAccountId: p.stealth.stealthAccountId, tx: outcome.hash, from: senderId }),
      })),
    };
  }

  async fetchAnnouncements(options: { fromIndex?: number; limit?: number } = {}): Promise<AnnouncementPage> {
    const fromIndex = options.fromIndex ?? 0;
    const limit = Math.min(options.limit ?? MAX_PAGE, MAX_PAGE);
    const raw = await this.rpc.viewFunction<AnnouncementJson[]>(this.contract(), 'get_announcements', { from_index: fromIndex, limit });
    const announcements = raw.map(toAnnouncement);
    return { announcements, nextIndex: fromIndex + announcements.length, hasMore: announcements.length === limit };
  }

  async *iterateAnnouncements(fromIndex = 0): AsyncGenerator<Announcement> {
    let cursor = fromIndex;
    for (;;) {
      const page = await this.fetchAnnouncements({ fromIndex: cursor });
      yield* page.announcements;
      cursor = page.nextIndex;
      if (!page.hasMore) return;
    }
  }

  /** Find payments for these view keys (or viewing key string) and attach live balances. */
  async scan(viewKeysOrViewingKey: ViewKeys | string, options: { fromIndex?: number } = {}): Promise<ScanResult> {
    const vk = asViewKeys(viewKeysOrViewingKey);
    const matches: { ann: Announcement; match: StealthMatch }[] = [];
    let nextIndex = options.fromIndex ?? 0;
    let scanned = 0;
    for await (const ann of this.iterateAnnouncements(nextIndex)) {
      scanned++;
      nextIndex = ann.index + 1;
      const match = scanAnnouncement(vk, ann);
      if (match !== null) matches.push({ ann, match });
    }
    const payments = await mapLimit(matches, 6, async ({ ann, match }) => {
      const view = await this.rpc.viewAccountOrNull(match.stealthAccountId);
      return { ...ann, balance: view?.amount ?? 0n, exists: view !== null, tweak: match.tweak };
    });
    return { payments, nextIndex, scanned };
  }

  /**
   * Check derived invoice accounts 0, 1, 2, ... via RPC; stops after `gapLimit`
   * consecutive indices whose account does not exist.
   */
  async scanInvoices(viewKeysOrViewingKey: ViewKeys | string, options: { gapLimit?: number; startIndex?: number } = {}): Promise<InvoicePayment[]> {
    const vk = asViewKeys(viewKeysOrViewingKey);
    const gapLimit = options.gapLimit ?? 20;
    if (!Number.isInteger(gapLimit) || gapLimit < 1) throw new PerdeError('INVALID_AMOUNT', 'gapLimit must be a positive integer');
    const found: InvoicePayment[] = [];
    let lastUsed = (options.startIndex ?? 0) - 1;
    let cursor = options.startIndex ?? 0;
    while (cursor - 1 - lastUsed < gapLimit) {
      // Only as many indices as still needed to see `gapLimit` empty ones in a row after the last used one.
      const window = Array.from({ length: gapLimit - (cursor - 1 - lastUsed) }, (_, k) => cursor + k);
      const results = await mapLimit(window, 8, async (i) => {
        const inv = deriveInvoice(vk, i);
        const view = await this.rpc.viewAccountOrNull(inv.stealthAccountId);
        return { inv, view };
      });
      for (const { inv, view } of results) {
        if (view === null) continue;
        lastUsed = Math.max(lastUsed, inv.index);
        found.push({
          index: inv.index,
          stealthAccountId: inv.stealthAccountId,
          ephemeralPk: inv.ephemeralPk,
          viewTag: inv.viewTag,
          balance: view.amount,
          tweak: invoiceMatch(vk, inv.index).tweak,
        });
      }
      cursor += window.length;
    }
    return found.sort((a, b) => a.index - b.index);
  }

  async claimFeeConfig(): Promise<ProtocolFeeConfig> {
    if (this.#feeConfig === undefined) {
      try {
        this.#feeConfig = await this.rpc.protocolConfig();
      } catch {
        this.#feeConfig = FALLBACK_FEE_CONFIG;
      }
    }
    return this.#feeConfig;
  }

  async estimateClaimFee(destinationAccountId: string, mode: ClaimMode = 'transfer'): Promise<ClaimFeeEstimate> {
    const [config, gasPrice, destExists] = await Promise.all([
      this.claimFeeConfig(),
      this.rpc.gasPrice(),
      this.rpc.accountExists(destinationAccountId),
    ]);
    return estimateClaimFee({ config, gasPrice, mode, createsDestination: !destExists });
  }

  /**
   * Move funds out of a stealth account, signing with the recovered stealth
   * scalar. The stealth account pays its own gas.
   */
  async claim(keys: SpendKeys, payment: Claimable, destinationAccountId: string, options: ClaimOptions = {}): Promise<ClaimResult> {
    const mode = options.mode ?? 'transfer';
    assertAccountId(destinationAccountId, 'destination');
    const match = 'invoiceIndex' in payment ? invoiceMatch(keys, payment.invoiceIndex) : payment;
    const p = recoverSpendScalar(keys, match);
    const signer = new ScalarSigner(p);
    const stealthId = signer.accountId;
    if (destinationAccountId === stealthId) throw new PerdeError('INVALID_ACCOUNT_ID', 'destination is the stealth account itself');

    const [stealthView, destExists, config, gasPrice] = await Promise.all([
      this.rpc.viewAccountOrNull(stealthId),
      this.rpc.accountExists(destinationAccountId),
      this.claimFeeConfig(),
      this.rpc.gasPrice(),
    ]);
    if (stealthView === null) throw new PerdeError('INSUFFICIENT_BALANCE', `stealth account ${stealthId} does not exist (nothing to claim)`);
    if (!destExists && (mode === 'deleteAccount' || !isImplicitAccountId(destinationAccountId))) {
      throw new PerdeError('DESTINATION_NOT_FOUND', `destination account ${destinationAccountId} does not exist`);
    }
    const fee = estimateClaimFee({ config, gasPrice, mode, createsDestination: !destExists });
    const balance = stealthView.amount;

    let actions: Action[];
    let receiverId: string;
    let amount: bigint;
    if (mode === 'deleteAccount') {
      if (options.amountYocto !== undefined) throw new PerdeError('INVALID_AMOUNT', 'amountYocto cannot be combined with deleteAccount mode');
      if (balance <= fee.expectedFee) throw new PerdeError('INSUFFICIENT_BALANCE', 'balance does not cover the claim fee');
      amount = balance;
      receiverId = stealthId;
      actions = [deleteAccount(destinationAccountId)];
    } else {
      amount = options.amountYocto ?? balance - fee.reserve;
      if (amount <= 0n || amount + fee.reserve > balance) {
        throw new PerdeError('INSUFFICIENT_BALANCE', `balance ${balance} cannot cover ${amount} plus gas reserve ${fee.reserve}`, { balance, fee });
      }
      receiverId = destinationAccountId;
      actions = [transfer(amount)];
    }
    const outcome = await this.#send(signer, stealthId, receiverId, actions, options.onTxHash);
    return {
      txHash: outcome.hash,
      explorerUrl: this.txUrl(outcome.hash),
      stealthAccountId: stealthId,
      destinationAccountId,
      mode,
      balanceBefore: balance,
      amountYocto: amount,
      fee,
      tokensBurnt: outcome.tokensBurnt,
      outcome,
    };
  }

  /**
   * Receipt verification against chain state: offline check, then the
   * matching announcement (if any), the stealth account's balance and, when
   * the receipt names a transaction (`tx`), that transaction (see
   * `matchReceiptTransaction`). A `tx` that does not make this payment makes
   * the receipt invalid; a `tx` that could not be read is reported as
   * `unchecked`, never as a match.
   */
  async verifyReceipt(receipt: string, options: { now?: number } = {}): Promise<ReceiptVerificationOnChain> {
    const offline = verifyReceipt(receipt);
    if (!offline.valid || offline.stealthAccountId === undefined || offline.data === undefined) {
      return { ...offline, announced: false, transaction: { status: 'unchecked', reason: 'the receipt itself does not check out' } };
    }
    const data = offline.data;
    const stealthId = offline.stealthAccountId;
    const txLookup = this.#lookupReceiptTransaction(data);
    let announcement: Announcement | undefined;
    if (this.contractId !== undefined) {
      for await (const ann of this.iterateAnnouncements(0)) {
        if (ann.stealthAccountId === stealthId) {
          announcement = ann;
          break;
        }
      }
    }
    const [balance, lookup] = await Promise.all([this.rpc.getBalance(stealthId), txLookup]);
    const transaction = this.#judgeReceiptTransaction(data, offline, lookup, announcement, options.now ?? Date.now());
    const base = announcement === undefined ? { ...offline, announced: false } : { ...verifyReceipt(receipt, announcement), announced: true, announcement };
    if (transaction.status === 'mismatch' && base.valid) {
      return { ...base, valid: false, reason: `transaction ${transaction.txHash} does not match this payment: ${transaction.reason}`, balance, transaction };
    }
    return { ...base, balance, transaction };
  }

  /** Read the receipt's `tx` with receipts (`EXPERIMENTAL_tx_status`); never throws. */
  async #lookupReceiptTransaction(data: ReceiptData): Promise<TxLookup> {
    const hash = data.tx;
    if (hash === undefined) return { kind: 'none' };
    if (!isTxHash(hash)) return { kind: 'malformed' };
    // The RPC routes the lookup by the signer's shard. Nodes that track every shard (the public
    // testnet RPCs) answer for any valid account id; the receipt's `from` is the exact signer.
    const hint = data.from !== undefined && isValidAccountId(data.from) ? data.from : (this.contractId ?? data.stealth);
    try {
      return { kind: 'found', raw: await this.rpc.call<unknown>('EXPERIMENTAL_tx_status', { tx_hash: hash, sender_account_id: hint, wait_until: 'NONE' }) };
    } catch (e) {
      if (e instanceof RpcError && e.causeName === 'UNKNOWN_TRANSACTION') return { kind: 'unknown' };
      return { kind: 'unavailable', message: e instanceof Error ? e.message : String(e) };
    }
  }

  #judgeReceiptTransaction(data: ReceiptData, offline: ReceiptVerification, lookup: TxLookup, announcement: Announcement | undefined, now: number): ReceiptTxCheck {
    const txHash = data.tx;
    switch (lookup.kind) {
      case 'none':
        return { status: 'unchecked', reason: 'the receipt names no transaction' };
      case 'malformed':
        return { status: 'mismatch', txHash: txHash ?? '', reason: 'this is not a NEAR transaction hash' };
      case 'unavailable':
        return { status: 'unchecked', ...(txHash !== undefined ? { txHash } : {}), reason: `the RPC could not look the transaction up (${lookup.message.slice(0, 160)})` };
      case 'unknown': {
        const hash = txHash ?? '';
        // Public (non-archival) nodes forget transactions after a few epochs (~1.5 days on testnet),
        // and a node may lag the block for a moment, so "unknown" proves a mismatch only in between.
        const age = announcement === undefined ? undefined : now - announcement.timestampMs;
        if (age !== undefined && age >= TX_VISIBLE_GRACE_MS && age < TX_RETENTION_MS) {
          return { status: 'mismatch', txHash: hash, reason: `testnet has no transaction with this hash, although the payment was announced only ${Math.max(1, Math.round(age / 3_600_000))} h ago` };
        }
        return {
          status: 'unchecked',
          txHash: hash,
          reason: age !== undefined && age < TX_VISIBLE_GRACE_MS ? 'the RPC does not show this transaction yet; verify again in a minute' : 'the RPC does not have this transaction (public nodes keep about 1.5 days of history)',
        };
      }
      case 'found':
        return matchReceiptTransaction(lookup.raw, {
          txHash: txHash ?? '',
          stealthAccountId: data.stealth,
          ephemeralPk: offline.ephemeralPk ?? '',
          viewTag: offline.viewTag ?? -1,
          ...(this.contractId !== undefined ? { contractId: this.contractId } : {}),
          ...(data.from !== undefined ? { signerId: data.from } : {}),
        });
    }
  }

  /**
   * Outcome of any transaction by hash (e.g. one whose response was lost
   * after `onTxHash` reported its hash). Polls briefly; see
   * `NearRpc.waitForTransaction`.
   */
  async transactionOutcome(txHash: string, signerId: string, options: WaitForTransactionOptions = {}): Promise<TxOutcome> {
    return this.rpc.waitForTransaction(txHash, signerId, { waitUntil: this.waitUntil, ...options });
  }

  /**
   * Recover a claim's outcome by its transaction hash (from `onTxHash`, or
   * `details.hash` of the error a claim threw when its response was lost).
   * A claim is signed by the stealth account, so that is the sender to look up.
   */
  async claimStatus(txHash: string, stealthAccountId: string, options: WaitForTransactionOptions = {}): Promise<ClaimStatus> {
    const outcome = await this.transactionOutcome(txHash, stealthAccountId, options);
    return {
      txHash: outcome.hash,
      explorerUrl: this.txUrl(outcome.hash),
      stealthAccountId,
      success: outcome.success,
      failure: outcome.failure,
      tokensBurnt: outcome.tokensBurnt,
      outcome,
    };
  }

  #send(signer: Signer, signerId: string, receiverId: string, actions: readonly Action[], onTxHash?: TxHashCallback): Promise<TxOutcome> {
    return sendActions({ rpc: this.rpc, signer, signerId, receiverId, actions, waitUntil: this.waitUntil, ...(onTxHash ? { onTxHash } : {}) });
  }
}

/** A caller-supplied derivation must be the one `deriveStealth(meta, r)` gives for this meta-address. */
function checkedStealth(meta: string, stealth: StealthDerivation): StealthDerivation {
  const expected = deriveStealth(meta, stealth.r);
  if (expected.stealthAccountId !== stealth.stealthAccountId || expected.ephemeralPk !== stealth.ephemeralPk || expected.viewTag !== stealth.viewTag) {
    throw new PerdeError('KEY_MISMATCH', 'the pre-derived stealth account does not belong to this recipient');
  }
  return expected;
}
