import { base64 } from '@scure/base';
import { PerdeError } from '../errors.js';
import { utf8ToBytes } from '../crypto/primitives.js';
import { assertAccountId, isImplicitAccountId } from '../near/accountId.js';
import { tgas } from '../near/units.js';
import type {
  SputnikActionCall,
  SputnikConfig,
  SputnikFunctionCallKind,
  SputnikPolicy,
  SputnikProposal,
  SputnikProposalInput,
  SputnikProposalKind,
  SputnikProposalStatus,
} from './types.js';

/** SputnikDAO v2 factories. DAO accounts are `<name>.<factory>`. */
export const SPUTNIK_FACTORY = { testnet: 'sputnikv2.testnet', mainnet: 'sputnik-dao.near' } as const;

/**
 * Default description of a Perde payment proposal. It deliberately says
 * nothing about the recipient: the on-chain args only carry the one-time
 * stealth account, the ephemeral key and the view tag.
 */
export const DEFAULT_PAYMENT_DESCRIPTION = 'Private payment via Perde (stealth address; recipient intentionally not disclosed)';

/** Gas for one `send` action when the proposal holds a single payment (contract README: 30 Tgas). */
export const DAO_SEND_GAS = tgas(30);
/** Gas per `send` action when one proposal pays several recipients. */
export const DAO_BATCH_SEND_GAS = tgas(15);
/**
 * Upper bound for the summed action gas of one proposal: `act_proposal` must
 * also pay for itself and the `on_proposal_callback` (10 Tgas) within the
 * 300 Tgas transaction limit.
 */
export const MAX_PROPOSAL_ACTION_GAS = tgas(240);

export interface StealthPaymentLeg {
  readonly stealthAccountId: string;
  readonly ephemeralPk: string;
  readonly viewTag: number;
  /** What the stealth account receives (the announce fee is added to the deposit). */
  readonly amountYocto: bigint;
}

export interface BuildStealthPaymentParams {
  /** Perde contract, e.g. `perde-pay.testnet`. */
  readonly contractId: string;
  /** `get_config().announce_fee` of the Perde contract. */
  readonly announceFee: bigint;
  /** One payment or several (one `send` action each, executed in one receipt). */
  readonly payments: StealthPaymentLeg | readonly StealthPaymentLeg[];
  readonly description?: string;
  /** Gas per `send` action. Default 30 Tgas for one payment, 15 Tgas each for several. */
  readonly gasPerSend?: bigint;
}

const HEX64 = /^[0-9a-f]{64}$/u;

function encodeArgs(args: object): string {
  return base64.encode(utf8ToBytes(JSON.stringify(args)));
}

/**
 * Pure: the `add_proposal` input that makes the DAO call
 * `<contractId>.send({stealth_account, ephemeral_pk, view_tag})` with
 * deposit = amount + announce_fee for every payment.
 */
export function buildStealthPaymentProposal(params: BuildStealthPaymentParams): SputnikProposalInput {
  assertAccountId(params.contractId, 'Perde contract id');
  const legs: readonly StealthPaymentLeg[] = Array.isArray(params.payments) ? params.payments : [params.payments as StealthPaymentLeg];
  if (legs.length === 0) throw new PerdeError('INVALID_AMOUNT', 'a payment proposal needs at least one payment');
  if (params.announceFee < 0n) throw new PerdeError('INVALID_AMOUNT', 'announce fee cannot be negative');
  const gas = params.gasPerSend ?? (legs.length === 1 ? DAO_SEND_GAS : DAO_BATCH_SEND_GAS);
  if (gas <= 0n) throw new PerdeError('INVALID_AMOUNT', 'gasPerSend must be positive');
  if (gas * BigInt(legs.length) > MAX_PROPOSAL_ACTION_GAS) {
    throw new PerdeError('INVALID_AMOUNT', `${legs.length} sends × ${gas} gas exceed the ${MAX_PROPOSAL_ACTION_GAS} gas a proposal can attach; split the payment`);
  }
  const actions: SputnikActionCall[] = legs.map((leg) => {
    if (!isImplicitAccountId(leg.stealthAccountId)) throw new PerdeError('INVALID_ACCOUNT_ID', `stealth account must be 64 lowercase hex: ${leg.stealthAccountId}`);
    if (!HEX64.test(leg.ephemeralPk)) throw new PerdeError('INVALID_POINT', 'ephemeral key must be 64 lowercase hex');
    if (!Number.isInteger(leg.viewTag) || leg.viewTag < 0 || leg.viewTag > 255) throw new PerdeError('INVALID_ENCODING', 'view tag must be 0..255');
    if (leg.amountYocto <= 0n) throw new PerdeError('INVALID_AMOUNT', 'payment amount must be positive');
    return {
      method_name: 'send',
      args: encodeArgs({ stealth_account: leg.stealthAccountId, ephemeral_pk: leg.ephemeralPk, view_tag: leg.viewTag }),
      deposit: (leg.amountYocto + params.announceFee).toString(),
      gas: gas.toString(),
    };
  });
  return {
    description: params.description ?? DEFAULT_PAYMENT_DESCRIPTION,
    kind: { FunctionCall: { receiver_id: params.contractId, actions } },
  };
}

export interface DecodedStealthPayment {
  readonly stealthAccountId: string;
  readonly ephemeralPk: string;
  readonly viewTag: number;
  /** Attached deposit of the `send` action (amount + announce fee). */
  readonly depositYocto: bigint;
  /** Deposit minus the announce fee, when the fee is known. */
  readonly amountYocto: bigint | undefined;
  readonly gas: bigint;
}

interface ProposalSummaryBase {
  readonly id: number | undefined;
  readonly proposer: string | undefined;
  readonly description: string;
  readonly status: SputnikProposalStatus | undefined;
  /** Sum of approve / reject weights over all roles. */
  readonly approvals: number;
  readonly rejections: number;
}

export interface PerdePaymentSummary extends ProposalSummaryBase {
  readonly type: 'perde-payment';
  readonly contractId: string;
  readonly payments: readonly DecodedStealthPayment[];
  readonly totalDepositYocto: bigint;
  /** Sum of amounts when the announce fee is known. */
  readonly totalAmountYocto: bigint | undefined;
}

export interface OtherProposalSummary extends ProposalSummaryBase {
  readonly type: 'other';
  /** Policy label of the kind (`call`, `transfer`, `vote`, `policy`, ...). */
  readonly kindLabel: string;
}

export type ProposalSummary = PerdePaymentSummary | OtherProposalSummary;

export interface DescribeOptions {
  /** Only FunctionCalls to this contract count as Perde payments. Default: any receiver with `send` actions of the right shape. */
  readonly contractId?: string;
  readonly announceFee?: bigint;
}

const KIND_LABELS: Readonly<Record<string, string>> = {
  ChangeConfig: 'config',
  ChangePolicy: 'policy',
  AddMemberToRole: 'add_member_to_role',
  RemoveMemberFromRole: 'remove_member_from_role',
  FunctionCall: 'call',
  UpgradeSelf: 'upgrade_self',
  UpgradeRemote: 'upgrade_remote',
  Transfer: 'transfer',
  SetStakingContract: 'set_vote_token',
  AddBounty: 'add_bounty',
  BountyDone: 'bounty_done',
  Vote: 'vote',
  FactoryInfoUpdate: 'factory_info_update',
  ChangePolicyAddOrUpdateRole: 'policy_add_or_update_role',
  ChangePolicyRemoveRole: 'policy_remove_role',
  ChangePolicyUpdateDefaultVotePolicy: 'policy_update_default_vote_policy',
  ChangePolicyUpdateParameters: 'policy_update_parameters',
};

/** Policy label used in permissions (`<label>:<Action>`) for a proposal kind. */
export function proposalKindLabel(kind: SputnikProposalKind): string {
  const tag = typeof kind === 'string' ? kind : (Object.keys(kind)[0] ?? '');
  return KIND_LABELS[tag] ?? tag;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isFunctionCallKind(kind: SputnikProposalKind): kind is SputnikFunctionCallKind {
  if (!isRecord(kind)) return false;
  const fc = kind.FunctionCall;
  return isRecord(fc) && typeof fc.receiver_id === 'string' && Array.isArray(fc.actions);
}

function decodeSendAction(action: unknown, announceFee: bigint | undefined): DecodedStealthPayment | null {
  if (!isRecord(action) || action.method_name !== 'send' || typeof action.args !== 'string') return null;
  let args: unknown;
  try {
    args = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(base64.decode(action.args)));
  } catch {
    return null;
  }
  if (!isRecord(args)) return null;
  const { stealth_account: stealth, ephemeral_pk: eph, view_tag: tag } = args;
  if (typeof stealth !== 'string' || !isImplicitAccountId(stealth)) return null;
  if (typeof eph !== 'string' || !HEX64.test(eph)) return null;
  if (typeof tag !== 'number' || !Number.isInteger(tag) || tag < 0 || tag > 255) return null;
  let deposit: bigint;
  let gas: bigint;
  try {
    deposit = BigInt(String(action.deposit));
    gas = BigInt(String(action.gas));
  } catch {
    return null;
  }
  const amount = announceFee === undefined ? undefined : deposit - announceFee;
  return { stealthAccountId: stealth, ephemeralPk: eph, viewTag: tag, depositYocto: deposit, amountYocto: amount, gas };
}

function tally(p: Partial<SputnikProposal>): { approvals: number; rejections: number } {
  let approvals = 0;
  let rejections = 0;
  for (const counts of Object.values(p.vote_counts ?? {})) {
    approvals += counts[0] ?? 0;
    rejections += counts[1] ?? 0;
  }
  return { approvals, rejections };
}

/**
 * Recognise a Perde payment proposal (a FunctionCall whose actions are all
 * well-formed `send` calls) and extract what it pays. Anything else is
 * reported as `type: "other"` with its policy label. Never throws on
 * malformed input.
 */
export function describeProposal(proposal: SputnikProposal | SputnikProposalInput, options: DescribeOptions = {}): ProposalSummary {
  const p = proposal as Partial<SputnikProposal> & SputnikProposalInput;
  const base: ProposalSummaryBase = {
    id: typeof p.id === 'number' ? p.id : undefined,
    proposer: typeof p.proposer === 'string' ? p.proposer : undefined,
    description: typeof p.description === 'string' ? p.description : '',
    status: p.status,
    ...tally(p),
  };
  const other = (): OtherProposalSummary => ({ ...base, type: 'other', kindLabel: proposalKindLabel(p.kind) });
  if (!isFunctionCallKind(p.kind)) return other();
  const { receiver_id: receiver, actions } = p.kind.FunctionCall;
  if (options.contractId !== undefined && receiver !== options.contractId) return other();
  if (actions.length === 0) return other();
  const payments: DecodedStealthPayment[] = [];
  for (const a of actions) {
    const d = decodeSendAction(a, options.announceFee);
    if (d === null) return other();
    payments.push(d);
  }
  const totalDepositYocto = payments.reduce((s, x) => s + x.depositYocto, 0n);
  const totalAmountYocto = options.announceFee === undefined ? undefined : payments.reduce((s, x) => s + (x.amountYocto ?? 0n), 0n);
  return { ...base, type: 'perde-payment', contractId: receiver, payments, totalDepositYocto, totalAmountYocto };
}

export interface OpenDemoPolicyParams {
  /** Exact bond `add_proposal` requires (yocto). */
  readonly proposalBondYocto: bigint;
  /** Proposal lifetime in nanoseconds. */
  readonly proposalPeriodNs: bigint;
  /** Accounts that keep full control (`*:*`), e.g. the DAO's creator. */
  readonly council?: readonly string[];
  /** Proposal kinds the public may propose and vote on. Default `["call"]` (FunctionCall only). */
  readonly openKinds?: readonly string[];
}

/**
 * Policy for an OPEN demo DAO where any account can propose and approve.
 *
 * SputnikDAO ignores `Everyone` roles when it counts votes (`proposal_status`
 * skips them because they have no size), so a public role that can actually
 * approve is modelled as `Member("0")`: every account has delegation weight
 * ≥ 0, total weight is 0, and with `quorum: "1"` a single approve vote passes
 * while a single reject vote rejects. The public is limited to `openKinds`
 * (default FunctionCall), so nobody can change the policy, upgrade the code or
 * use plain Transfers; the council keeps `*:*`.
 */
export function openDemoPolicy(params: OpenDemoPolicyParams): SputnikPolicy {
  if (params.proposalBondYocto < 0n) throw new PerdeError('INVALID_AMOUNT', 'proposal bond cannot be negative');
  if (params.proposalPeriodNs <= 0n) throw new PerdeError('INVALID_AMOUNT', 'proposal period must be positive');
  const council = [...new Set(params.council ?? [])];
  for (const c of council) assertAccountId(c, 'council member');
  const kinds = params.openKinds ?? ['call'];
  if (kinds.length === 0) throw new PerdeError('DAO_ERROR', 'openKinds must not be empty');
  const roles = [
    { name: 'all', kind: 'Everyone' as const, permissions: kinds.map((k) => `${k}:AddProposal`), vote_policy: {} },
    {
      name: 'open-voters',
      kind: { Member: '0' },
      permissions: kinds.flatMap((k) => [`${k}:VoteApprove`, `${k}:VoteReject`, `${k}:Finalize`]),
      vote_policy: {},
    },
    ...(council.length > 0 ? [{ name: 'council', kind: { Group: council }, permissions: ['*:*'], vote_policy: {} }] : []),
  ];
  return {
    roles,
    default_vote_policy: { weight_kind: 'RoleWeight', quorum: '1', threshold: [1, 2] },
    proposal_bond: params.proposalBondYocto.toString(),
    proposal_period: params.proposalPeriodNs.toString(),
    bounty_bond: params.proposalBondYocto.toString(),
    bounty_forgiveness_period: params.proposalPeriodNs.toString(),
  };
}

/** Base64 `args` for `<factory>.create({name, args})` (the DAO's `new({config, policy})`). */
export function encodeDaoCreateArgs(config: SputnikConfig, policy: SputnikPolicy): string {
  return encodeArgs({ config, policy });
}
