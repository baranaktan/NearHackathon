import { useState } from 'react';
import { ArrowDownToLine, ArrowRight, Clock } from 'lucide-react';
import { PageHeader } from '../../app-shell/PageHeader';
import { Card, CardHeader } from '../../ui/Card';
import { Button, ButtonLink } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Field, Input } from '../../ui/Field';
import { AmountInput } from '../../ui/AmountInput';
import { AddressChip } from '../../ui/AddressChip';
import { Callout, EmptyState, Skeleton } from '../../ui/Feedback';
import { CopyButton } from '../../ui/CopyButton';
import { QR } from '../../ui/QR';
import { Combobox } from '../../ui/Combobox';
import { Amount } from '../../components/Amount';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format-date';
import { useInvoice } from './useInvoice';
import type { Invoice, InvoiceModel } from './types';

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
            {m.current ? (
              <>
                <InvoiceDetail inv={m.current} />
                <AnyChain m={m} />
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
  return (
    <Card>
      <CardHeader title="New invoice" className="mb-4" />
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          m.create({ amount, memo });
          setAmount('');
          setMemo('');
        }}
      >
        <Field label="Amount" optional hint="Leave empty to accept any amount.">
          {(p) => <AmountInput {...p} value={amount} onValueChange={setAmount} />}
        </Field>
        <Field label="Note for you" optional hint="Stored only in this browser.">
          {(p) => <Input {...p} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. November retainer" maxLength={80} />}
        </Field>
        <Button type="submit" loading={m.creating} loadingLabel="Creating invoice" full>
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
                  <span className="block text-[12px] text-fg-faint">{formatDateTime(inv.createdAtMs)}</span>
                </span>
                <Badge tone={inv.status === 'paid' ? 'success' : 'neutral'} dot>
                  {inv.status === 'paid' ? 'Paid' : 'Open'}
                </Badge>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function InvoiceDetail({ inv }: { inv: Invoice }) {
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="grid md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-brass-text">Invoice #{inv.index}</p>
            <Badge tone={inv.status === 'paid' ? 'success' : 'neutral'} dot pulse={inv.status === 'open'}>
              {inv.status === 'paid' ? 'Paid' : 'Waiting for payment'}
            </Badge>
          </div>
          <h2 className="mt-3 text-display text-[30px] text-fg">{inv.memo || 'Untitled invoice'}</h2>
          <div className="mt-3">
            {inv.amountYocto ? <Amount yocto={inv.amountYocto} size="lg" /> : <span className="text-[14px] text-fg-muted">Any amount</span>}
          </div>
          {inv.status === 'paid' && (
            <p className="mt-2 text-[13.5px] text-success">
              Received <Amount yocto={inv.receivedYocto} size="sm" /> — claim it from your Inbox.
            </p>
          )}
          <dl className="mt-6 space-y-4">
            <div>
              <dt className="mb-1.5 text-[12.5px] text-fg-muted">Pay to this one-time account</dt>
              <dd>
                <AddressChip value={inv.stealthAccount} explorer label="Invoice account" />
              </dd>
            </div>
            <div>
              <dt className="mb-1.5 text-[12.5px] text-fg-muted">Pay link</dt>
              <dd className="flex min-w-0 items-center gap-1 rounded-md border border-line bg-surface-2/70 py-1 pl-3 pr-1">
                <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-fg" title={inv.payLink}>
                  {inv.payLink}
                </span>
                <CopyButton value={inv.payLink} label="Copy pay link" />
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex items-center justify-center border-t border-line bg-surface-2/50 p-6 md:border-l md:border-t-0">
          <QR value={inv.payLink} size={156} label={`QR code for invoice ${inv.index}`} caption="Scan to open the pay link" />
        </div>
      </div>
    </Card>
  );
}

function AnyChain({ m }: { m: InvoiceModel }) {
  const q = m.quote;
  const asset = m.assets.find((a) => a.id === m.selectedAssetId) ?? null;
  return (
    <Card>
      <CardHeader
        title="Pay from any chain"
        description="NEAR Intents can swap from another chain straight into this invoice account. Pick what the payer holds to see a quote."
        actions={<Badge tone="warn">Preview — dry quote</Badge>}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Payer sends" className="flex-1">
          {(p) => (
            <Combobox
              {...p}
              options={m.assets.map((a) => ({
                value: a.id,
                label: a.symbol,
                detail: a.chain,
                leading: (
                  <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface-3 font-mono text-[9px] text-fg-muted">
                    {a.symbol.slice(0, 3)}
                  </span>
                ),
              }))}
              value={m.selectedAssetId}
              onChange={m.selectAsset}
              placeholder="Search asset or chain"
            />
          )}
        </Field>
        <Button variant="secondary" onClick={m.requestQuote} loading={q.status === 'loading'} loadingLabel="Fetching quote" disabled={!m.selectedAssetId}>
          Get quote
        </Button>
      </div>

      <div className="mt-5 min-h-[104px]" aria-live="polite">
        {q.status === 'idle' && <p className="pt-2 text-[13.5px] text-fg-faint">No quote requested. Quotes are dry runs: nothing is signed or sent.</p>}
        {q.status === 'loading' && (
          <div className="grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-3" aria-label="Loading quote">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        )}
        {q.status === 'error' && (
          <Callout tone="danger" title="No quote for this route" role="alert">
            {q.message}
          </Callout>
        )}
        {q.status === 'ready' && (
          <div className="rounded-lg border border-line bg-surface-2/50">
            <div className="grid items-center gap-4 p-4 sm:grid-cols-[1fr_auto_1fr] sm:p-5">
              <div className="min-w-0">
                <p className="text-[12px] text-fg-muted">Payer sends about</p>
                <p className="num mt-1 font-mono text-[22px] text-fg">
                  {q.quote.amountInFormatted} <span className="text-[13px] text-fg-faint">{asset?.symbol} · {asset?.chain}</span>
                </p>
              </div>
              <ArrowRight aria-hidden className="size-4 text-fg-faint max-sm:rotate-90" />
              <div className="min-w-0 sm:text-right">
                <p className="text-[12px] text-fg-muted">Invoice receives</p>
                <p className="num mt-1 font-mono text-[22px] text-fg">
                  {q.quote.amountOutFormatted} <span className="text-[13px] text-fg-faint">NEAR</span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line px-4 py-3 text-[12.5px] text-fg-muted sm:px-5">
              <span className="inline-flex items-center gap-1.5">
                <Clock aria-hidden className="size-3.5" />~{q.quote.timeEstimateSec}s
              </span>
              <span>Quoted {formatDateTime(Date.parse(q.quote.quotedAt))}</span>
              <span className="text-fg-faint">Dry run · mainnet route · not executed</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
