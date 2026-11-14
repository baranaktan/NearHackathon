import { useEffect, type ReactNode } from 'react';
import { Eye, Globe, RotateCcw } from 'lucide-react';
import { Sheet } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Callout, EmptyState, Skeleton } from '../ui/Feedback';
import { TxLink } from '../ui/TxLink';
import { AddressChip } from '../ui/AddressChip';
import { useAppState } from '../state/context';
import { APP_CONFIG } from '../config';
import { formatDateTimeFull } from '../lib/format-date';
import { formatYocto, truncateMiddle } from '../lib/near-format';
import { Ledger, type LedgerRowData } from './Ledger';
import { useEvidence, type ChainSubject, type Evidence, type TxAction, type TxEvidence } from './chain-evidence';

export function ChainViewButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="secondary" size="sm" icon={<Globe aria-hidden className="size-4" />} onClick={onClick} disabled={disabled}>
      Chain view
    </Button>
  );
}

export interface ChainViewProps {
  open: boolean;
  onClose: () => void;
  /** The real payment to show. Null → an explanation instead of invented rows. */
  subject: ChainSubject | null;
  /** What only you (sender or recipient) know. */
  yourView: Array<{ label: string; value: ReactNode }>;
  yourRole: 'sender' | 'recipient';
  emptyHint?: ReactNode;
}

const near = (y: string) => `${formatYocto(y, { maxFractionDigits: 5 })} NEAR`;

function actionLine(a: TxAction, receiverId: string): ReactNode {
  switch (a.kind) {
    case 'FunctionCall':
      return (
        <>
          <span className="font-mono">{receiverId}</span> · <span className="font-mono text-fg">{a.method}()</span> with {near(a.depositYocto)} attached
        </>
      );
    case 'Transfer':
      return (
        <>
          Transfer {near(a.depositYocto)} to <span className="font-mono">{truncateMiddle(receiverId, 10, 8)}</span>
        </>
      );
    case 'DeleteAccount':
      return (
        <>
          DeleteAccount → whole balance to <span className="font-mono">{truncateMiddle(a.beneficiary, 12, 8)}</span>
        </>
      );
    default:
      return a.name;
  }
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-[12.5px] text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-hex text-[13px] text-fg">{children}</dd>
    </div>
  );
}

function TxBlock({ title, tx }: { title: string; tx: TxEvidence }) {
  return (
    <div className="rounded-lg border border-line px-3.5">
      <p className="pt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-fg-faint">{title}</p>
      <dl className="divide-y divide-line">
        <Row label="Transaction">
          <TxLink hash={tx.hash} label="" />
        </Row>
        <Row label="Signed by">
          <span className="font-mono">{truncateMiddle(tx.signerId, 14, 10)}</span>
        </Row>
        {tx.actions.map((a, i) => (
          <Row key={i} label={i === 0 ? 'Action' : `Action ${i + 1}`}>
            {actionLine(a, tx.receiverId)}
          </Row>
        ))}
        <Row label="Status">{tx.success ? 'Succeeded' : 'Failed'} · {near(tx.tokensBurntYocto)} burnt as gas</Row>
      </dl>
    </div>
  );
}

function ledgerRows(subject: ChainSubject, ev: Evidence): LedgerRowData[] {
  const rows: LedgerRowData[] = [];
  if (subject.kind === 'sent' && ev.payTx) {
    rows.push({
      id: 'pay',
      ref: truncateMiddle(ev.payTx.hash, 4, 4),
      from: ev.payTx.signerId,
      to: truncateMiddle(subject.record.stealthAccount, 4, 4),
      amount: near(subject.record.amountYocto),
      highlight: 'veiled',
    });
  }
  if (subject.kind === 'received') {
    rows.push({
      id: 'in',
      ref: ev.announcement ? `ann. #${ev.announcement.index}` : 'transfer',
      from: ev.payTx ? ev.payTx.signerId : ev.announcement ? APP_CONFIG.contractId : 'a payer',
      to: truncateMiddle(subject.stealthAccount, 4, 4),
      amount: near(ev.announcement?.amountYocto ?? subject.amountYocto),
      highlight: 'veiled',
    });
    if (ev.claimTx && subject.claim) {
      rows.push({
        id: 'out',
        ref: truncateMiddle(ev.claimTx.hash, 4, 4),
        from: truncateMiddle(subject.stealthAccount, 4, 4),
        to: subject.claim.destination,
        amount: near(subject.claim.amountYocto),
        highlight: 'exposed',
      });
    }
  }
  return rows;
}

function Observer({ subject, ev }: { subject: ChainSubject; ev: Evidence }) {
  const a = ev.announcement;
  const invoice = subject.kind === 'received' ? subject.invoiceIndex : subject.record.kind === 'invoice' ? 0 : null;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-line bg-surface-2/50 px-3.5 pt-1">
        <Ledger rows={ledgerRows(subject, ev)} caption="Public transfers" layout="stacked" />
      </div>
      {ev.payTx && <TxBlock title={subject.kind === 'received' ? 'Payment transaction (you sent this one yourself)' : 'Payment transaction'} tx={ev.payTx} />}
      {a && (
        <div className="rounded-lg border border-line px-3.5">
          <p className="pt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-fg-faint">
            Announcement #{a.index} · <span className="normal-case tracking-normal">get_announcements on {APP_CONFIG.contractId}</span>
          </p>
          <dl className="divide-y divide-line">
            <Row label="stealth_account">
              <AddressChip value={a.stealthAccount} size="sm" explorer label="Stealth account" />
            </Row>
            <Row label="ephemeral_pk">
              <span className="font-mono">{truncateMiddle(a.ephemeralPk, 16, 12)}</span>
            </Row>
            <Row label="view_tag">
              <span className="num font-mono">{a.viewTag}</span>
            </Row>
            <Row label="amount">{near(a.amountYocto)}</Row>
            <Row label="timestamp">{formatDateTimeFull(a.timestampMs)}</Row>
          </dl>
        </div>
      )}
      {!a && invoice !== null && (
        <Callout tone="info">
          Invoice payments are plain transfers to the one-time account: there is no Perde contract call and no announcement. The payer’s account is
          visible on the explorer page of{' '}
          <span className="font-mono">{truncateMiddle(subject.kind === 'received' ? subject.stealthAccount : subject.record.stealthAccount, 6, 6)}</span>.
        </Callout>
      )}
      {subject.kind === 'received' && a && !ev.payTx && (
        <p className="text-[12.5px] leading-relaxed text-fg-faint">
          The announcement does not store who paid. The sender is the signer of the transaction that created it, visible on the stealth account’s
          explorer page.
        </p>
      )}
      {ev.claimTx && <TxBlock title="Claim transaction" tx={ev.claimTx} />}
    </div>
  );
}

function observerNote(subject: ChainSubject, ev: Evidence): ReactNode {
  if (subject.kind === 'received' && subject.claim) {
    return (
      <>
        The incoming payment is unlinkable — but the claim is a normal transaction, so it now publicly connects this stealth account to{' '}
        <span className="font-mono text-fg">{subject.claim.destination}</span>.
      </>
    );
  }
  if (subject.kind === 'sent' && subject.record.kind === 'invoice') {
    return <>Your account sent a plain transfer to a 64-hex account nobody has seen before. Nothing on-chain names the recipient.</>;
  }
  if (subject.kind === 'sent') {
    return (
      <>
        <span className="font-mono text-fg">{ev.payTx?.signerId}</span> called <span className="font-mono text-fg">send</span> on the Perde contract and
        a never-seen account received the funds. Nothing on-chain names the recipient.
      </>
    );
  }
  return <>Someone paid an account nobody has seen before. Nothing connects it to you until you move the funds.</>;
}

/**
 * "Chain view vs your view": the same payment, from the public's seat (real
 * transaction and announcement data fetched from NEAR) and from behind the curtain.
 */
export function ChainViewSheet({ open, onClose, subject, yourView, yourRole, emptyHint }: ChainViewProps) {
  const { state: ev, retry } = useEvidence(subject, open);
  const { state: app, dispatch } = useAppState();
  const seen = app.demo.chainViewSeen;
  useEffect(() => {
    if (open && ev.status === 'ready' && !seen) dispatch({ type: 'demo/update', patch: { chainViewSeen: true } });
  }, [open, ev.status, seen, dispatch]);

  return (
    <Sheet open={open} onClose={onClose} title="Chain view" description="The same payment, as the public sees it and as you see it.">
      <section aria-labelledby="cv-public">
        <h3 id="cv-public" className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-fg-faint">
          <Globe aria-hidden className="size-3.5" />
          Any observer · read from NEAR testnet
        </h3>
        {!subject && (
          <EmptyState title="Nothing to show yet" art={false} className="py-6">
            {emptyHint ?? 'The chain view shows a real payment only. Make one first.'}
          </EmptyState>
        )}
        {subject && ev.status === 'loading' && (
          <div className="space-y-3" aria-busy="true" aria-label="Loading chain data">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        )}
        {subject && ev.status === 'error' && (
          <Callout
            tone="danger"
            role="alert"
            title="Couldn’t read the chain"
            action={
              <Button size="sm" variant="secondary" icon={<RotateCcw aria-hidden className="size-4" />} onClick={retry}>
                Try again
              </Button>
            }
          >
            {ev.message}
          </Callout>
        )}
        {subject && ev.status === 'ready' && (
          <>
            <Observer subject={subject} ev={ev.evidence} />
            <p className="mt-3 text-[14px] leading-relaxed text-fg-muted">{observerNote(subject, ev.evidence)}</p>
          </>
        )}
      </section>

      <div aria-hidden className="relative my-7 h-4">
        <div className="velvet absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-sm" />
        <div className="absolute inset-x-0 top-0 h-px bg-brass/60" />
      </div>

      <section aria-labelledby="cv-yours">
        <h3 id="cv-yours" className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-brass-text">
          <Eye aria-hidden className="size-3.5" />
          Behind the curtain · {yourRole === 'sender' ? 'you, the sender' : 'you, the recipient'}
        </h3>
        <dl className="divide-y divide-line rounded-lg border border-brass/35 px-4">
          {yourView.map((r) => (
            <div key={r.label} className="flex flex-col gap-1 py-3">
              <dt className="text-[12.5px] text-fg-muted">{r.label}</dt>
              <dd className="min-w-0 text-[14px] text-fg">{r.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Sheet>
  );
}
