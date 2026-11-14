import { useState } from 'react';
import { ArrowDownToLine, RefreshCw } from 'lucide-react';
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
import { formatDateTime } from '../../lib/format-date';
import { formatYocto, isImplicitAccount, isNamedAccount, truncateMiddle } from '../../lib/near-format';
import { useInbox } from './useInbox';
import type { FoundPayment, InboxModel, ScanState } from './types';

export default function InboxPage() {
  const m = useInbox();
  const [claiming, setClaiming] = useState<FoundPayment | null>(null);
  const [chainOpen, setChainOpen] = useState(false);
  const focus = m.payments.find((p) => p.claim.status === 'claimed') ?? m.payments[0] ?? null;

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

  return (
    <>
      <PageHeader
        eyebrow="Inbox"
        title="Payments behind the curtain"
        description="Your browser scans public announcements with your view key. Only you can recognise which ones are yours."
        actions={
          <>
            <ChainViewButton onClick={() => setChainOpen(true)} />
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw aria-hidden className="size-4" />}
              onClick={m.rescan}
              disabled={m.scan.status === 'scanning'}
            >
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
        {m.payments.length === 0 && m.scan.status === 'scanning' && <RowSkeletons />}
        {m.payments.length === 0 && m.scan.status === 'done' && (
          <Card>
            <EmptyState
              title="Nothing behind the curtain yet"
              action={
                <>
                  <ButtonLink to="/app/receive" variant="secondary">
                    Share your address
                  </ButtonLink>
                  <ButtonLink to="/app/send" variant="ghost">
                    Send a test payment
                  </ButtonLink>
                </>
              }
            >
              No announcement matches your view key. New payments show up here after a rescan.
            </EmptyState>
          </Card>
        )}
        {m.payments.length > 0 && (
          <ul className="overflow-hidden rounded-xl border border-line bg-surface">
            {m.payments.map((p) => (
              <PaymentRow key={p.id} p={p} onClaim={() => setClaiming(p)} />
            ))}
            {m.scan.status === 'scanning' && (
              <li className="flex items-center gap-2 border-t border-line px-5 py-4 text-[13px] text-fg-muted">
                <Spinner size={14} /> Still scanning…
              </li>
            )}
          </ul>
        )}
      </section>

      <ClaimDialog m={m} payment={claiming} onClose={() => setClaiming(null)} />

      <ChainViewSheet
        open={chainOpen}
        onClose={() => setChainOpen(false)}
        yourRole="recipient"
        observerRows={
          focus
            ? [
                { id: 'in', ref: focus.announcementIndex !== null ? `ann. #${focus.announcementIndex}` : 'transfer', from: 'some-sender.testnet', to: truncateMiddle(focus.stealthAccount, 4, 4), amount: `${formatYocto(focus.amountYocto)} NEAR`, highlight: 'veiled' },
                ...(focus.claim.status === 'claimed'
                  ? [{ id: 'out', ref: truncateMiddle(focus.claim.txHash, 4, 4), from: truncateMiddle(focus.stealthAccount, 4, 4), to: focus.claim.destination, amount: `${formatYocto(focus.claim.claimedYocto)} NEAR`, highlight: 'exposed' as const }]
                  : []),
              ]
            : []
        }
        observerNote={
          focus?.claim.status === 'claimed' ? (
            <>
              The incoming payment is unlinkable — but the claim is a normal transfer, so it now publicly connects this stealth
              account to <span className="font-mono text-fg">{focus.claim.destination}</span>.
            </>
          ) : (
            <>Someone paid an account nobody has seen before. Nothing connects it to you until you move the funds.</>
          )
        }
        yourView={[
          { label: 'These payments are yours', value: `${m.payments.length} found with your view key` },
          { label: 'Waiting to be claimed', value: <Amount yocto={m.unclaimedYocto} /> },
          { label: 'Who can spend them', value: 'Only you: each account’s key is derived from your spend key, in this browser.' },
        ]}
      />
    </>
  );
}

function scanLine(scan: ScanState): string {
  switch (scan.status) {
    case 'scanning':
      return scan.total ? `Scanning ${scan.scanned} of ${scan.total} announcements…` : `Scanning… ${scan.scanned} read`;
    case 'done':
      return `Scanned ${scan.scanned} announcements · ${formatDateTime(scan.finishedAtMs)}`;
    case 'error':
      return 'Scan stopped';
    default:
      return 'Not scanned yet';
  }
}

function Summary({ m }: { m: InboxModel }) {
  const s = m.scan;
  const pct = s.status === 'scanning' && s.total ? Math.round((s.scanned / s.total) * 100) : s.status === 'done' ? 100 : 0;
  return (
    <Card className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-fg-muted">Unclaimed</p>
        <Amount yocto={m.unclaimedYocto} size="xl" className="mt-1 text-fg" />
      </div>
      <div className="min-w-0 sm:w-72">
        <p className="flex items-center gap-2 text-[13px] text-fg-muted" role="status" aria-live="polite">
          {s.status === 'scanning' && <Spinner size={13} />}
          {scanLine(s)}
        </p>
        <div
          className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-3"
          role="progressbar"
          aria-label="Scan progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className="h-full rounded-full bg-linear-to-r from-velvet-mid to-accent-text transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </Card>
  );
}

function PaymentRow({ p, onClaim }: { p: FoundPayment; onClaim: () => void }) {
  const c = p.claim;
  return (
    <li className="grid gap-4 border-t border-line px-5 py-4.5 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Amount yocto={p.amountYocto} size="lg" className={c.status === 'claimed' ? 'text-fg-muted' : 'text-fg'} />
          {p.source === 'invoice' ? <Badge tone="brass">Invoice</Badge> : <Badge>Announcement #{p.announcementIndex}</Badge>}
        </div>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-fg-faint">
          <AddressChip value={p.stealthAccount} size="sm" explorer label="Stealth account" />
          <span>{formatDateTime(p.timestampMs)}</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-col items-start gap-1.5 sm:items-end">
        {c.status === 'unclaimed' && (
          <Button size="sm" onClick={onClaim}>
            Claim to…
          </Button>
        )}
        {c.status === 'claiming' && (
          <p className="flex items-center gap-2 text-[13px] text-fg-muted" role="status">
            <Spinner size={14} /> Claiming to <span className="font-mono text-fg">{truncateMiddle(c.destination, 10, 6)}</span>
          </p>
        )}
        {c.status === 'claimed' && (
          <>
            <Badge tone="success" dot>
              Claimed to {truncateMiddle(c.destination, 14, 8)}
            </Badge>
            <TxLink hash={c.txHash} label="Claim tx" />
          </>
        )}
        {c.status === 'error' && (
          <>
            <p className="text-[13px] text-danger" role="alert">
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
  const trimmed = dest.trim();
  const valid = isNamedAccount(trimmed) || isImplicitAccount(trimmed);
  const named = isNamedAccount(trimmed);
  return (
    <Dialog
      open={!!payment}
      onClose={onClose}
      title={payment ? `Claim ${formatYocto(payment.balanceYocto)} NEAR` : 'Claim'}
      description="Sweeps the stealth account to an account you choose. The stealth account signs and pays its own gas."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              if (!payment) return;
              m.claim(payment.id, trimmed);
              onClose();
            }}
          >
            Claim
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field
          label="Destination account"
          error={trimmed && !valid ? 'Enter a NEAR account id (name.testnet or 64-hex).' : undefined}
          hint={m.claimFeeYocto ? `About ${formatYocto(m.claimFeeYocto, { maxFractionDigits: 5 })} NEAR of gas is deducted from the claimed amount.` : undefined}
        >
          {(p) => (
            <Input {...p} mono value={dest} onChange={(e) => setDest(e.target.value)} placeholder="name.testnet" autoComplete="off" autoCapitalize="none" spellCheck={false} />
          )}
        </Field>
        {m.destinationSuggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
            Suggestions:
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
        {named && (
          <Callout tone="warn" title="This links the payment to that account">
            A claim is a public transfer. To keep the curtain closed, claim to a fresh account or keep the funds where they are.
          </Callout>
        )}
      </div>
    </Dialog>
  );
}
