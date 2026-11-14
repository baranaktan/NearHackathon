import { Eye, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { PageHeader } from '../../app-shell/PageHeader';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Field, Textarea } from '../../ui/Field';
import { AddressChip } from '../../ui/AddressChip';
import { Callout, EmptyState, Skeleton } from '../../ui/Feedback';
import { Spinner } from '../../ui/Spinner';
import { Amount } from '../../components/Amount';
import { formatDateTime } from '../../lib/format-date';
import { truncateMiddle } from '../../lib/near-format';
import { useAudit } from './useAudit';
import type { AuditEntry } from './types';

const STAGE = { announcements: 'Reading announcements', invoices: 'Checking invoice accounts', balances: 'Reading live balances' } as const;

export default function AuditPage() {
  const m = useAudit();
  const s = m.state;
  return (
    <>
      <PageHeader
        eyebrow="Audit"
        title="Read-only view for auditors"
        description="Paste a viewing key to list the payments it can see. A viewing key can find payments and read balances — it cannot spend, sign or claim anything."
      />
      <Card>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            m.run();
          }}
        >
          <Field
            label="Viewing key"
            error={m.keyError}
            hint="Starts with perdeview:. It stays in this tab and is not stored."
            aside={
              m.canUseOwnKey ? (
                <button
                  type="button"
                  onClick={m.fillOwnKey}
                  className="inline-flex min-h-8 items-center gap-1.5 text-[13px] text-fg-muted underline decoration-line-strong underline-offset-4 hover:text-fg hover:decoration-brass"
                >
                  <KeyRound aria-hidden className="size-3.5" />
                  Use my viewing key
                </button>
              ) : undefined
            }
          >
            {(p) => (
              <Textarea
                {...p}
                mono
                rows={2}
                value={m.keyInput}
                onChange={(e) => m.setKeyInput(e.target.value)}
                placeholder="perdeview:…"
                spellCheck={false}
                autoComplete="off"
                className="text-[12.5px]!"
              />
            )}
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[12.5px] text-fg-faint">
              <Lock aria-hidden className="size-3.5" />
              Read-only: no spend key is involved.
            </p>
            <div className="flex gap-2">
              {s.status !== 'idle' && (
                <Button variant="ghost" onClick={m.clear}>
                  Clear
                </Button>
              )}
              <Button type="submit" loading={s.status === 'scanning'} loadingLabel="Scanning" disabled={!m.keyInput.trim() || !!m.keyError} icon={<Eye aria-hidden className="size-4" />}>
                Open read-only view
              </Button>
            </div>
          </div>
        </form>
      </Card>

      <div className="mt-6" aria-live="polite">
        {s.status === 'scanning' && (
          <Card aria-busy="true">
            <p className="flex items-center gap-2 text-[13.5px] text-fg-muted">
              <Spinner size={14} /> {STAGE[s.stage]}
              {s.stage === 'announcements' && s.total !== null ? ` · ${s.scanned} of ${s.total}` : ''}…
            </p>
            <div className="mt-5 space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </Card>
        )}
        {s.status === 'error' && (
          <Callout tone="danger" title="Couldn’t complete the scan" role="alert" action={<Button size="sm" variant="secondary" onClick={m.run}>Try again</Button>}>
            {s.message}
          </Callout>
        )}
        {s.status === 'done' && (
          <div className="space-y-4">
            <Card padded={false} className="overflow-hidden">
              <div className="grid gap-4 border-b border-line px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end sm:px-6">
                <div className="min-w-0">
                  <p className="text-[12px] text-fg-muted">Incoming to meta-address</p>
                  <p className="mt-1 truncate font-mono text-[13px] text-fg" title={s.metaAddress}>
                    {truncateMiddle(s.metaAddress, 16, 8)}
                  </p>
                  <p className="mt-1 text-[12px] text-fg-faint">{s.scanned} announcements read</p>
                </div>
                <div className="sm:text-right">
                  <p className="text-[12px] text-fg-muted">{s.entries.length} payments · received</p>
                  <Amount yocto={s.announcedYocto} size="lg" className="mt-1" />
                </div>
                <div className="sm:text-right">
                  <p className="text-[12px] text-fg-muted">Still held</p>
                  <Amount yocto={s.heldYocto} size="lg" className="mt-1" />
                </div>
              </div>
              {s.entries.length === 0 ? (
                <EmptyState title="No payments for this key">The key is valid, but no announcement or invoice account matches it yet.</EmptyState>
              ) : (
                <table className="w-full text-left">
                  <caption className="sr-only">Incoming payments visible to this viewing key</caption>
                  <thead className="max-sm:sr-only">
                    <tr className="text-[10.5px] uppercase tracking-[0.16em] text-fg-faint">
                      <th scope="col" className="px-5 py-3 font-medium sm:px-6">Account</th>
                      <th scope="col" className="px-3 py-3 font-medium">Received</th>
                      <th scope="col" className="px-3 py-3 font-medium">Status</th>
                      <th scope="col" className="px-5 py-3 text-right font-medium sm:px-6">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.entries.map((e) => (
                      <EntryRow key={e.stealthAccount} e={e} />
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <Callout tone="success" title="What this key could not do">
              <span className="inline-flex items-start gap-2">
                <ShieldCheck aria-hidden className="mt-1 size-3.5 shrink-0 text-success" />
                Nothing above was signed. Spending a stealth account needs its spend key (k_spend + tweak), which a viewing key does not contain. Invoice amounts are
                current balances, since invoices have no announcement.
              </span>
            </Callout>
          </div>
        )}
      </div>
    </>
  );
}

function EntryRow({ e }: { e: AuditEntry }) {
  return (
    <tr className="border-t border-line max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-3 max-sm:gap-y-2 max-sm:px-5 max-sm:py-4">
      <td className="px-5 py-3.5 max-sm:col-span-2 max-sm:p-0 sm:px-6">
        <AddressChip value={e.stealthAccount} size="sm" explorer label="Stealth account" />
      </td>
      <td className="px-3 py-3.5 text-[13px] text-fg-muted max-sm:p-0">
        {e.source === 'invoice' ? (
          <span>Invoice #{e.invoiceIndex}</span>
        ) : (
          <>
            {e.timestampMs !== null ? formatDateTime(e.timestampMs) : '—'} <span className="text-fg-faint">· #{e.announcementIndex}</span>
          </>
        )}
      </td>
      <td className="px-3 py-3.5 max-sm:order-last max-sm:p-0">
        {e.status === 'held' && (
          <Badge tone="success" dot>
            Held
          </Badge>
        )}
        {e.status === 'moved' && <Badge>{e.exists ? 'Moved out' : 'Moved out · account closed'}</Badge>}
        {e.status === 'partial' && (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <Badge tone="warn">Moved out</Badge>
            <span className="text-[12px] text-fg-faint">
              <Amount yocto={e.balanceYocto} size="sm" maxFractionDigits={6} /> left
            </span>
          </span>
        )}
      </td>
      <td className="px-5 py-3.5 text-right max-sm:p-0 sm:px-6">
        <Amount yocto={e.amountYocto} size="sm" />
      </td>
    </tr>
  );
}
