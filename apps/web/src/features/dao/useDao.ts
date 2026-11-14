/**
 * DAO payout: a SputnikDAO FunctionCall proposal that calls Perde `send` for a
 * stealth account derived client-side. Approval executes it; the recipient
 * then finds the payment with their view key like any other.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { describeProposal, type ProposalSummary, type SputnikProposal } from '@perde/core';
import { useAppState } from '../../state/context';
import { dao, getContractConfig, perde } from '../../lib/perde';
import { errorText } from '../../lib/errors';
import { formatYocto, parseNearToYocto } from '../../lib/near-format';
import { useToast } from '../../ui/toast-context';
import { txHashOf } from '../../flows/tx';
import { classifyRecipientInput } from '../send/logic';

/** Keeps the shared demo treasury usable for everyone. */
export const DAO_PAYOUT_CAP_YOCTO = 5n * 10n ** 23n; // 0.5 NEAR
export const DAO_DEFAULT_AMOUNT = '0.02';

export interface ProposalView {
  id: number;
  proposer: string;
  description: string;
  status: SputnikProposal['status'];
  /** InProgress past the voting period: can only be finalized (returns the bond). */
  expired: boolean;
  submittedAtMs: number;
  approvals: number;
  summary: ProposalSummary;
  receiverId: string | null;
}

export interface DaoInfo {
  availableYocto: bigint;
  totalYocto: bigint;
  bondYocto: bigint;
  periodMs: number;
  announceFeeYocto: bigint;
  minAmountYocto: bigint;
  proposalCount: number;
}

export type DaoAction =
  | { kind: 'idle' }
  | { kind: 'proposing' }
  | { kind: 'voting'; id: number; action: 'approve' | 'finalize' }
  | { kind: 'error'; message: string; txHash: string | null };

export interface LastRun {
  proposalId: number;
  proposeTx: string;
  stealthAccount: string;
  amountYocto: string;
  receipt: string;
  vote: { txHash: string; executed: boolean; status: string | undefined; failure: string | null } | null;
}

function toView(p: SputnikProposal, periodMs: number, announceFee: bigint): ProposalView {
  const submittedAtMs = Number(BigInt(p.submission_time) / 1_000_000n);
  const summary = describeProposal(p, { contractId: perde.contractId, announceFee });
  const kind = p.kind;
  const receiverId = typeof kind === 'object' && kind !== null && 'FunctionCall' in kind ? String((kind as { FunctionCall: { receiver_id: string } }).FunctionCall.receiver_id) : null;
  return {
    id: p.id,
    proposer: p.proposer,
    description: p.description,
    status: p.status,
    expired: p.status === 'InProgress' && Date.now() > submittedAtMs + periodMs,
    submittedAtMs,
    approvals: summary.approvals,
    summary,
    receiverId,
  };
}

export function useDao() {
  const { wallet, signer, identity, balance, refreshBalance, dispatch } = useAppState();
  const toast = useToast();
  const [info, setInfo] = useState<{ status: 'loading' } | { status: 'ready'; info: DaoInfo } | { status: 'error'; message: string }>({ status: 'loading' });
  const [proposals, setProposals] = useState<ProposalView[] | null>(null);
  const [tick, setTick] = useState(0);
  const [recipientInput, setRecipientInput] = useState('');
  const [recipientTouched, setRecipientTouched] = useState(false);
  const [amountInput, setAmountInput] = useState(DAO_DEFAULT_AMOUNT);
  const [action, setAction] = useState<DaoAction>({ kind: 'idle' });
  const [last, setLast] = useState<LastRun | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const [bal, policy, count, config] = await Promise.all([dao.getBalance(), dao.getPolicy(), dao.getLastProposalId(), getContractConfig()]);
      const periodMs = Number(BigInt(policy.proposal_period) / 1_000_000n);
      const from = Math.max(0, count - 10);
      const list = count > 0 ? await dao.getProposals(from, 10) : [];
      if (!live) return;
      setInfo({
        status: 'ready',
        info: {
          availableYocto: bal.available,
          totalYocto: bal.total,
          bondYocto: BigInt(policy.proposal_bond),
          periodMs,
          announceFeeYocto: config.announceFee,
          minAmountYocto: config.minAmount,
          proposalCount: count,
        },
      });
      setProposals(list.map((p) => toView(p, periodMs, config.announceFee)).sort((a, b) => b.id - a.id));
    })().catch((e: unknown) => live && setInfo({ status: 'error', message: errorText(e) }));
    return () => {
      live = false;
    };
  }, [tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Default recipient: your own meta-address, so a visitor can try it end to end.
  const recipient = recipientTouched ? recipientInput : recipientInput || identity?.metaAddress || '';
  const classified = classifyRecipientInput(recipient);
  const recipientError = classified.kind === 'invalid' ? classified.message : null;

  const d = info.status === 'ready' ? info.info : null;
  const parsed = parseNearToYocto(amountInput);
  let amountError: string | null = null;
  let amountYocto: bigint | null = null;
  if (amountInput.trim()) {
    if (!parsed.ok) amountError = parsed.error;
    else {
      amountYocto = BigInt(parsed.yocto);
      if (amountYocto === 0n) amountError = 'Amount must be more than 0';
      else if (d && amountYocto < d.minAmountYocto) amountError = `The minimum is ${formatYocto(d.minAmountYocto)} NEAR`;
      else if (amountYocto > DAO_PAYOUT_CAP_YOCTO) amountError = `This shared demo treasury caps payouts at ${formatYocto(DAO_PAYOUT_CAP_YOCTO)} NEAR`;
      else if (d && amountYocto + d.announceFeeYocto > d.availableYocto) amountError = `The treasury has ${formatYocto(d.availableYocto)} NEAR available`;
    }
  }
  const spendable = balance.status === 'ready' ? BigInt(balance.spendableYocto) : null;
  const bondProblem = d && spendable !== null && spendable < d.bondYocto ? `Proposing locks a ${formatYocto(d.bondYocto)} NEAR bond from your wallet (returned when the proposal is approved); the wallet has ${formatYocto(spendable)} NEAR.` : null;
  const canPropose = !!wallet && !!signer && !!d && classified.kind !== 'invalid' && classified.kind !== 'empty' && amountYocto !== null && !amountError && !bondProblem && action.kind !== 'proposing';

  const propose = useCallback(async () => {
    if (!wallet || !signer || amountYocto === null) return;
    setAction({ kind: 'proposing' });
    try {
      const p = await dao.proposeStealthPayment(signer, wallet.accountId, { recipient: recipient.trim(), amountYocto });
      setLast({ proposalId: p.proposalId, proposeTx: p.txHash, stealthAccount: p.stealthAccountId, amountYocto: p.amountYocto.toString(), receipt: p.receipt, vote: null });
      setAction({ kind: 'idle' });
      refreshBalance();
      refresh();
      toast.show({ tone: 'success', title: `Proposal #${p.proposalId} created`, description: 'Now approve it to execute the payout.' });
    } catch (e) {
      setAction({ kind: 'error', message: errorText(e, 'send'), txHash: txHashOf(e) });
    }
  }, [wallet, signer, amountYocto, recipient, refreshBalance, refresh, toast]);

  const act = useCallback(
    async (id: number, kind: 'approve' | 'finalize') => {
      if (!wallet || !signer) return;
      setAction({ kind: 'voting', id, action: kind });
      try {
        const r = kind === 'approve' ? await dao.vote(signer, wallet.accountId, id, 'approve') : await dao.finalize(signer, wallet.accountId, id);
        const failure = r.failedReceipts.length > 0 ? JSON.stringify(r.failedReceipts[0]?.failure).slice(0, 240) : null;
        setLast((l) => (l && l.proposalId === id ? { ...l, vote: { txHash: r.txHash, executed: r.executed, status: r.status, failure } } : l));
        setAction({ kind: 'idle' });
        refreshBalance();
        refresh();
        if (r.executed && kind === 'approve') dispatch({ type: 'demo/update', patch: { daoPaid: true } });
        if (r.executed) toast.show({ tone: 'success', title: `Proposal #${id} executed`, description: 'The DAO paid a fresh stealth account.' });
        else toast.show({ tone: 'danger', title: `Proposal #${id}: ${r.status ?? 'not executed'}`, description: 'See the proposal card for details.' });
      } catch (e) {
        setAction({ kind: 'error', message: errorText(e, 'send'), txHash: txHashOf(e) });
      }
    },
    [wallet, signer, refreshBalance, refresh, toast, dispatch],
  );

  const current = useMemo(() => (last ? (proposals?.find((p) => p.id === last.proposalId) ?? null) : null), [last, proposals]);

  return {
    daoId: dao.daoId,
    daoUrl: dao.accountUrl(),
    info,
    proposals,
    refresh,
    hasWallet: !!wallet,
    walletId: wallet?.accountId ?? null,
    selfMetaAddress: identity?.metaAddress ?? null,
    recipient,
    setRecipient(v: string) {
      setRecipientTouched(true);
      setRecipientInput(v);
    },
    recipientError,
    amountInput,
    setAmountInput,
    amountError,
    bondProblem,
    canPropose,
    propose: () => void propose(),
    approve: (id: number) => void act(id, 'approve'),
    finalize: (id: number) => void act(id, 'finalize'),
    action,
    dismissError: () => setAction({ kind: 'idle' }),
    last,
    current,
  };
}

export type DaoModel = ReturnType<typeof useDao>;
