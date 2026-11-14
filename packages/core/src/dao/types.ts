/**
 * JSON shapes of the SputnikDAO v2 contract (`sputnikdao2`) as deployed by the
 * testnet factory `sputnikv2.testnet` (default code hash
 * AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH, factory metadata version [3,31],
 * commit 7764926, `version()` = "2.3.1"). u128 values are decimal strings,
 * u64 values (gas, timestamps, periods) are decimal strings, ids are numbers.
 */

export type SputnikRoleKind = 'Everyone' | { readonly Member: string } | { readonly Group: readonly string[] };

export type SputnikWeightOrRatio = string | readonly [number, number];

export interface SputnikVotePolicy {
  readonly weight_kind: 'RoleWeight' | 'TokenWeight';
  readonly quorum: string;
  readonly threshold: SputnikWeightOrRatio;
}

export interface SputnikRole {
  readonly name: string;
  readonly kind: SputnikRoleKind;
  /** `<proposal kind label>:<action>`, e.g. `call:AddProposal`, `*:VoteApprove`. */
  readonly permissions: readonly string[];
  readonly vote_policy: Readonly<Record<string, SputnikVotePolicy>>;
}

export interface SputnikPolicy {
  readonly roles: readonly SputnikRole[];
  readonly default_vote_policy: SputnikVotePolicy;
  readonly proposal_bond: string;
  /** Nanoseconds. */
  readonly proposal_period: string;
  readonly bounty_bond: string;
  readonly bounty_forgiveness_period: string;
}

export interface SputnikConfig {
  readonly name: string;
  readonly purpose: string;
  /** Base64 metadata (may be empty). */
  readonly metadata: string;
}

/** One FunctionCall action inside a proposal. `args` is base64 of the JSON args. */
export interface SputnikActionCall {
  readonly method_name: string;
  readonly args: string;
  readonly deposit: string;
  readonly gas: string;
}

export interface SputnikFunctionCallKind {
  readonly FunctionCall: { readonly receiver_id: string; readonly actions: readonly SputnikActionCall[] };
}

/**
 * Proposal kinds are externally tagged serde enums (`{"FunctionCall": {...}}`,
 * `{"Transfer": {...}}`, or the bare string `"Vote"`). Only FunctionCall is
 * modelled in detail; other kinds are passed through untouched.
 */
export type SputnikProposalKind = SputnikFunctionCallKind | Readonly<Record<string, unknown>> | string;

export type SputnikProposalStatus = 'InProgress' | 'Approved' | 'Rejected' | 'Removed' | 'Expired' | 'Moved' | 'Failed';

export type SputnikVote = 'Approve' | 'Reject' | 'Remove';

export type SputnikAction = 'AddProposal' | 'RemoveProposal' | 'VoteApprove' | 'VoteReject' | 'VoteRemove' | 'Finalize' | 'MoveToHub';

/** `add_proposal({proposal: ProposalInput})`. */
export interface SputnikProposalInput {
  readonly description: string;
  readonly kind: SputnikProposalKind;
}

/** `get_proposal` / `get_proposals` output (`ProposalOutput`, the proposal is flattened next to `id`). */
export interface SputnikProposal {
  readonly id: number;
  readonly proposer: string;
  readonly description: string;
  readonly kind: SputnikProposalKind;
  readonly status: SputnikProposalStatus;
  /** Per role: [approve, reject, remove] weights. */
  readonly vote_counts: Readonly<Record<string, readonly number[]>>;
  readonly votes: Readonly<Record<string, SputnikVote>>;
  /** Nanoseconds. */
  readonly submission_time: string;
}
