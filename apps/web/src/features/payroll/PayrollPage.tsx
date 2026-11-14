import { useRef } from 'react';
import { ArrowLeft, CircleCheck, Download, FileUp, Sparkles, TriangleAlert, XCircle } from 'lucide-react';
import { PageHeader } from '../../app-shell/PageHeader';
import { Card, CardHeader, DataRow } from '../../ui/Card';
import { Button, ButtonLink } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Field, Textarea } from '../../ui/Field';
import { AddressChip } from '../../ui/AddressChip';
import { Callout, EmptyState } from '../../ui/Feedback';
import { Timeline, type StepStatus } from '../../ui/Stepper';
import { TxLink } from '../../ui/TxLink';
import { Spinner } from '../../ui/Spinner';
import { Amount } from '../../components/Amount';
import { APP_CONFIG } from '../../config';
import { cn } from '../../lib/cn';
import { truncateMiddle } from '../../lib/near-format';
import { usePayroll, SAMPLE_AMOUNT } from './usePayroll';
import { downloadText, receiptsCsv, receiptsJson } from './batch';
import type { CheckedRow, PayrollModel, PayrollPhase, PayrollResult } from './types';

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
      {p.phase === 'submitting' && <Submitting m={m} phase={p} />}
      {p.phase === 'done' && <DoneStep m={m} phase={p} />}
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
  const blocked = m.validCount === 0 || m.invalidCount > 0 || m.resolvingCount > 0 || !m.sender || !!m.balanceProblem;
  return (
    <div className="space-y-5">
      {!m.sender && (
        <Callout tone="warn" title="No account to pay from" action={<ButtonLink to="/app/settings" size="sm" variant="secondary">Get a demo wallet</ButtonLink>}>
          Payroll is paid by your demo wallet.
        </Callout>
      )}
      <Card>
        <Field
          label="Recipients (CSV)"
          hint={
            <>
              One per line: <span className="font-mono text-fg-muted">recipient,amount,memo</span>. Recipient is a perde: address or a registered NEAR name. Memos stay in
              this browser. Up to {m.maxRows} rows; {m.maxPerTx} payments fit in one transaction.
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
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button variant="secondary" size="sm" icon={<Sparkles aria-hidden className="size-4" />} onClick={m.loadSample} disabled={!m.canLoadSample}>
            Load sample
          </Button>
          <p className="min-w-0 flex-1 text-[12.5px] text-fg-faint">
            {m.canLoadSample
              ? `Two rows of ${SAMPLE_AMOUNT} NEAR to your own meta-address, so you can find both payments in your Inbox afterwards.`
              : 'The sample pays your own meta-address — create an identity on Receive first.'}
          </p>
        </div>
      </Card>

      {m.rows.length === 0 ? (
        <Card tone="outline">
          <EmptyState title="No rows yet">Paste CSV above, upload a file, or load the sample. Rows are checked as you type.</EmptyState>
        </Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-fg-faint">Checked rows</h2>
            <div className="flex flex-wrap gap-2">
              <Badge tone="success" dot>
                {m.validCount} ready
              </Badge>
              {m.resolvingCount > 0 && (
                <Badge dot pulse>
                  {m.resolvingCount} looking up
                </Badge>
              )}
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
              {m.txCount > 1 && <span className="text-[12.5px] text-fg-faint">in {m.txCount} transactions</span>}
            </div>
            <div className="flex flex-col items-start gap-1.5 sm:items-end">
              <Button onClick={m.review} disabled={blocked}>
                Review batch
              </Button>
              {m.invalidCount > 0 && <p className="text-[12.5px] text-fg-faint">Fix or remove {m.invalidCount} row{m.invalidCount > 1 ? 's' : ''} to continue.</p>}
            </div>
          </div>
          {m.balanceProblem && (
            <div className="border-t border-line px-5 py-3">
              <p className="text-[13px] text-danger" role="alert">
                {m.balanceProblem}
              </p>
            </div>
          )}
        </Card>
      )}
      {m.limitsError && (
        <Callout tone="danger" role="alert" title="Couldn’t read the Perde contract">
          {m.limitsError}
        </Callout>
      )}
    </div>
  );
}

function RowList({ rows }: { rows: CheckedRow[] }) {
  return (
    <ul aria-label="CSV rows">
      {rows.map((r) => (
        <li
          key={r.line}
          className={cn(
            'grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 border-t border-line px-5 py-3 first:border-t-0 sm:items-center',
            r.status === 'invalid' && 'bg-danger/[0.04]',
          )}
        >
          <span className="num pt-0.5 font-mono text-[12px] text-fg-faint sm:pt-0">L{r.line}</span>
          <div className="min-w-0">
            <p className="truncate font-mono text-[13px] text-fg" title={r.recipient}>
              {recipientLabel(r.recipient) || <span className="text-fg-faint">(empty)</span>}
            </p>
            {r.status === 'invalid' ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-danger">
                <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
                {r.problem}
              </p>
            ) : r.status === 'resolving' ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-fg-muted">
                <Spinner size={12} /> Looking up the name…
              </p>
            ) : (
              <p className="mt-0.5 truncate text-[12.5px] text-fg-faint">
                {r.kind === 'meta' ? 'meta-address' : `registered name → ${truncateMiddle(r.metaAddress ?? '', 10, 4)}`}
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
      <CardHeader
        title="Review batch"
        description={
          m.txCount === 1
            ? 'Everything below goes out in one transaction. If any action fails, the whole batch is reverted.'
            : `${m.validCount} payments need ${m.txCount} transactions (${m.maxPerTx} per transaction). Each transaction is all-or-nothing; they are sent one after another.`
        }
      />
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
        <DataRow label="Gas, at most">
          <span className="text-fg-muted">
            <Amount yocto={m.gasYocto} size="sm" /> <span className="text-[12.5px]">· unused part refunded</span>
          </span>
        </DataRow>
      </dl>
      {m.balanceProblem && (
        <Callout tone="danger" role="alert" className="mt-4">
          {m.balanceProblem}
        </Callout>
      )}
      <div className="mt-6 flex flex-wrap justify-between gap-2">
        <Button variant="ghost" icon={<ArrowLeft aria-hidden className="size-4" />} onClick={m.back}>
          Back
        </Button>
        <Button onClick={m.submit} disabled={!!m.balanceProblem}>
          Send {m.validCount} payments
        </Button>
      </div>
    </Card>
  );
}

function Submitting({ m, phase }: { m: PayrollModel; phase: Extract<PayrollPhase, { phase: 'submitting' }> }) {
  const order = ['sign', 'broadcast', 'confirm'] as const;
  const at = order.indexOf(phase.step);
  const st = (i: number): StepStatus => (i < at ? 'done' : i === at ? 'active' : 'pending');
  return (
    <Card aria-busy="true">
      <CardHeader
        title={`Sending ${m.validCount} payments`}
        description={phase.of === 1 ? 'A single transaction with one send action per row.' : `Transaction ${phase.tx} of ${phase.of}.`}
      />
      <Timeline
        label="Batch progress"
        steps={[
          { id: 'sign', label: 'Fresh accounts derived and signed in your browser', status: st(0) },
          { id: 'broadcast', label: 'Broadcast and executed on NEAR testnet', status: st(1) },
          { id: 'confirm', label: 'Announcements read back from the contract', status: st(2) },
        ]}
      />
    </Card>
  );
}

function DoneStep({ m, phase }: { m: PayrollModel; phase: Extract<PayrollPhase, { phase: 'done' }> }) {
  const { results, txs, partialError } = phase;
  const sent = results.filter((r) => r.status === 'sent').length;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-start gap-3">
          {partialError ? <TriangleAlert aria-hidden className="mt-1 size-5 shrink-0 text-warn" /> : <CircleCheck aria-hidden className="mt-1 size-5 shrink-0 text-success" />}
          <div className="min-w-0">
            <h2 className="text-display text-[32px] text-fg">
              {sent} of {results.length} paid in {txs.length === 1 ? 'one transaction' : `${txs.length} transactions`}.
            </h2>
            <div className="mt-3 flex flex-col gap-1">
              {txs.map((h, i) => (
                <TxLink key={h} hash={h} label={txs.length > 1 ? `Transaction ${i + 1}` : 'View transaction'} />
              ))}
            </div>
            {partialError && (
              <Callout tone="warn" role="alert" className="mt-4">
                {partialError}
              </Callout>
            )}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
          <Button variant="secondary" size="sm" icon={<Download aria-hidden className="size-4" />} onClick={() => downloadText(`perde-payroll-${stamp}.csv`, receiptsCsv(results), 'text/csv')}>
            Receipts (CSV)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Download aria-hidden className="size-4" />}
            onClick={() =>
              downloadText(
                `perde-payroll-${stamp}.json`,
                receiptsJson(results, { network: APP_CONFIG.networkId, contractId: APP_CONFIG.contractId, senderId: m.sender?.accountId ?? '', createdAt: new Date().toISOString() }),
                'application/json',
              )
            }
          >
            Receipts (JSON)
          </Button>
          <p className="basis-full text-[12.5px] text-fg-faint">Generated in your browser. Each receipt proves one payment to one recipient — share it only with them or their auditor.</p>
        </div>
      </Card>
      <Card padded={false} className="overflow-hidden">
        <h2 className="border-b border-line px-5 py-3.5 text-[11px] font-medium uppercase tracking-[0.16em] text-fg-faint">Per-row results</h2>
        <ul>
          {results.map((r) => (
            <ResultRow key={r.line} r={r} />
          ))}
        </ul>
      </Card>
      <div className="flex flex-wrap justify-end gap-2">
        <ButtonLink to="/app/inbox" variant="ghost">
          Open Inbox
        </ButtonLink>
        <Button variant="secondary" onClick={m.reset}>
          New batch
        </Button>
      </div>
    </div>
  );
}

function ResultRow({ r }: { r: PayrollResult }) {
  return (
    <li className="grid gap-2 border-t border-line px-5 py-3.5 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-5">
      <div className="flex min-w-0 items-center gap-2">
        {r.status === 'sent' ? <CircleCheck aria-hidden className="size-4 shrink-0 text-success" /> : <XCircle aria-hidden className="size-4 shrink-0 text-danger" />}
        <span className="truncate font-mono text-[13px] text-fg">{recipientLabel(r.recipient)}</span>
        <span className="sr-only">{r.status === 'sent' ? 'sent' : 'not sent'}</span>
        {r.announcementIndex !== null && <Badge className="shrink-0">#{r.announcementIndex}</Badge>}
      </div>
      {r.stealthAccount ? (
        <AddressChip value={r.stealthAccount} size="sm" head={4} tail={4} label="Fresh account" explorer />
      ) : (
        <span className="text-[12.5px] text-danger">Not sent</span>
      )}
      <Amount yocto={r.amountYocto} size="sm" className="sm:justify-self-end" />
    </li>
  );
}
