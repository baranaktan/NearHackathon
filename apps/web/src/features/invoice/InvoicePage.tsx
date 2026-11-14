import { useState } from 'react';
import { ArrowDownToLine, ExternalLink, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../app-shell/PageHeader';
import { Card, CardHeader } from '../../ui/Card';
import { Button, ButtonLink } from '../../ui/Button';
import { Badge, type BadgeTone } from '../../ui/Badge';
import { Field, Input } from '../../ui/Field';
import { AmountInput } from '../../ui/AmountInput';
import { AddressChip } from '../../ui/AddressChip';
import { Callout, EmptyState } from '../../ui/Feedback';
import { CopyButton } from '../../ui/CopyButton';
import { QR } from '../../ui/QR';
import { TxLink } from '../../ui/TxLink';
import { Amount } from '../../components/Amount';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format-date';
import { AnyChainPanel } from '../anychain/AnyChainPanel';
import { NOTE_MAX } from '../pay/params';
import { useInvoice } from './useInvoice';
import type { Invoice, InvoiceModel, InvoiceStatus } from './types';

const STATUS: Record<InvoiceStatus, { label: string; tone: BadgeTone }> = {
  checking: { label: 'Checking…', tone: 'neutral' },
  open: { label: 'Waiting for payment', tone: 'neutral' },
  partial: { label: 'Partly paid', tone: 'warn' },
  paid: { label: 'Paid', tone: 'success' },
  claimed: { label: 'Paid · claimed', tone: 'success' },
};

export default function InvoicePage() {
  const m = useInvoice();
  return (
    <>
      <PageHeader
        eyebrow="Invoice"
        title="Get paid by anyone"
        description="A one-time account derived from your view key. No announcement needed, so exchanges, plain wallets and cross-chain swaps can pay it."
      />
      {!m.hasIdentity ? (
        <Card>
          <EmptyState title="No identity in this browser" action={<ButtonLink to="/app/receive" icon={<ArrowDownToLine aria-hidden className="size-4" />}>Set up receiving</ButtonLink>}>
            Invoices are derived from your view key. Create or restore an identity first.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="min-w-0 space-y-5">
            <CreateForm m={m} />
            {m.invoices.length > 0 && <InvoiceList m={m} />}
          </div>
          <div className="min-w-0 space-y-5">
            {m.balanceError && (
              <Callout tone="warn" role="alert" action={<Button size="sm" variant="secondary" onClick={m.refresh}>Retry</Button>}>
                Couldn’t read invoice balances: {m.balanceError}
              </Callout>
            )}
            {m.current ? (
              <>
                <InvoiceDetail inv={m.current} onRefresh={m.refresh} />
                <AnyChainPanel key={m.current.index} stealthAccountId={m.current.stealthAccount} amountYocto={m.current.amountYocto} />
              </>
            ) : (
              <Card tone="outline">
                <EmptyState title="No invoice yet">Create one on the left: you get a pay link, a QR code and a one-time account.</EmptyState>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function CreateForm({ m }: { m: InvoiceModel }) {
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader title="New invoice" className="mb-4" />
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const err = m.create({ amount, memo });
          setError(err);
          if (!err) {
            setAmount('');
            setMemo('');
          }
        }}
      >
        <Field label="Amount" optional hint="Leave empty to accept any amount." error={error}>
          {(p) => <AmountInput {...p} value={amount} onValueChange={setAmount} />}
        </Field>
        <Field label="Note" optional hint="Part of the pay link, so the payer sees it. Never written on-chain.">
          {(p) => <Input {...p} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. November retainer" maxLength={NOTE_MAX} />}
        </Field>
        <Button type="submit" full>
          Create invoice
        </Button>
      </form>
    </Card>
  );
}

function InvoiceList({ m }: { m: InvoiceModel }) {
  return (
    <Card padded={false} className="overflow-hidden">
      <h2 className="border-b border-line px-5 py-3.5 text-[11px] font-medium uppercase tracking-[0.16em] text-fg-faint">Your invoices</h2>
      <ul>
        {m.invoices.map((inv) => {
          const active = m.current?.index === inv.index;
          const s = STATUS[inv.status];
          return (
            <li key={inv.index} className="border-t border-line first:border-t-0">
              <button
                type="button"
                onClick={() => m.select(inv.index)}
                aria-current={active ? 'true' : undefined}
                className={cn('flex min-h-14 w-full items-center gap-3 px-5 py-3 text-left transition-colors', active ? 'bg-surface-2' : 'hover:bg-surface-2/60')}
              >
                <span className="num w-7 shrink-0 font-mono text-[12px] text-fg-faint">#{inv.index}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-fg">{inv.memo || 'Untitled'}</span>
                  <span className="block text-[12px] text-fg-faint">{inv.createdAtMs ? formatDateTime(inv.createdAtMs) : 'Found by an inbox scan'}</span>
                </span>
                <Badge tone={s.tone} dot>
                  {inv.status === 'open' ? 'Open' : s.label}
                </Badge>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function InvoiceDetail({ inv, onRefresh }: { inv: Invoice; onRefresh: () => void }) {
  const s = STATUS[inv.status];
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="grid md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-brass-text">Invoice #{inv.index}</p>
            <Badge tone={s.tone} dot pulse={inv.status === 'open'}>
              {s.label}
            </Badge>
            <button
              type="button"
              onClick={onRefresh}
              aria-label="Check the balance now"
              title="Check the balance now"
              className="inline-flex size-8 items-center justify-center rounded-md text-fg-faint hover:bg-surface-3 hover:text-fg"
            >
              <RefreshCw aria-hidden className="size-3.5" />
            </button>
          </div>
          <h2 className="mt-3 break-words text-display text-[30px] text-fg">{inv.memo || 'Untitled invoice'}</h2>
          <div className="mt-3">{inv.amountYocto ? <Amount yocto={inv.amountYocto} size="lg" /> : <span className="text-[14px] text-fg-muted">Any amount</span>}</div>
          {(inv.status === 'paid' || inv.status === 'partial') && inv.receivedYocto && (
            <p className={cn('mt-2 text-[13.5px]', inv.status === 'paid' ? 'text-success' : 'text-warn')}>
              Holds <Amount yocto={inv.receivedYocto} size="sm" /> — claim it from your{' '}
              <ButtonLink to="/app/inbox" variant="quiet" size="sm" className="h-auto! align-baseline">
                Inbox
              </ButtonLink>
              .
            </p>
          )}
          {inv.status === 'claimed' && inv.claimTxHash && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[13.5px] text-success">
              Claimed <Amount yocto={inv.receivedYocto ?? '0'} size="sm" /> <TxLink hash={inv.claimTxHash} label="" />
            </p>
          )}
          {inv.status === 'open' && <p className="mt-2 text-[12.5px] text-fg-faint">Checking the balance every few seconds while this page is open.</p>}
          <dl className="mt-6 space-y-4">
            <div>
              <dt className="mb-1.5 text-[12.5px] text-fg-muted">Pay to this one-time account</dt>
              <dd>
                <AddressChip value={inv.stealthAccount} explorer label="Invoice account" />
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex items-center justify-center border-t border-line bg-surface-2/50 p-6 md:border-l md:border-t-0">
          <QR value={inv.payLink} size={156} label={`QR code for invoice ${inv.index}`} caption="Scan to open the pay link" />
        </div>
      </div>
      <div className="border-t border-line px-5 py-4 sm:px-6">
        <p className="mb-1.5 text-[12.5px] text-fg-muted">Pay link — anyone with it can pay from a testnet wallet or see a cross-chain quote</p>
        <div className="flex min-w-0 items-center gap-1 rounded-md border border-line bg-surface-2/70 py-1 pl-3 pr-1">
          <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-fg" title={inv.payLink} translate="no">
            {inv.payLink}
          </span>
          <CopyButton value={inv.payLink} label="Copy pay link" />
          <a
            href={inv.payLink}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open the pay page in a new tab"
            title="Open the pay page"
            className="inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface-3 hover:text-fg"
          >
            <ExternalLink aria-hidden className="size-4" />
          </a>
        </div>
      </div>
    </Card>
  );
}
