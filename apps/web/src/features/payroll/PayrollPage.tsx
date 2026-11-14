import { useRef } from 'react';
import { ArrowLeft, CircleCheck, FileUp, TriangleAlert, XCircle } from 'lucide-react';
import { PageHeader } from '../../app-shell/PageHeader';
import { Card, CardHeader, DataRow } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Field, Textarea } from '../../ui/Field';
import { AddressChip } from '../../ui/AddressChip';
import { Callout, EmptyState } from '../../ui/Feedback';
import { Timeline } from '../../ui/Stepper';
import { TxLink } from '../../ui/TxLink';
import { Amount } from '../../components/Amount';
import { cn } from '../../lib/cn';
import { truncateMiddle } from '../../lib/near-format';
import { usePayroll } from './usePayroll';
import type { PayrollModel, PayrollRow, PayrollResult } from './types';

const recipientLabel = (r: string) => (r.startsWith('perde:') ? truncateMiddle(r, 12, 6) : r);

export default function PayrollPage() {
  const m = usePayroll();
  const p = m.phase;
  return (
    <>
      <PageHeader
        eyebrow="Payroll"
        title="Pay the whole team, privately"
        description="One transaction, one action per person. Each recipient gets a fresh account; the batch shows who paid, never who was paid."
      />
      {p.phase === 'input' && <InputStep m={m} />}
      {p.phase === 'review' && <ReviewStep m={m} />}
      {p.phase === 'submitting' && (
        <Card aria-busy="true">
          <CardHeader title={`Sending ${m.validCount} payments`} description="A single transaction with one send action per row." />
          <Timeline
            steps={[
              { id: 'derive', label: `Derived ${m.validCount} fresh accounts`, status: 'done' },
              { id: 'sign', label: 'Signed in your browser', status: 'done' },
              { id: 'final', label: 'Waiting for the transaction to finalise', status: 'active' },
            ]}
          />
        </Card>
      )}
      {p.phase === 'done' && <DoneStep results={p.results} txHash={p.txHash} onReset={m.reset} />}
      {p.phase === 'error' && (
        <Card>
          <Callout tone="danger" title="Batch not sent" role="alert">
            {p.message}
          </Callout>
          <Button className="mt-5" variant="secondary" icon={<ArrowLeft aria-hidden className="size-4" />} onClick={m.back}>
            Back to recipients
          </Button>
        </Card>
      )}
    </>
  );
}

function InputStep({ m }: { m: PayrollModel }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const blocked = m.validCount === 0 || m.invalidCount > 0;
  return (
    <div className="space-y-5">
      <Card>
        <Field
          label="Recipients (CSV)"
          hint={
            <>
              One per line: <span className="font-mono text-fg-muted">recipient,amount,memo</span>. Recipient is a perde: address or a
              registered NEAR name. Up to {m.maxRows} rows.
            </>
          }
          aside={
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) m.loadFile(f);
                  e.target.value = '';
                }}
              />
              <Button variant="ghost" size="sm" icon={<FileUp aria-hidden className="size-4" />} onClick={() => fileRef.current?.click()}>
                Upload file
              </Button>
            </>
          }
        >
          {(p) => (
            <Textarea
              {...p}
              mono
              rows={6}
              value={m.csv}
              onChange={(e) => m.setCsv(e.target.value)}
              placeholder={'recipient,amount,memo\nalice.testnet,12.5,November'}
              spellCheck={false}
              className="text-[12.5px]!"
            />
          )}
        </Field>
      </Card>

      {m.rows.length === 0 ? (
        <Card tone="outline">
          <EmptyState title="No rows yet">Paste CSV above or upload a file. Rows are checked as you type.</EmptyState>
        </Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-fg-faint">Checked rows</h2>
            <div className="flex gap-2">
              <Badge tone="success" dot>
                {m.validCount} ready
              </Badge>
              {m.invalidCount > 0 && (
                <Badge tone="danger" dot>
                  {m.invalidCount} to fix
                </Badge>
              )}
            </div>
          </div>
          <RowList rows={m.rows} />
          <div className="flex flex-col gap-4 border-t border-line bg-surface-2/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[13px] text-fg-muted">Total</span>
              <Amount yocto={m.totalYocto} size="lg" />
            </div>
            <div className="flex flex-col items-start gap-1.5 sm:items-end">
              <Button onClick={m.review} disabled={blocked}>
                Review batch
              </Button>
              {m.invalidCount > 0 && <p className="text-[12.5px] text-fg-faint">Fix {m.invalidCount} row{m.invalidCount > 1 ? 's' : ''} to continue.</p>}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function RowList({ rows }: { rows: PayrollRow[] }) {
  return (
    <ul aria-label="CSV rows">
      {rows.map((r) => (
        <li
          key={r.line}
          className={cn(
            'grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 border-t border-line px-5 py-3 first:border-t-0 sm:items-center',
            r.error && 'bg-danger/[0.04]',
          )}
        >
          <span className="num pt-0.5 font-mono text-[12px] text-fg-faint sm:pt-0">L{r.line}</span>
          <div className="min-w-0">
            <p className="truncate font-mono text-[13px] text-fg" title={r.recipient}>
              {recipientLabel(r.recipient) || <span className="text-fg-faint">(empty)</span>}
            </p>
            {r.error ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-danger">
                <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
                {r.error}
              </p>
            ) : (
              <p className="mt-0.5 truncate text-[12.5px] text-fg-faint">
                {r.kind === 'meta' ? 'meta-address' : 'registered name'}
                {r.memo && ` · ${r.memo}`}
              </p>
            )}
          </div>
          <span className="num whitespace-nowrap pt-0.5 text-right font-mono text-[13px] text-fg sm:pt-0">
            {r.amountYocto ? <Amount yocto={r.amountYocto} size="sm" /> : <span className="text-fg-faint">{r.amountInput || '—'}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ReviewStep({ m }: { m: PayrollModel }) {
  const total = BigInt(m.totalYocto) + BigInt(m.feeYocto);
  return (
    <Card>
      <CardHeader title="Review batch" description="Everything below goes out in one transaction. If any action fails, the whole batch is reverted." />
      <dl className="divide-y divide-line border-y border-line">
        <DataRow label="Paying from">{m.sender ? <AddressChip value={m.sender.accountId} size="sm" copy={false} /> : '—'}</DataRow>
        <DataRow label="Recipients">{m.validCount}</DataRow>
        <DataRow label="Amounts">
          <Amount yocto={m.totalYocto} />
        </DataRow>
        <DataRow label={`Announcement fees (${m.validCount} ×)`}>
          <Amount yocto={m.feeYocto} className="text-fg-muted" />
        </DataRow>
        <DataRow label="Total deposit">
          <Amount yocto={total.toString()} size="lg" />
        </DataRow>
      </dl>
      <div className="mt-6 flex flex-wrap justify-between gap-2">
        <Button variant="ghost" icon={<ArrowLeft aria-hidden className="size-4" />} onClick={m.back}>
          Back
        </Button>
        <Button onClick={m.submit}>Send {m.validCount} payments</Button>
      </div>
    </Card>
  );
}

function DoneStep({ results, txHash, onReset }: { results: PayrollResult[]; txHash: string; onReset: () => void }) {
  const sent = results.filter((r) => r.status === 'sent').length;
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-start gap-3">
          <CircleCheck aria-hidden className="mt-1 size-5 shrink-0 text-success" />
          <div className="min-w-0">
            <h2 className="text-display text-[32px] text-fg">
              {sent} of {results.length} paid in one transaction.
            </h2>
            <div className="mt-3">
              <TxLink hash={txHash} />
            </div>
          </div>
        </div>
      </Card>
      <Card padded={false} className="overflow-hidden">
        <h2 className="border-b border-line px-5 py-3.5 text-[11px] font-medium uppercase tracking-[0.16em] text-fg-faint">Per-row results</h2>
        <ul>
          {results.map((r) => (
            <li key={r.line} className="grid gap-2 border-t border-line px-5 py-3.5 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-5">
              <div className="flex min-w-0 items-center gap-2">
                {r.status === 'sent' ? <CircleCheck aria-hidden className="size-4 shrink-0 text-success" /> : <XCircle aria-hidden className="size-4 shrink-0 text-danger" />}
                <span className="truncate font-mono text-[13px] text-fg">{recipientLabel(r.recipient)}</span>
                <span className="sr-only">{r.status}</span>
              </div>
              {r.stealthAccount ? <AddressChip value={r.stealthAccount} size="sm" head={4} tail={4} label="Fresh account" /> : <span className="text-[12.5px] text-danger">{r.message}</span>}
              <Amount yocto={r.amountYocto} size="sm" className="sm:justify-self-end" />
            </li>
          ))}
        </ul>
      </Card>
      <div className="flex justify-end">
        <Button variant="secondary" onClick={onReset}>
          New batch
        </Button>
      </div>
    </div>
  );
}
