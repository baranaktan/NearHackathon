import { DEFAULT_PAYMENT_DESCRIPTION } from '@perde/core';
import { ArrowRight, CheckCheck, CircleCheck, Landmark, RefreshCw, UserRound, XCircle } from 'lucide-react';
import { PageHeader } from '../../app-shell/PageHeader';
import { Card, CardHeader, DataRow } from '../../ui/Card';
import { Button, ButtonLink } from '../../ui/Button';
import { Badge, type BadgeTone } from '../../ui/Badge';
import { Field, Input } from '../../ui/Field';
import { AmountInput } from '../../ui/AmountInput';
import { AddressChip } from '../../ui/AddressChip';
import { Callout, EmptyState, Skeleton } from '../../ui/Feedback';
import { TxLink } from '../../ui/TxLink';
import { Amount } from '../../components/Amount';
import { ElapsedNote } from '../../components/ElapsedNote';
import { APP_CONFIG } from '../../config';
import { formatDateTime } from '../../lib/format-date';
import { formatYocto, truncateMiddle } from '../../lib/near-format';
import { useDao, type DaoModel, type ProposalView } from './useDao';

const STATUS_TONE: Record<string, BadgeTone> = { InProgress: 'warn', Approved: 'success', Rejected: 'danger', Removed: 'neutral', Expired: 'neutral', Failed: 'danger', Moved: 'neutral' };

function StatusBadge({ p }: { p: ProposalView }) {
  if (p.expired) return <Badge>Expired · finalize</Badge>;
  const label = p.status === 'InProgress' ? 'Waiting for approval' : p.status === 'Approved' ? 'Approved · executed' : p.status;
  return (
    <Badge tone={STATUS_TONE[p.status] ?? 'neutral'} dot pulse={p.status === 'InProgress'}>
      {label}
    </Badge>
  );
}

export default function DaoPage() {
  const m = useDao();
  return (
    <>
      <PageHeader
        eyebrow="DAO payout"
        title="Pay a contributor from a DAO treasury"
        description="Without naming them on-chain. The DAO votes on a payment to a fresh stealth account; the proposal never contains the recipient."
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw aria-hidden className="size-4" />} onClick={m.refresh}>
            Refresh
          </Button>
        }
      />
      <div className="space-y-5">
        <TreasuryCard m={m} />
        <Callout tone="warn" title="Open demo DAO">
          Anyone can propose and approve here — real DAOs keep their own council policy. Amounts stay public; only the recipient is hidden. One approve vote executes
          a proposal.
        </Callout>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ProposeCard m={m} />
          <CurrentCard m={m} />
        </div>
        <RecentCard m={m} />
      </div>
    </>
  );
}

function TreasuryCard({ m }: { m: DaoModel }) {
  const i = m.info;
  return (
    <Card className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-brass-text">
          <Landmark aria-hidden className="size-3.5" />
          SputnikDAO v2 · testnet
        </p>
        <div className="mt-3">
          <AddressChip value={m.daoId} explorer label="DAO" />
        </div>
      </div>
      <div className="min-w-0 sm:text-right">
        <p className="text-[12px] text-fg-muted">Treasury available</p>
        {i.status === 'ready' ? (
          <>
            <Amount yocto={i.info.availableYocto.toString()} size="xl" className="mt-1" />
            <p className="mt-1 text-[12px] text-fg-faint">
              {i.info.proposalCount} proposals so far · bond {formatYocto(i.info.bondYocto)} NEAR
            </p>
          </>
        ) : i.status === 'loading' ? (
          <Skeleton className="mt-2 h-10 w-44 sm:ml-auto" />
        ) : (
          <p className="mt-1 text-[13px] text-danger" role="alert">
            {i.message}{' '}
            <button type="button" onClick={m.refresh} className="underline underline-offset-4">
              Retry
            </button>
          </p>
        )}
      </div>
    </Card>
  );
}

function ProposeCard({ m }: { m: DaoModel }) {
  const isSelf = !!m.selfMetaAddress && m.recipient === m.selfMetaAddress;
  return (
    <Card>
      <CardHeader title="1 · Propose a payout" description="Your browser derives a one-time stealth account for the recipient and asks the DAO to pay it through Perde." />
      {!m.hasWallet ? (
        <Callout tone="warn" title="No account to propose from" action={<ButtonLink to="/app/settings" size="sm" variant="secondary">Get a demo wallet</ButtonLink>}>
          Proposing and voting are transactions from your demo wallet.
        </Callout>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            m.propose();
          }}
        >
          <Field
            label="Contributor"
            error={m.recipientError}
            hint={isSelf ? 'Your own meta-address — so you can find the payout in your Inbox afterwards.' : 'A perde: meta-address or a registered NEAR name.'}
            aside={
              m.selfMetaAddress && !isSelf ? (
                <button type="button" onClick={() => m.setRecipient(m.selfMetaAddress ?? '')} className="inline-flex min-h-8 items-center gap-1.5 text-[13px] text-fg-muted underline decoration-line-strong underline-offset-4 hover:text-fg">
                  <UserRound aria-hidden className="size-3.5" />
                  Use mine
                </button>
              ) : undefined
            }
          >
            {(p) => <Input {...p} mono value={m.recipient} onChange={(e) => m.setRecipient(e.target.value)} placeholder="perde:… or alice.testnet" autoComplete="off" spellCheck={false} />}
          </Field>
          <Field label="Amount" error={m.amountError} hint="Paid from the treasury, plus the 0.002 NEAR announcement fee. Capped at 0.5 NEAR on this shared demo DAO.">
            {(p) => <AmountInput {...p} value={m.amountInput} onValueChange={m.setAmountInput} />}
          </Field>
          {m.bondProblem && (
            <p className="text-[13px] text-danger" role="alert">
              {m.bondProblem}
            </p>
          )}
          {m.info.status === 'ready' && (
            <p className="text-[12.5px] text-fg-faint">
              Your wallet attaches the DAO’s {formatYocto(m.info.info.bondYocto)} NEAR proposal bond. The public description reads “{DEFAULT_PAYMENT_DESCRIPTION}” — never the recipient.
            </p>
          )}
          {m.action.kind === 'error' && (
            <Callout tone="danger" role="alert" action={<Button size="sm" variant="secondary" onClick={m.dismissError}>Dismiss</Button>}>
              {m.action.message}
              {m.action.txHash && (
                <span className="mt-2 block">
                  <TxLink hash={m.action.txHash} label="Check" />
                </span>
              )}
            </Callout>
          )}
          <div className="space-y-2">
            <Button type="submit" disabled={!m.canPropose} loading={m.action.kind === 'proposing'} loadingLabel="Proposing">
              Propose payout
            </Button>
            {m.action.kind === 'proposing' && <ElapsedNote doing="Signing, executing and reading the proposal back" typical="usually 3–6 s" />}
          </div>
        </form>
      )}
    </Card>
  );
}

function PublicProposal({ p }: { p: ProposalView }) {
  const pay = p.summary.type === 'perde-payment' ? p.summary.payments[0] : undefined;
  return (
    <dl className="divide-y divide-line border-y border-line">
      <DataRow label="Status">
        <StatusBadge p={p} />
      </DataRow>
      <DataRow label="Receiver · method">
        <span className="font-mono text-[13px]">
          {p.receiverId ?? '—'} · {p.summary.type === 'perde-payment' ? 'send' : '—'}
        </span>
      </DataRow>
      {pay && (
        <>
          <DataRow label="stealth_account">
            <AddressChip value={pay.stealthAccountId} size="sm" explorer label="Stealth account" />
          </DataRow>
          <DataRow label="Amount">{pay.amountYocto !== undefined ? <Amount yocto={pay.amountYocto.toString()} /> : <Amount yocto={pay.depositYocto.toString()} />}</DataRow>
        </>
      )}
      <DataRow label="Description">
        <span className="text-[13px] text-fg-muted">{p.description}</span>
      </DataRow>
      <DataRow label="Proposed by">
        <span className="font-mono text-[13px]">{truncateMiddle(p.proposer, 14, 10)}</span>
      </DataRow>
    </dl>
  );
}

function CurrentCard({ m }: { m: DaoModel }) {
  const last = m.last;
  const p = m.current;
  const voting = m.action.kind === 'voting' && last && m.action.id === last.proposalId;
  return (
    <Card>
      <CardHeader title="2 · Approve & execute" description="This is exactly what everyone can read in the proposal. Approving runs the Perde payment inside the vote transaction." />
      {!last && (
        <EmptyState title="No proposal yet" art={false} className="py-8">
          Propose a payout first, or approve a pending one from the list below.
        </EmptyState>
      )}
      {last && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="brass">Proposal #{last.proposalId}</Badge>
            <TxLink hash={last.proposeTx} label="Proposed in" />
          </div>
          {p ? <PublicProposal p={p} /> : <Skeleton className="h-40 w-full" />}
          {!last.vote && p && p.status === 'InProgress' && !p.expired && (
            <div className="space-y-2">
              <Button onClick={() => m.approve(last.proposalId)} loading={!!voting} loadingLabel="Approving" icon={<CheckCheck aria-hidden className="size-4" />}>
                Approve & execute
              </Button>
              {voting && <ElapsedNote doing="Voting — the payout runs inside the vote, then the result is read back" typical="usually 4–8 s" slowAfterS={15} />}
            </div>
          )}
          {last.vote && (
            <div className="rounded-lg border border-line bg-surface-2/50 p-4">
              <p className="flex items-center gap-2 text-[15px] font-medium text-fg">
                {last.vote.executed ? <CircleCheck aria-hidden className="size-4 text-success" /> : <XCircle aria-hidden className="size-4 text-danger" />}
                {last.vote.executed ? 'Executed: the DAO paid a fresh account.' : `Not executed (${last.vote.status ?? 'unknown status'}).`}
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                <TxLink hash={last.vote.txHash} label="Vote transaction" />
                <AddressChip value={last.stealthAccount} size="sm" explorer label="Stealth account" className="self-start" />
              </div>
              {last.vote.failure && <p className="mt-2 break-hex font-mono text-[12px] text-danger">{last.vote.failure}</p>}
              {last.vote.executed && (
                <p className="mt-3 text-[13.5px] text-fg-muted">
                  It is now in the recipient’s Inbox — found only with their view key.{' '}
                  {m.selfMetaAddress && (
                    <ButtonLink to="/app/inbox" variant="quiet" size="sm" iconRight={<ArrowRight aria-hidden className="size-3.5" />} className="h-auto!">
                      Open my Inbox
                    </ButtonLink>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function RecentCard({ m }: { m: DaoModel }) {
  const busyId = m.action.kind === 'voting' ? m.action.id : null;
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-fg-faint">Recent proposals on {APP_CONFIG.daoId}</h2>
      </div>
      {m.proposals === null && m.info.status !== 'error' && (
        <div className="space-y-2 p-5">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}
      {m.proposals?.length === 0 && <EmptyState title="No proposals yet" art={false} className="py-8" />}
      {m.proposals && m.proposals.length > 0 && (
        <ul>
          {m.proposals.map((p) => {
            const pay = p.summary.type === 'perde-payment' ? p.summary : null;
            return (
              <li key={p.id} className="grid gap-3 border-t border-line px-5 py-3.5 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="num font-mono text-[12px] text-fg-faint">#{p.id}</span>
                    <StatusBadge p={p} />
                    {pay ? (
                      <span className="text-[13px] text-fg">
                        Perde payout · {pay.totalAmountYocto !== undefined ? `${formatYocto(pay.totalAmountYocto)} NEAR` : `${formatYocto(pay.totalDepositYocto)} NEAR deposit`} to {pay.payments.length}{' '}
                        fresh account{pay.payments.length > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="text-[13px] text-fg-muted">Other proposal ({p.summary.type === 'other' ? p.summary.kindLabel : ''})</span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[12px] text-fg-faint">
                    {formatDateTime(p.submittedAtMs)} · by {truncateMiddle(p.proposer, 12, 8)} · “{p.description}”
                  </p>
                </div>
                <div className="flex gap-2">
                  {p.status === 'InProgress' && !p.expired && pay && m.hasWallet && (
                    <Button size="sm" variant="secondary" onClick={() => m.approve(p.id)} loading={busyId === p.id} loadingLabel="Approving">
                      Approve
                    </Button>
                  )}
                  {(p.expired || p.status === 'Failed') && m.hasWallet && (
                    <Button size="sm" variant="ghost" onClick={() => m.finalize(p.id)} loading={busyId === p.id} loadingLabel="Finalizing">
                      Finalize
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
