import { CircleCheck, CircleMinus, CircleX, Info, ShieldCheck, ShieldX } from 'lucide-react';
import { m } from 'motion/react';
import { PageHeader } from '../../app-shell/PageHeader';
import { Card, DataRow } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Field, Textarea } from '../../ui/Field';
import { AddressChip } from '../../ui/AddressChip';
import { Callout, Skeleton } from '../../ui/Feedback';
import { TxLink } from '../../ui/TxLink';
import { Amount } from '../../components/Amount';
import { cn } from '../../lib/cn';
import { formatDateTimeFull } from '../../lib/format-date';
import { truncateMiddle } from '../../lib/near-format';
import { useVerify } from './useVerify';
import type { ReceiptSummary, VerifyCheck } from './types';

export default function VerifyPage() {
  const m = useVerify();
  const s = m.state;
  return (
    <>
      <PageHeader
        eyebrow="Verify receipt"
        title="Check a payment proof"
        description="A sender’s receipt proves they paid a specific meta-address. Your browser recomputes the keys and checks the chain — no trust in the sender required."
      />
      <Card>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            m.verify();
          }}
        >
          <Field label="Receipt" error={s.status === 'invalid' ? s.message : undefined}>
            {(p) => (
              <Textarea
                {...p}
                mono
                rows={3}
                value={m.input}
                onChange={(e) => m.setInput(e.target.value)}
                placeholder="perdereceipt:…"
                spellCheck={false}
                autoComplete="off"
                className="text-[12px]!"
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            {s.status !== 'idle' && (
              <Button variant="ghost" onClick={m.clear}>
                Clear
              </Button>
            )}
            <Button type="submit" loading={s.status === 'verifying'} loadingLabel="Verifying" disabled={!m.input.trim()}>
              Verify
            </Button>
          </div>
        </form>
      </Card>

      <div className="mt-6" aria-live="polite">
        {s.status === 'verifying' && (
          <Card aria-busy="true" aria-label="Verifying receipt">
            <Skeleton className="h-8 w-56" />
            <div className="mt-6 space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </Card>
        )}
        {s.status === 'error' && (
          <Callout tone="danger" role="alert" title="Couldn’t read the chain" action={<Button size="sm" variant="secondary" onClick={m.verify}>Try again</Button>}>
            {s.message}
          </Callout>
        )}
        {s.status === 'verified' && <Result ok summary={s.summary} checks={s.checks} />}
        {s.status === 'failed' && <Result ok={false} summary={s.summary} checks={s.checks} reason={s.reason} />}
      </div>
    </>
  );
}

function Result({ ok, summary, checks, reason }: { ok: boolean; summary: ReceiptSummary | null; checks: VerifyCheck[]; reason?: string }) {
  const Icon = ok ? ShieldCheck : ShieldX;
  return (
    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <Card padded={false} className={cn('overflow-hidden', ok ? 'border-success/40' : 'border-danger/45')}>
        <div className={cn('flex items-start gap-4 px-5 py-6 sm:px-7', ok ? 'bg-success/[0.07]' : 'bg-danger/[0.07]')}>
          <Icon aria-hidden className={cn('mt-1 size-6 shrink-0', ok ? 'text-success' : 'text-danger')} />
          <div className="min-w-0">
            <h2 className="text-display text-[32px] text-fg sm:text-[36px]">{ok ? 'Verified payment' : 'Receipt does not check out'}</h2>
            <p className="mt-1.5 text-[14.5px] text-fg-muted">
              {ok
                ? 'This payment went to an account derived from the meta-address below, and its announcement is on-chain.'
                : reason}
            </p>
          </div>
        </div>
        {summary && (
          <dl className="divide-y divide-line border-t border-line px-5 sm:px-7">
            <DataRow label="Paid to meta-address">
              <span className="font-mono text-[13px]" title={summary.metaAddress}>
                {truncateMiddle(summary.metaAddress, 14, 6)}
              </span>
            </DataRow>
            <DataRow label="Stealth account">
              <AddressChip value={summary.stealthAccount} size="sm" explorer label="Stealth account" />
            </DataRow>
            {summary.amountYocto && (
              <DataRow label="Amount">
                <Amount yocto={summary.amountYocto} />
              </DataRow>
            )}
            {summary.timestampMs && <DataRow label="Time">{formatDateTimeFull(summary.timestampMs)}</DataRow>}
            {summary.txHash && (
              <DataRow label="Transaction">
                <TxLink hash={summary.txHash} label="" />
              </DataRow>
            )}
          </dl>
        )}
        <div className="border-t border-line px-5 py-5 sm:px-7">
          <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-fg-faint">What was checked</h3>
          <ul className="space-y-3">
            {checks.map((c) => {
              const CIcon = c.status === 'pass' ? CircleCheck : c.status === 'fail' ? CircleX : c.status === 'info' ? Info : CircleMinus;
              return (
                <li key={c.id} className="flex items-start gap-3">
                  <CIcon
                    aria-hidden
                    className={cn(
                      'mt-0.5 size-4 shrink-0',
                      c.status === 'pass' ? 'text-success' : c.status === 'fail' ? 'text-danger' : c.status === 'info' ? 'text-brass' : 'text-fg-faint',
                    )}
                  />
                  <div className="min-w-0">
                    <p className={cn('text-[14px]', c.status === 'skipped' ? 'text-fg-muted' : 'text-fg')}>
                      {c.label}
                      <span className="sr-only"> — {c.status}</span>
                    </p>
                    <p className="break-hex mt-0.5 font-mono text-[12px] text-fg-faint">{c.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </Card>
      {!ok && (
        <Callout tone="info" className="mt-4">
          A failed check means the receipt doesn’t prove this payment. It doesn’t say whether a payment happened some other way.
        </Callout>
      )}
    </m.div>
  );
}
