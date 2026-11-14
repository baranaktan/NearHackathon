import { PerdeError } from '../errors.js';
import { decodeMetaAddress, decodeViewingKey, encodeMetaAddress } from '../crypto/encoding.js';
import type { MetaAddress, SpendKeys, ViewKeys } from '../crypto/keys.js';
import { createReceipt, type ReceiptVerification, verifyReceipt } from '../crypto/receipt.js';
import {
  type AnnouncementLike,
  deriveInvoice,
  deriveStealth,
  invoiceMatch,
  recoverSpendScalar,
  scanAnnouncement,
  type StealthMatch,
} from '../crypto/stealth.js';
import { assertAccountId, isImplicitAccountId } from '../near/accountId.js';
import { explorerAccountUrl, explorerTxUrl, NETWORKS, type NetworkId } from '../near/network.js';
import { type FetchFn, NearRpc, type ProtocolFeeConfig, type TxOutcome, type WaitUntil } from '../near/rpc.js';
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

export interface BatchItem {
  readonly to: string;
  readonly amountYocto: bigint | string;
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
    this.rpc = new NearRpc({ urls: options.rpcUrls ?? NETWORKS[options.network].rpcUrls, ...(options.fetch ? { fetch: options.fetch } : {}) });
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

  /** `amountYocto` is what the stealth account receives; the announce fee is added on top. */
  async send(signer: Signer, senderId: string, recipientMetaOrAccountId: string, amountYocto: bigint | string): Promise<SendResult> {
    const amount = toYocto(amountYocto);
    const [meta, config] = await Promise.all([this.resolveRecipient(recipientMetaOrAccountId), this.getConfig()]);
    if (amount < config.minAmount) throw new PerdeError('INVALID_AMOUNT', `amount is below the contract minimum of ${config.minAmount} yocto`);
    const stealth = deriveStealth(meta);
    const outcome = await this.#send(signer, senderId, this.contract(), [this.#sendAction(stealth, amount + config.announceFee)]);
    return {
      txHash: outcome.hash,
      explorerUrl: this.txUrl(outcome.hash),
      receipt: createReceipt({ meta, r: stealth.r, stealthAccountId: stealth.stealthAccountId, tx: outcome.hash }),
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
  async sendBatch(signer: Signer, senderId: string, items: readonly BatchItem[]): Promise<BatchResult> {
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
      return { item, meta, amount, stealth: deriveStealth(meta) };
    });
    const actions = prepared.map((p) => this.#sendAction(p.stealth, p.amount + config.announceFee));
    const totalDeposit = prepared.reduce((s, p) => s + p.amount + config.announceFee, 0n);
    const outcome = await this.#send(signer, senderId, this.contract(), actions);
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
        receipt: createReceipt({ meta: p.meta, r: p.stealth.r, stealthAccountId: p.stealth.stealthAccountId, tx: outcome.hash }),
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
      const window = Array.from({ length: gapLimit }, (_, k) => cursor + k);
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
      cursor += gapLimit;
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
    const outcome = await this.#send(signer, stealthId, receiverId, actions);
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
   * matching announcement (if any) and the stealth account's balance.
   */
  async verifyReceipt(receipt: string): Promise<ReceiptVerification & { announced: boolean; announcement?: Announcement; balance?: bigint }> {
    const offline = verifyReceipt(receipt);
    if (!offline.valid || offline.stealthAccountId === undefined) return { ...offline, announced: false };
    const stealthId = offline.stealthAccountId;
    let announcement: Announcement | undefined;
    if (this.contractId !== undefined) {
      for await (const ann of this.iterateAnnouncements(0)) {
        if (ann.stealthAccountId === stealthId) {
          announcement = ann;
          break;
        }
      }
    }
    const balance = await this.rpc.getBalance(stealthId);
    if (announcement === undefined) return { ...offline, announced: false, balance };
    return { ...verifyReceipt(receipt, announcement), announced: true, announcement, balance };
  }

  #send(signer: Signer, signerId: string, receiverId: string, actions: readonly Action[]): Promise<TxOutcome> {
    return sendActions({ rpc: this.rpc, signer, signerId, receiverId, actions, waitUntil: this.waitUntil });
  }
}
