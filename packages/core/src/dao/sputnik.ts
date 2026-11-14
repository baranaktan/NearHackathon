import { isPerdeError, PerdeError } from '../errors.js';
import { pollUntil, type PollOptions } from '../near/poll.js';
import { createReceipt } from '../crypto/receipt.js';
import { deriveStealth } from '../crypto/stealth.js';
import { assertAccountId } from '../near/accountId.js';
import { explorerAccountUrl, explorerTxUrl, NETWORKS, type NetworkId } from '../near/network.js';
import { type FetchFn, NearRpc, RpcError, type TxOutcome, type WaitUntil } from '../near/rpc.js';
import { sendActions } from '../near/send.js';
import type { Signer } from '../near/signer.js';
import { functionCall } from '../near/transaction.js';
import { parseNear, tgas, toYocto } from '../near/units.js';
import { PerdeClient } from '../perde/client.js';
import { buildStealthPaymentProposal, DEFAULT_PAYMENT_DESCRIPTION, describeProposal, encodeDaoCreateArgs, type ProposalSummary, SPUTNIK_FACTORY } from './proposals.js';
import type { SputnikAction, SputnikConfig, SputnikFunctionCallKind, SputnikPolicy, SputnikProposal, SputnikProposalInput, SputnikProposalStatus } from './types.js';

export interface SputnikDaoOptions {
  readonly network: NetworkId;
  /** DAO account, e.g. `perde-demo.sputnikv2.testnet`. */
  readonly daoId: string;
  /** Perde contract the DAO pays through (needed for stealth payments). */
  readonly perdeContractId?: string;
  readonly rpcUrls?: readonly string[];
  readonly fetch?: FetchFn;
  /** Use this RPC client (also for the inner PerdeClient) instead of creating one from `rpcUrls`/`fetch`. */
  readonly rpc?: NearRpc;
  readonly waitUntil?: WaitUntil;
}

export interface DaoBalance {
  /** Liquid account balance. */
  readonly total: bigint;
  /** NEAR locked for the contract's storage. */
  readonly storageLocked: bigint;
  /** Spendable by proposals (`get_available_amount`: total − storage − bonds held). */
  readonly available: bigint;
}

export interface AddProposalResult {
  readonly proposalId: number;
  readonly txHash: string;
  readonly explorerUrl: string;
  /** Bond attached (exactly `policy.proposal_bond`). */
  readonly bondYocto: bigint;
  readonly outcome: TxOutcome;
}

export interface StealthPaymentRequest {
  /** `perde:` meta-address or an account name registered in the Perde directory. */
  readonly recipient: string;
  /** What the stealth account receives. */
  readonly amountYocto: bigint | string;
  /** Public proposal text. Must not name the recipient (checked). */
  readonly description?: string;
  /** Refuse to propose when the treasury cannot pay. Default true. */
  readonly checkTreasury?: boolean;
}

export interface StealthPaymentProposal extends AddProposalResult {
  readonly stealthAccountId: string;
  readonly ephemeralPk: string;
  readonly viewTag: number;
  readonly amountYocto: bigint;
  /** amount + announce fee: what the DAO attaches to `send` when the proposal executes. */
  readonly depositYocto: bigint;
  /** Sender-side receipt (`perdereceipt:`) proving which meta-address the stealth account belongs to. Keep it private. */
  readonly receipt: string;
  readonly proposal: SputnikProposalInput;
}

export type VoteChoice = 'approve' | 'reject' | 'remove';

export interface VoteOptions {
  /** Logged by the DAO, not stored. */
  readonly memo?: string;
  /** Prepaid gas. Default: the proposal's action gas + 10 Tgas callback + 40 Tgas (min 50, max 300 Tgas). */
  readonly gas?: bigint;
  /** Bound for read-after-write polling of the proposal before and after the vote. Default 20 s. */
  readonly readTimeoutMs?: number;
}

const DEFAULT_READ_TIMEOUT_MS = 20_000;

function isFunctionCallKind(kind: SputnikProposal['kind']): kind is SputnikFunctionCallKind {
  if (typeof kind !== 'object') return false;
  const fc = (kind as { FunctionCall?: unknown }).FunctionCall;
  return typeof fc === 'object' && fc !== null && typeof (fc as { receiver_id?: unknown }).receiver_id === 'string';
}

/** Gas `act_proposal` needs when it may execute this proposal kind. */
export function actProposalGas(kind: SputnikProposal['kind']): bigint {
  let actions = 0n;
  if (typeof kind === 'object' && 'FunctionCall' in kind) {
    const fc = (kind as { FunctionCall?: { actions?: readonly { gas?: unknown }[] } }).FunctionCall;
    for (const a of fc?.actions ?? []) {
      try {
        actions += BigInt(String(a.gas));
      } catch {
        // malformed gas: ignore, the contract would reject such a proposal anyway
      }
    }
  }
  const total = actions + CALLBACK_GAS + ACT_OVERHEAD_GAS;
  return total < MIN_ACT_GAS ? MIN_ACT_GAS : total > MAX_TX_GAS ? MAX_TX_GAS : total;
}

export interface VoteResult {
  readonly txHash: string;
  readonly explorerUrl: string;
  readonly action: SputnikAction;
  /** Status read back after the transaction and all its receipts executed. */
  readonly status: SputnikProposalStatus | undefined;
  /** True when this vote approved the proposal and its FunctionCall succeeded. */
  readonly executed: boolean;
  /** Receipts of the proposal's FunctionCall that failed, if any. */
  readonly failedReceipts: readonly { readonly executorId: string; readonly failure: unknown }[];
  readonly outcome: TxOutcome;
}

export interface CreateDaoParams {
  readonly rpc: NearRpc;
  readonly signer: Signer;
  readonly signerId: string;
  /** Short name; the DAO becomes `<name>.<factory>`. */
  readonly name: string;
  readonly config: SputnikConfig;
  readonly policy: SputnikPolicy;
  /** Attached to `create`; must cover the DAO contract's storage (~5.41 NEAR for the testnet default code), the rest is treasury. */
  readonly depositYocto: bigint;
  readonly factoryId?: string;
  readonly network?: NetworkId;
  readonly waitUntil?: WaitUntil;
}

export interface CreateDaoResult {
  readonly daoId: string;
  readonly created: boolean;
  readonly txHash: string;
  readonly explorerUrl: string;
  readonly outcome: TxOutcome;
}

const ADD_PROPOSAL_GAS = tgas(50);
/**
 * `act_proposal` may execute the proposal in the same call, so it must carry
 * the proposal's action gas plus `on_proposal_callback` (10 Tgas) plus its own
 * work. Prepaid gas is reserved from the voter's balance at the protocol's
 * minimum purchase price (1e9 yocto/gas on testnet), so attaching 300 Tgas
 * would require 0.3 NEAR of headroom; we attach only what is needed.
 */
const ACT_OVERHEAD_GAS = tgas(40);
const CALLBACK_GAS = tgas(10);
const MIN_ACT_GAS = tgas(50);
const MAX_TX_GAS = tgas(300);
const CREATE_GAS = tgas(300);
/** Margin for the proposal's own storage (paid from the treasury). */
const PROPOSAL_STORAGE_MARGIN = parseNear('0.01');

const VOTE_ACTION: Readonly<Record<VoteChoice, SputnikAction>> = { approve: 'VoteApprove', reject: 'VoteReject', remove: 'VoteRemove' };

function parseJsonValue(outcome: TxOutcome): unknown {
  if (outcome.successValue === undefined || outcome.successValue.length === 0) return undefined;
  try {
    return JSON.parse(new TextDecoder().decode(outcome.successValue));
  } catch {
    return undefined;
  }
}

/**
 * Minimal client for an existing SputnikDAO v2 contract, focused on paying
 * contributors privately through Perde: the DAO proposal calls
 * `perde.send(...)`, so the chain shows that the treasury paid a fresh
 * stealth account, not who received it.
 */
export class SputnikDao {
  readonly network: NetworkId;
  readonly daoId: string;
  readonly rpc: NearRpc;
  readonly perde: PerdeClient | undefined;
  readonly waitUntil: WaitUntil;

  constructor(options: SputnikDaoOptions) {
    assertAccountId(options.daoId, 'DAO id');
    this.network = options.network;
    this.daoId = options.daoId;
    const rpcUrls = options.rpcUrls ?? NETWORKS[options.network].rpcUrls;
    this.rpc = options.rpc ?? new NearRpc({ urls: rpcUrls, ...(options.fetch ? { fetch: options.fetch } : {}) });
    this.waitUntil = options.waitUntil ?? 'EXECUTED_OPTIMISTIC';
    this.perde =
      options.perdeContractId === undefined
        ? undefined
        : new PerdeClient({ network: options.network, contractId: options.perdeContractId, rpc: this.rpc, waitUntil: this.waitUntil });
  }

  /** Default DAO id for a name on the network's v2 factory. */
  static daoIdFor(name: string, network: NetworkId = 'testnet'): string {
    return `${name}.${SPUTNIK_FACTORY[network]}`;
  }

  /**
   * `<factory>.create({name, args})`. Returns `created: false` (and the
   * factory's refund happens on-chain) when the DAO account could not be
   * created, e.g. because the name is taken or the deposit was too small.
   */
  static async create(params: CreateDaoParams): Promise<CreateDaoResult> {
    const network = params.network ?? 'testnet';
    const factoryId = params.factoryId ?? SPUTNIK_FACTORY[network];
    const daoId = `${params.name}.${factoryId}`;
    assertAccountId(daoId, 'DAO id');
    const outcome = await sendActions({
      rpc: params.rpc,
      signer: params.signer,
      signerId: params.signerId,
      receiverId: factoryId,
      actions: [functionCall('create', { name: params.name, args: encodeDaoCreateArgs(params.config, params.policy) }, CREATE_GAS, params.depositYocto)],
      waitUntil: params.waitUntil ?? 'EXECUTED_OPTIMISTIC',
    });
    const created = parseJsonValue(outcome) === true || (await params.rpc.accountExists(daoId));
    return { daoId, created, txHash: outcome.hash, explorerUrl: explorerTxUrl(network, outcome.hash), outcome };
  }

  accountUrl(): string {
    return explorerAccountUrl(this.network, this.daoId);
  }

  txUrl(hash: string): string {
    return explorerTxUrl(this.network, hash);
  }

  #view<T>(method: string, args: object = {}): Promise<T> {
    return this.rpc.viewFunction<T>(this.daoId, method, args);
  }

  #perde(): PerdeClient {
    if (this.perde === undefined) throw new PerdeError('DAO_ERROR', 'this operation needs perdeContractId');
    return this.perde;
  }

  getPolicy(): Promise<SputnikPolicy> {
    return this.#view<SputnikPolicy>('get_policy');
  }

  getConfig(): Promise<SputnikConfig> {
    return this.#view<SputnikConfig>('get_config');
  }

  /** Contract semver (`version()`), e.g. "2.3.1". */
  getVersion(): Promise<string> {
    return this.#view<string>('version');
  }

  async getBalance(): Promise<DaoBalance> {
    const [account, storage, available] = await Promise.all([
      this.rpc.viewAccount(this.daoId),
      this.#view<string>('get_locked_storage_amount'),
      this.#view<string>('get_available_amount'),
    ]);
    return { total: account.amount, storageLocked: BigInt(storage), available: BigInt(available) };
  }

  /** Number of proposals ever added (= the id the next proposal will get). */
  getLastProposalId(): Promise<number> {
    return this.#view<number>('get_last_proposal_id');
  }

  getProposal(id: number): Promise<SputnikProposal> {
    return this.#view<SputnikProposal>('get_proposal', { id });
  }

  getProposals(fromIndex: number, limit: number): Promise<SputnikProposal[]> {
    return this.#view<SputnikProposal[]>('get_proposals', { from_index: fromIndex, limit });
  }

  /** Recognise Perde payments using this client's contract id and live announce fee. */
  async describe(proposal: SputnikProposal | SputnikProposalInput): Promise<ProposalSummary> {
    const perde = this.perde;
    if (perde?.contractId === undefined) return describeProposal(proposal);
    const config = await perde.getConfig();
    return describeProposal(proposal, { contractId: perde.contractId, announceFee: config.announceFee });
  }

  /** `add_proposal` with exactly the policy's bond attached (the contract rejects any other amount). */
  async addProposal(signer: Signer, proposerId: string, proposal: SputnikProposalInput, bondYocto?: bigint): Promise<AddProposalResult> {
    const bond = bondYocto ?? BigInt((await this.getPolicy()).proposal_bond);
    const outcome = await this.#send(signer, proposerId, [functionCall('add_proposal', { proposal }, ADD_PROPOSAL_GAS, bond)]);
    const id = parseJsonValue(outcome);
    if (typeof id !== 'number') throw new PerdeError('DAO_ERROR', `add_proposal returned no proposal id (tx ${outcome.hash})`, { outcome });
    // Read-your-write: RPC nodes behind a load balancer can lag a block; wait (bounded) until the proposal is readable.
    try {
      await this.waitForProposal(id);
    } catch (e) {
      if (!isPerdeError(e, 'RPC_ERROR')) throw e; // the proposal exists on-chain (tx succeeded); later reads poll again
    }
    return { proposalId: id, txHash: outcome.hash, explorerUrl: this.txUrl(outcome.hash), bondYocto: bond, outcome };
  }

  /**
   * Derive a one-time stealth account for the recipient client-side and
   * propose that the DAO pays it through Perde. The proposal (public) holds
   * only stealth_account / ephemeral_pk / view_tag and the deposit.
   */
  async proposeStealthPayment(signer: Signer, proposerId: string, request: StealthPaymentRequest): Promise<StealthPaymentProposal> {
    const perde = this.#perde();
    const amount = toYocto(request.amountYocto);
    const recipient = request.recipient.trim();
    const description = request.description ?? DEFAULT_PAYMENT_DESCRIPTION;
    const [meta, config, policy] = await Promise.all([perde.resolveRecipient(recipient), perde.getConfig(), this.getPolicy()]);
    const lowered = description.toLowerCase();
    if (lowered.includes(recipient.toLowerCase()) || lowered.includes(meta.toLowerCase())) {
      throw new PerdeError('DAO_ERROR', 'the proposal description names the recipient; it is public forever, so leave the recipient out');
    }
    if (amount < config.minAmount) throw new PerdeError('INVALID_AMOUNT', `amount is below the Perde minimum of ${config.minAmount} yocto`);
    const deposit = amount + config.announceFee;
    if (request.checkTreasury ?? true) {
      const { available } = await this.getBalance();
      if (available < deposit + PROPOSAL_STORAGE_MARGIN) {
        throw new PerdeError('INSUFFICIENT_BALANCE', `DAO treasury has ${available} yocto available, the payment needs ${deposit} (+ storage margin)`, { available, deposit });
      }
    }
    const stealth = deriveStealth(meta);
    const proposal = buildStealthPaymentProposal({
      contractId: perde.contractId as string,
      announceFee: config.announceFee,
      description,
      payments: { stealthAccountId: stealth.stealthAccountId, ephemeralPk: stealth.ephemeralPk, viewTag: stealth.viewTag, amountYocto: amount },
    });
    const added = await this.addProposal(signer, proposerId, proposal, BigInt(policy.proposal_bond));
    return {
      ...added,
      stealthAccountId: stealth.stealthAccountId,
      ephemeralPk: stealth.ephemeralPk,
      viewTag: stealth.viewTag,
      amountYocto: amount,
      depositYocto: deposit,
      receipt: createReceipt({ meta, r: stealth.r, stealthAccountId: stealth.stealthAccountId }),
      proposal,
    };
  }

  /**
   * `act_proposal({id, action, proposal, memo})`. The current kind is read
   * first and sent as `proposal`: newer Sputnik versions require it
   * (front-running guard, `ERR_WRONG_KIND`), the version on the testnet
   * factory ignores it. If this vote reaches the threshold the proposal
   * executes in the same transaction.
   */
  async vote(signer: Signer, voterId: string, proposalId: number, choice: VoteChoice, options: VoteOptions = {}): Promise<VoteResult> {
    return this.#act(signer, voterId, proposalId, VOTE_ACTION[choice], options);
  }

  /** `Finalize`: re-executes a Failed proposal that is still approved, or returns the bond of an expired one. */
  async finalize(signer: Signer, accountId: string, proposalId: number, options: VoteOptions = {}): Promise<VoteResult> {
    return this.#act(signer, accountId, proposalId, 'Finalize', options);
  }

  async #act(signer: Signer, accountId: string, proposalId: number, action: SputnikAction, options: VoteOptions): Promise<VoteResult> {
    // The proposal may have been added a moment ago on a node this read does not hit yet.
    const current = await this.waitForProposal(proposalId, undefined, { timeoutMs: options.readTimeoutMs ?? DEFAULT_READ_TIMEOUT_MS });
    const args = { id: proposalId, action, proposal: current.kind, ...(options.memo !== undefined ? { memo: options.memo } : {}) };
    const outcome = await this.#send(signer, accountId, [functionCall('act_proposal', args, options.gas ?? actProposalGas(current.kind), 0n)]);

    // What happened inside the transaction comes from the outcome itself (authoritative, no view lag).
    const receipts = outcome.raw.receipts_outcome;
    const isFailure = (s: unknown): boolean => typeof s === 'object' && s !== null && 'Failure' in s;
    const failedReceipts = receipts
      .filter((r) => r.outcome.executor_id !== this.daoId && isFailure(r.outcome.status))
      .map((r) => ({ executorId: r.outcome.executor_id, failure: (r.outcome.status as { Failure: unknown }).Failure }));
    const receiver = isFunctionCallKind(current.kind) ? current.kind.FunctionCall.receiver_id : undefined;
    const receiverReceipts = receiver === undefined || receiver === this.daoId ? [] : receipts.filter((r) => r.outcome.executor_id === receiver);

    // The proposal's new state, read back with bounded polling until it reflects this action.
    let status: SputnikProposalStatus | undefined;
    try {
      const after = await pollUntil(
        async () => {
          try {
            return await this.getProposal(proposalId);
          } catch (e) {
            if (e instanceof RpcError && e.message.includes('ERR_NO_PROPOSAL')) return null; // VoteRemove deletes the proposal
            throw e;
          }
        },
        (p) => (p === null ? action === 'VoteRemove' : action === 'Finalize' ? p.status !== current.status : p.votes[accountId] !== undefined),
        { timeoutMs: options.readTimeoutMs ?? DEFAULT_READ_TIMEOUT_MS, what: `proposal ${proposalId} to reflect ${action}` },
      );
      status = after === null ? 'Removed' : after.status;
    } catch (e) {
      if (!isPerdeError(e, 'RPC_ERROR')) throw e;
      status = undefined; // state not readable in time; `executed` below does not depend on it for FunctionCalls
    }
    const executed =
      receiverReceipts.length > 0
        ? failedReceipts.length === 0 && receiverReceipts.every((r) => !isFailure(r.outcome.status))
        : status === 'Approved' && current.status !== 'Approved' && failedReceipts.length === 0;
    return { txHash: outcome.hash, explorerUrl: this.txUrl(outcome.hash), action, status, executed, failedReceipts, outcome };
  }

  /**
   * Read a proposal, retrying while the RPC node has not seen it yet
   * (`ERR_NO_PROPOSAL` right after `add_proposal`) and until `ok` holds.
   */
  waitForProposal(proposalId: number, ok: (p: SputnikProposal) => boolean = () => true, options: PollOptions = {}): Promise<SputnikProposal> {
    return pollUntil(() => this.getProposal(proposalId), ok, { timeoutMs: DEFAULT_READ_TIMEOUT_MS, what: `proposal ${proposalId}`, ...options });
  }

  #send(signer: Signer, signerId: string, actions: Parameters<typeof sendActions>[0]['actions']): Promise<TxOutcome> {
    return sendActions({ rpc: this.rpc, signer, signerId, receiverId: this.daoId, actions, waitUntil: this.waitUntil });
  }
}
