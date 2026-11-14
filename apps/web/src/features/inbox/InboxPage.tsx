import { useEffect, useState } from 'react';
import { ArrowDownToLine, Globe, RefreshCw, RotateCcw } from 'lucide-react';
import { PageHeader } from '../../app-shell/PageHeader';
import { Card } from '../../ui/Card';
import { Button, ButtonLink } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { AddressChip } from '../../ui/AddressChip';
import { Callout, EmptyState, Skeleton } from '../../ui/Feedback';
import { Dialog } from '../../ui/Dialog';
import { Field, Input } from '../../ui/Field';
import { TxLink } from '../../ui/TxLink';
import { Spinner } from '../../ui/Spinner';
import { Amount } from '../../components/Amount';
import { ChainViewButton, ChainViewSheet } from '../../components/ChainView';
import type { ChainSubject } from '../../components/chain-evidence';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format-date';
import { formatYocto, isImplicitAccount, isNamedAccount, truncateMiddle } from '../../lib/near-format';
import { TxWaitLine } from '../../components/TxProgress';
import { useInbox } from './useInbox';
import { onwardLimits } from './onward';
import { OnwardDialog } from './OnwardDialog';
import type { ClaimEstimate, ClaimMode, FoundPayment, InboxModel, OnwardTerms, ScanState } from './types';

function subjectOf(p: FoundPayment): ChainSubject {
  return {
    kind: 'received',
    stealthAccount: p.stealthAccount,
    announcementIndex: p.announcementIndex,
    invoiceIndex: p.invoiceIndex,
    amountYocto: p.amountYocto,
    claim: p.claimRecord,
    sentRecord: p.sentRecord,
    onward: p.onward,
  };
}

export default function InboxPage() {
  const m = useInbox();
  const [claiming, setClaiming] = useState<FoundPayment | null>(null);
  const [paying, setPaying] = useState<FoundPayment | null>(null);
  const [chainFor, setChainFor] = useState<string | null>(null);
  const [chainOpen, setChainOpen] = useState(false);
  const focus = m.payments.find((p) => p.id === chainFor) ?? m.payments.find((p) => p.claim.status === 'claimed') ?? m.payments[0] ?? null;

  if (!m.hasIdentity)
    return (
      <>
        <PageHeader eyebrow="Inbox" title="Payments behind the curtain" />
        <Card>
          <EmptyState
            title="No identity in this browser"
            action={
              <ButtonLink to="/app/receive" icon={<ArrowDownToLine aria-hidden className="size-4" />}>
                Set up receiving
              </ButtonLink>
            }
          >
            Your inbox is found by scanning with your view key. Create or restore an identity first.
          </EmptyState>
        </Card>
      </>
    );

  const scanning = m.scan.status === 'scanning';
  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Payments behind the curtain"
        description="Your browser scans public announcements with your view key. Only you can recognise which ones are yours."
        actions={
          <>
            <ChainViewButton
              onClick={() => {
                setChainFor(null);
                setChainOpen(true);
              }}
            />
            <Button variant="secondary" size="sm" icon={<RefreshCw aria-hidden className="size-4" />} onClick={m.rescan} disabled={scanning}>
              Rescan
            </Button>
          </>
        }
      />

      <Summary m={m} />

      {m.scan.status === 'error' && (
        <Callout tone="danger" title="Scan interrupted" role="alert" className="mt-5" action={<Button size="sm" variant="secondary" onClick={m.rescan}>Try again</Button>}>
          {m.scan.message}
        </Callout>
      )}

      <section aria-labelledby="found-title" className="mt-8">
        <h2 id="found-title" className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-fg-faint">
          Found payments
        </h2>
        {m.payments.length === 0 && (scanning || m.scan.status === 'idle') && <RowSkeletons />}
        {m.payments.length === 0 && m.scan.status === 'done' && (
          <Card>
            <EmptyState
              title="Nothing behind the curtain yet"
              action={
                <>
                  <ButtonLink to="/app/send">Send yourself a test payment</ButtonLink>
                  <ButtonLink to="/app/receive" variant="ghost">
                    Share your address
                  </ButtonLink>
                </>
              }
            >
              No announcement or invoice matches your keys yet. New payments show up here after a rescan.
            </EmptyState>
          </Card>
        )}
        {m.payments.length > 0 && (
          <ul className="overflow-hidden rounded-xl border border-line bg-surface">
            {m.payments.map((p) => (
              <PaymentRow
                key={p.id}
                p={p}
                terms={m.onwardTerms}
                onClaim={() => setClaiming(p)}
                onPayOnward={() => setPaying(p)}
                onChain={() => {
                  setChainFor(p.id);
                  setChainOpen(true);
                }}
              />
            ))}
            {scanning && (
              <li className="flex items-center gap-2 border-t border-line px-5 py-4 text-[13px] text-fg-muted">
                <Spinner size={14} /> Checking for new payments…
              </li>
            )}
          </ul>
        )}
      </section>

      <ClaimDialog m={m} payment={claiming} onClose={() => setClaiming(null)} />
      <OnwardDialog
        m={m}
        payment={paying}
        onClose={() => setPaying(null)}
        onSweep={(p) => setClaiming(m.payments.find((x) => x.id === p.id) ?? p)}
      />

      <ChainViewSheet
        open={chainOpen}
        onClose={() => setChainOpen(false)}
        yourRole="recipient"
        subject={focus ? subjectOf(focus) : null}
        emptyHint="No payment found yet. Send yourself one, rescan, and the chain view shows its real announcement."
        yourView={[
          { label: 'This payment is yours', value: focus ? `Recognised with your view key${focus.source === 'invoice' ? ` (invoice #${focus.invoiceIndex})` : ''}` : '—' },
          ...(focus && focus.onward.length > 0
            ? [
                {
                  label: 'Paid onward from it',
                  value: `${focus.onward.length === 1 ? 'One payment' : `${focus.onward.length} payments`} to fresh accounts, signed by this stealth account — your named accounts never appeared.`,
                },
              ]
            : []),
          { label: 'Waiting to be claimed (all payments)', value: <Amount yocto={m.unclaimedYocto} /> },
          { label: 'Who can spend it', value: 'Only you: the account’s key is derived from your spend key, in this browser.' },
        ]}
      />
    </>
  );
}

function scanLine(scan: ScanState, cursor: number): string {
  switch (scan.status) {
    case 'scanning':
      return scan.total !== null ? `Reading new announcements: ${scan.scanned} of ${scan.total}…` : 'Counting announcements…';
    case 'done':
      return `${cursor} announcements checked · ${formatDateTime(scan.finishedAtMs)}`;
    case 'error':
      return 'Scan stopped';
    default:
      return 'Preparing to scan…';
  }
}

function Summary({ m }: { m: InboxModel }) {
  const s = m.scan;
  const pct = s.status === 'scanning' && s.total ? Math.round((s.scanned / s.total) * 100) : s.status === 'done' ? 100 : s.status === 'scanning' && s.total === 0 ? 100 : 0;
  return (
    <Card className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-fg-muted">Unclaimed</p>
        <Amount yocto={m.unclaimedYocto} size="xl" className="mt-1 text-fg" />
      </div>
      <div className="min-w-0 sm:w-80">
        <p className="flex min-h-5 items-center gap-2 text-[13px] text-fg-muted" role="status" aria-live="polite">
          {s.status === 'scanning' && <Spinner size={13} />}
          {scanLine(s, m.cursor)}
        </p>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label="Scan progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="h-full rounded-full bg-linear-to-r from-velvet-mid to-accent-text transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <button
          type="button"
          onClick={m.rescanFromStart}
          disabled={s.status === 'scanning'}
          className="mt-2 inline-flex min-h-8 items-center gap-1.5 text-[12.5px] text-fg-faint underline decoration-line-strong underline-offset-4 hover:text-fg disabled:opacity-50"
        >
          <RotateCcw aria-hidden className="size-3" />
          Rescan from the first announcement
        </button>
      </div>
    </Card>
  );
}

function PaymentRow({
  p,
  terms,
  onClaim,
  onPayOnward,
  onChain,
}: {
  p: FoundPayment;
  terms: OnwardTerms | null;
  onClaim: () => void;
  onPayOnward: () => void;
  onChain: () => void;
}) {
  const c = p.claim;
  const empty = p.exists === false || (p.balanceYocto !== null && BigInt(p.balanceYocto) === 0n) || p.spend === 'spent';
  const canOnward =
    !!terms &&
    p.balanceYocto !== null &&
    onwardLimits({ balanceYocto: BigInt(p.balanceYocto), announceFeeYocto: terms.announceFeeYocto, gasReserveYocto: terms.gasReserveYocto, minAmountYocto: terms.minAmountYocto }).canPay;
  return (
    <li className="grid gap-4 border-t border-line px-5 py-4.5 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Amount yocto={p.amountYocto} size="lg" className={c.status === 'claimed' ? 'text-fg-muted' : 'text-fg'} />
          {p.source === 'invoice' ? <Badge tone="brass">Invoice #{p.invoiceIndex}</Badge> : <Badge>Announcement #{p.announcementIndex}</Badge>}
          {p.sentRecord?.kind === 'onward' && <Badge>Paid onward to you</Badge>}
          {p.note && <span className="min-w-0 truncate text-[13px] text-fg-muted">{p.note}</span>}
        </div>
        {p.onward.length > 0 && (
          <ul className="mt-2 space-y-1 text-[12.5px] text-fg-muted">
            {p.onward.map((r) => (
              <li key={r.txHash} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  Paid <Amount yocto={r.amountYocto} size="sm" className="text-fg" /> onward to{' '}
                  {r.metaAddress && r.recipientLabel.startsWith('Yourself') ? 'yourself' : <span className="font-mono">{truncateMiddle(r.recipientLabel, 12, 6)}</span>}
                </span>
                <TxLink hash={r.txHash} label="tx" className="min-h-6 text-[12px]" />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-fg-faint">
          <AddressChip value={p.stealthAccount} size="sm" explorer label="Stealth account" />
          {p.timestampMs !== null && <span>{p.source === 'invoice' ? `invoice created ${formatDateTime(p.timestampMs)}` : formatDateTime(p.timestampMs)}</span>}
          {p.balanceYocto !== null && c.status !== 'claimed' && !empty && BigInt(p.balanceYocto) !== BigInt(p.amountYocto) && (
            <span>
              {p.spend === 'partially-spent' ? 'left' : 'balance'} <Amount yocto={p.balanceYocto} size="sm" maxFractionDigits={5} />
            </span>
          )}
          <button type="button" onClick={onChain} className="inline-flex min-h-7 items-center gap-1 underline decoration-line-strong underline-offset-4 hover:text-fg">
            <Globe aria-hidden className="size-3" />
            Chain view
          </button>
        </div>
      </div>
      <div className="flex min-w-0 flex-col items-start gap-1.5 sm:items-end">
        {c.status === 'unclaimed' && p.balanceYocto === null && <Skeleton className="h-9 w-24" />}
        {c.status === 'unclaimed' && p.balanceYocto !== null && !empty && (
          <>
            {p.spend === 'partially-spent' && <Badge tone="brass">Partly paid onward</Badge>}
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {canOnward && (
                <Button size="sm" onClick={onPayOnward}>
                  Pay someone from here
                </Button>
              )}
              <Button size="sm" variant={canOnward ? 'secondary' : 'primary'} onClick={onClaim}>
                {p.spend === 'partially-spent' ? 'Claim the rest…' : 'Claim to…'}
              </Button>
            </div>
          </>
        )}
        {c.status === 'unclaimed' && empty && (
          <Badge tone={p.spend === 'spent' ? 'success' : 'neutral'} dot={p.spend === 'spent'}>
            {p.spend === 'spent' ? 'Spent onward' : p.exists === false ? 'Already emptied' : 'Empty'}
          </Badge>
        )}
        {c.status === 'claiming' && (
          <div className="max-w-xs text-[13px] text-fg-muted sm:text-right" role="status">
            <p className="flex items-center gap-2 sm:justify-end">
              <Spinner size={14} /> Claiming to <span className="font-mono text-fg">{truncateMiddle(c.destination, 10, 8)}</span>
            </p>
            <p className="mt-1 text-[12.5px] text-fg-faint">
              <TxWaitLine step={c.step} startedAtMs={c.startedAtMs} />
            </p>
          </div>
        )}
        {c.status === 'claimed' && (
          <>
            <Badge tone="success" dot>
              Claimed {formatYocto(c.claimedYocto)} to {truncateMiddle(c.destination, 12, 8)}
            </Badge>
            <TxLink hash={c.txHash} label="Claim tx" />
          </>
        )}
        {c.status === 'error' && (
          <>
            <p className="max-w-xs text-[13px] text-danger sm:text-right" role="alert">
              {c.message}
            </p>
            <Button size="sm" variant="secondary" onClick={onClaim}>
              Retry claim
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

function RowSkeletons() {
  return (
    <div className="space-y-px overflow-hidden rounded-xl border border-line" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center justify-between bg-surface px-6 py-5">
          <div className="space-y-2.5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
      ))}
    </div>
  );
}

function ClaimDialog({ m, payment, onClose }: { m: InboxModel; payment: FoundPayment | null; onClose: () => void }) {
  const [dest, setDest] = useState('');
  const [mode, setMode] = useState<ClaimMode>('deleteAccount');
  const [est, setEst] = useState<{ key: string; value: ClaimEstimate }>({ key: '', value: { status: 'idle' } });
  const trimmed = dest.trim();
  const valid = isNamedAccount(trimmed) || isImplicitAccount(trimmed);
  const key = `${payment?.id ?? ''}|${trimmed}|${mode}`;

  // The destination starts empty: the wallet is only offered as a suggestion, because paying it links this payment to it.
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (payment && openedFor !== payment.id) {
    setOpenedFor(payment.id);
    setDest('');
    setMode('deleteAccount');
  }

  const { estimateClaim } = m;
  useEffect(() => {
    if (!payment || !valid) return;
    let live = true;
    const t = window.setTimeout(() => {
      void estimateClaim(payment.id, trimmed, mode).then((value) => live && setEst({ key, value }));
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [payment, trimmed, mode, valid, key, estimateClaim]);

  const e: ClaimEstimate = !valid ? { status: 'idle' } : est.key === key ? est.value : { status: 'loading' };
  const named = isNamedAccount(trimmed);
  const ready = e.status === 'ready' && !e.blocker;

  return (
    <Dialog
      open={!!payment}
      onClose={onClose}
      title={payment?.balanceYocto ? `Claim ${formatYocto(payment.balanceYocto)} NEAR` : 'Claim'}
      description="Moves the funds out of the stealth account. Its key is derived in this browser; the account signs and pays its own gas."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!ready}
            onClick={() => {
              if (!payment) return;
              m.claim(payment.id, trimmed, mode);
              onClose();
            }}
          >
            Claim
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Destination account" error={trimmed && !valid ? 'Enter a NEAR account id (name.testnet or 64-hex).' : undefined}>
          {(p) => <Input {...p} mono value={dest} onChange={(ev) => setDest(ev.target.value)} placeholder="name.testnet" autoComplete="off" autoCapitalize="none" spellCheck={false} />}
        </Field>
        {m.destinationSuggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
            Your demo wallet — links this payment to it:
            {m.destinationSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setDest(s)}
                className="inline-flex h-8 max-w-full items-center rounded-full border border-line-strong px-3 font-mono text-[12px] text-fg hover:border-brass"
              >
                <span className="truncate">{s}</span>
              </button>
            ))}
          </div>
        )}

        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-fg">How to claim</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                { v: 'deleteAccount', title: 'Full sweep', body: 'Deletes the stealth account and hands over everything. No dust left. Needs an existing destination.' },
                { v: 'transfer', title: 'Transfer', body: 'Sends the balance minus a gas reserve; a tiny refund stays behind. Can create a new implicit account.' },
              ] as const
            ).map((o) => (
              <label
                key={o.v}
                className={cn('flex cursor-pointer gap-3 rounded-lg border px-3.5 py-3', mode === o.v ? 'border-brass bg-brass/[0.06]' : 'border-line hover:border-line-strong')}
              >
                <input type="radio" name="claim-mode" value={o.v} checked={mode === o.v} onChange={() => setMode(o.v)} className="mt-1 accent-(--accent)" />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-fg">{o.title}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-fg-muted">{o.body}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="min-h-[68px] rounded-lg border border-line bg-surface-2/50 px-4 py-3" aria-live="polite">
          {e.status === 'idle' && <p className="text-[13px] text-fg-faint">Enter a destination to see the fee.</p>}
          {e.status === 'loading' && (
            <p className="flex items-center gap-2 text-[13px] text-fg-muted">
              <Spinner size={14} /> Estimating from the live gas price…
            </p>
          )}
          {e.status === 'error' && <p className="text-[13px] text-danger">{e.message}</p>}
          {e.status === 'ready' && (
            <div className="space-y-1 text-[13px]">
              {e.blocker ? (
                <p className="text-danger">{e.blocker}</p>
              ) : (
                <>
                  <p className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-fg-muted">Destination receives about</span>
                    <Amount yocto={e.receiveYocto} />
                  </p>
                  <p className="flex flex-wrap items-baseline justify-between gap-2 text-fg-faint">
                    <span>{e.leavesDust ? 'Gas reserve kept back (most returns as dust)' : 'Network fee, at most'}</span>
                    <Amount yocto={e.feeYocto} maxFractionDigits={6} size="sm" />
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {named ? (
          <Callout tone="warn" title="This links the payment to that account">
            A claim is a public transaction. Anyone can now see that this stealth account paid <span className="font-mono">{trimmed}</span>. To keep the curtain
            closed, claim to a brand-new implicit account you control (transfer mode creates it), leave the funds where they are — or pay onward without ever
            claiming (“Pay someone from here” in the Inbox).
          </Callout>
        ) : (
          <Callout tone="info">
            Claiming to a fresh 64-hex implicit account you control keeps the payment unlinked from your named accounts. Creating it costs about 0.007 NEAR of
            the claimed amount.
          </Callout>
        )}
      </div>
    </Dialog>
  );
}
