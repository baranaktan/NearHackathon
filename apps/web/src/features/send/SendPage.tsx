import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, Check, CircleCheck, RotateCcw, UserRound } from 'lucide-react';
import { m } from 'motion/react';
import { PageHeader } from '../../app-shell/PageHeader';
import { Card, CardHeader, DataRow } from '../../ui/Card';
import { Button, ButtonLink } from '../../ui/Button';
import { Field, Input, Textarea } from '../../ui/Field';
import { AmountInput } from '../../ui/AmountInput';
import { AddressChip, VeilMark } from '../../ui/AddressChip';
import { Callout, Skeleton } from '../../ui/Feedback';
import { Stepper, type StepStatus } from '../../ui/Stepper';
import { TxProgress } from '../../components/TxProgress';
import { TxLink } from '../../ui/TxLink';
import { CopyButton } from '../../ui/CopyButton';
import { Spinner } from '../../ui/Spinner';
import { Amount } from '../../components/Amount';
import { ChainViewButton, ChainViewSheet } from '../../components/ChainView';
import { Ledger } from '../../components/Ledger';
import { formatDateTime } from '../../lib/format-date';
import { formatYocto, truncateMiddle } from '../../lib/near-format';
import type { SentRecord } from '../../state/schema';
import { useSend } from './useSend';
import { maxSendable } from './logic';
import type { SendModel, SendPhase, SendQuote, SubmitStep } from './types';

const short = (label: string) =>
  label.startsWith('perde:') ? truncateMiddle(label, 12, 6) : /^[0-9a-f]{64}$/.test(label) ? `invoice ${truncateMiddle(label, 6, 6)}` : label;

/** Prefill from `?to=` / `?amount=` (deep links from the guided demo). Values are validated like typed input. */
function usePrefill() {
  const [params] = useSearchParams();
  const to = params.get('to') ?? undefined;
  const amount = params.get('amount') ?? undefined;
  return { initialRecipient: to?.slice(0, 200), initialAmount: amount && /^\d+(\.\d{1,24})?$/.test(amount) ? amount : undefined };
}

export default function SendPage() {
  const model = useSend(usePrefill());
  const [chainOpen, setChainOpen] = useState(false);
  const p = model.phase;
  const quote = 'quote' in p ? p.quote : null;
  const record: SentRecord | null = p.phase === 'success' ? p.record : (model.history.find((r) => r.kind !== 'invoice') ?? null);

  return (
    <>
      <PageHeader
        eyebrow="Send"
        title="Pay someone privately"
        description="Pay a perde: meta-address or a registered NEAR name. The money lands in a fresh account only they can open."
        actions={<ChainViewButton onClick={() => setChainOpen(true)} />}
      />
      <FlowSteps phase={p} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <SendFlow m={model} onChainView={() => setChainOpen(true)} />
        </div>
        <aside className={model.sender ? 'min-w-0 space-y-4' : 'order-first min-w-0 space-y-4 lg:order-none'} aria-label="Payment context">
          <SenderCard m={model} />
          <ObserverPreview sender={model.sender?.accountId ?? 'your-account.testnet'} quote={quote} amountInput={model.amountInput} />
          <RecentSends history={model.history} />
        </aside>
      </div>

      <ChainViewSheet
        open={chainOpen}
        onClose={() => setChainOpen(false)}
        yourRole="sender"
        subject={record ? { kind: 'sent', record } : null}
        emptyHint="Send a payment first: the chain view then shows its real transaction and announcement."
        yourView={[
          { label: 'You paid', value: record ? <span className="font-mono">{short(record.recipientLabel)}</span> : 'Nobody yet' },
          { label: 'Fresh account for this payment', value: record ? <AddressChip value={record.stealthAccount} size="sm" /> : '—' },
          {
            label: 'Proof you can share',
            value: record?.receipt ? (
              <ButtonLink to={`/app/verify?${new URLSearchParams({ r: record.receipt }).toString()}`} variant="quiet" size="sm">
                Verify this payment’s receipt
              </ButtonLink>
            ) : (
              'A receipt lets the recipient (or anyone you give it to) verify the payment.'
            ),
          },
        ]}
      />
    </>
  );
}

/** Edit → review → submitting → success/error, shared with the public pay page. */
export function SendFlow({ m: model, onChainView, lockRecipient = false }: { m: SendModel; onChainView?: () => void; lockRecipient?: boolean }) {
  const p = model.phase;
  return (
    <>
      {p.phase === 'edit' && <EditStep m={model} lockRecipient={lockRecipient} />}
      {p.phase === 'review' && <ReviewStep quote={p.quote} m={model} />}
      {p.phase === 'submitting' && <SubmittingStep quote={p.quote} step={p.step} startedAtMs={p.startedAtMs} />}
      {p.phase === 'success' && <SuccessStep phase={p} onReset={model.reset} onChainView={onChainView} />}
      {p.phase === 'error' && (
        <Card>
          <Callout tone="danger" title="Payment not sent" role="alert">
            {p.message}
            {p.txHash && (
              <span className="mt-2 block">
                <TxLink hash={p.txHash} label="Check this transaction first" />
              </span>
            )}
          </Callout>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="secondary" icon={<ArrowLeft aria-hidden className="size-4" />} onClick={model.back}>
              Edit payment
            </Button>
            {p.quote && (
              <Button icon={<RotateCcw aria-hidden className="size-4" />} onClick={model.review}>
                Review again
              </Button>
            )}
          </div>
        </Card>
      )}
    </>
  );
}

function FlowSteps({ phase }: { phase: SendPhase }) {
  const idx = { edit: 0, review: 1, submitting: 2, success: 3, error: 1 }[phase.phase];
  const status = (i: number): StepStatus => (phase.phase === 'error' && i === 1 ? 'error' : i < idx ? 'done' : i === idx ? 'active' : 'pending');
  return (
    <Stepper
      className="mb-6"
      steps={[
        { id: 'details', label: 'Details', status: status(0) },
        { id: 'review', label: 'Review', status: status(1) },
        { id: 'sent', label: 'Sent', status: idx >= 2 ? (phase.phase === 'success' ? 'done' : 'active') : 'pending' },
      ]}
    />
  );
}

function EditStep({ m: model, lockRecipient }: { m: SendModel; lockRecipient: boolean }) {
  const r = model.recipient;
  const spendable = model.sender?.balanceYocto ? BigInt(model.sender.balanceYocto) : null;
  const limits = model.limits;
  const isSelf = r.status === 'resolved' && r.metaAddress === model.selfMetaAddress;
  return (
    <Card>
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          model.review();
        }}
      >
        <Field
          label="Recipient"
          hint={r.status === 'resolved' || lockRecipient ? undefined : 'A perde: meta-address, or a NEAR name that registered one.'}
          error={r.status === 'invalid' ? r.message : undefined}
          aside={
            model.selfMetaAddress && !lockRecipient && !isSelf ? (
              <button
                type="button"
                onClick={() => model.setRecipientInput(model.selfMetaAddress ?? '')}
                className="inline-flex min-h-8 items-center gap-1.5 text-[13px] text-fg-muted underline decoration-line-strong underline-offset-4 hover:text-fg hover:decoration-brass"
              >
                <UserRound aria-hidden className="size-3.5" />
                Pay myself
              </button>
            ) : undefined
          }
        >
          {(p) => (
            <div className="space-y-2.5">
              <Input
                {...p}
                mono
                value={model.recipientInput}
                onChange={(e) => model.setRecipientInput(e.target.value)}
                placeholder="perde:… or alice.testnet"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                readOnly={lockRecipient}
              />
              {r.status === 'resolving' && (
                <p className="flex items-center gap-2 text-[13px] text-fg-muted" role="status">
                  <Spinner size={14} /> Looking up the name in the Perde directory…
                </p>
              )}
              {r.status === 'resolved' && (
                <p className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] text-fg-muted" role="status">
                  <Check aria-hidden className="size-3.5 text-success" />
                  {isSelf ? 'Your own meta-address' : r.kind === 'name' ? 'Registered meta-address found' : 'Valid meta-address'}
                  <span className="min-w-0 truncate font-mono text-fg-faint">{truncateMiddle(r.metaAddress, 12, 6)}</span>
                </p>
              )}
            </div>
          )}
        </Field>
        <Field
          label="Amount"
          error={model.amountError}
          aside={
            model.sender ? (
              spendable !== null ? (
                <span className="num font-mono">Available {formatYocto(spendable)} NEAR</span>
              ) : (
                <Skeleton className="inline-block h-4 w-28 align-middle" />
              )
            ) : undefined
          }
          hint={
            limits
              ? `Minimum ${formatYocto(limits.minAmountYocto)} NEAR. Plus a ${formatYocto(limits.announceFeeYocto)} NEAR announcement fee and up to ${formatYocto(limits.gasReserveYocto)} NEAR gas headroom (unused gas is refunded).`
              : model.limitsError
                ? undefined
                : 'Reading the contract’s fee and minimum…'
          }
        >
          {(p) => (
            <AmountInput
              {...p}
              size="lg"
              value={model.amountInput}
              onValueChange={model.setAmountInput}
              onMax={
                spendable !== null && limits
                  ? () => model.setAmountInput(formatYocto(maxSendable(spendable, BigInt(limits.announceFeeYocto), BigInt(limits.gasReserveYocto)), { maxFractionDigits: 4, group: false }))
                  : undefined
              }
            />
          )}
        </Field>
        {model.limitsError && (
          <Callout
            tone="danger"
            role="alert"
            title="Couldn’t read the Perde contract"
            action={
              <Button size="sm" variant="secondary" icon={<RotateCcw aria-hidden className="size-4" />} onClick={model.retryLimits}>
                Try again
              </Button>
            }
          >
            {model.limitsError}
          </Callout>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <p className="text-[13px] text-fg-faint">Nothing is sent until you confirm on the next step.</p>
          <Button type="submit" disabled={!model.canReview}>
            Review payment
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ReviewStep({ quote, m: model }: { quote: SendQuote; m: SendModel }) {
  return (
    <Card>
      <CardHeader title="Review" description="Check the recipient and amount. The fresh account below was derived for this payment only — it is exactly the account that will be paid." />
      <dl className="divide-y divide-line border-y border-line">
        <DataRow label="To">
          <span className="font-mono">{short(quote.recipientLabel)}</span>
        </DataRow>
        <DataRow label="Lands in">
          <AddressChip value={quote.stealthAccount} label="Fresh account" size="sm" />
        </DataRow>
        <DataRow label="Amount">
          <Amount yocto={quote.amountYocto} />
        </DataRow>
        <DataRow label="Announcement fee">
          <Amount yocto={quote.announceFeeYocto} className="text-fg-muted" />
        </DataRow>
        <DataRow label="Total deposit" className="font-medium">
          <Amount yocto={quote.totalYocto} size="lg" />
        </DataRow>
        <DataRow label="Gas, at most">
          <span className="text-fg-muted">
            <Amount yocto={quote.gasReserveYocto} size="sm" /> <span className="text-[12.5px]">· unused part refunded</span>
          </span>
        </DataRow>
      </dl>
      <p className="mt-4 text-[13px] text-fg-faint">
        One transaction to <span className="font-mono">{model.contractId}</span>: records the announcement and transfers the amount atomically. Signed in this
        browser by your demo wallet.
      </p>
      <div className="mt-6 flex flex-wrap justify-between gap-2">
        <Button variant="ghost" icon={<ArrowLeft aria-hidden className="size-4" />} onClick={model.back}>
          Back
        </Button>
        <Button onClick={model.confirm}>Confirm and send</Button>
      </div>
    </Card>
  );
}

function SubmittingStep({ quote, step, startedAtMs }: { quote: SendQuote; step: SubmitStep; startedAtMs: number }) {
  return (
    <Card aria-busy="true">
      <CardHeader title="Sending" description={<>Paying <Amount yocto={quote.amountYocto} size="sm" /> to a fresh account.</>} />
      <TxProgress step={step} startedAtMs={startedAtMs} labels={{ confirm: 'Announcement read back from the contract' }} />
    </Card>
  );
}

function SuccessStep({ phase, onReset, onChainView }: { phase: Extract<SendPhase, { phase: 'success' }>; onReset: () => void; onChainView?: () => void }) {
  const { quote, txHash, receipt, announcementIndex } = phase;
  const verifyLink = `/app/verify?${new URLSearchParams({ r: receipt }).toString()}`;
  return (
    <Card className="overflow-hidden">
      <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="flex items-start gap-3">
          <CircleCheck aria-hidden className="mt-1 size-5 shrink-0 text-success" />
          <div className="min-w-0">
            <h2 className="text-display text-[32px] text-fg sm:text-[38px]">Paid. The curtain stays closed.</h2>
            <p className="mt-2 text-[14.5px] text-fg-muted">
              <Amount yocto={quote.amountYocto} size="sm" className="text-fg" /> is waiting for <span className="font-mono text-fg">{short(quote.recipientLabel)}</span>{' '}
              in a fresh account{announcementIndex !== null ? <> (announcement #{announcementIndex})</> : null}.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2 pl-8">
          <TxLink hash={txHash} />
          <AddressChip value={quote.stealthAccount} size="sm" explorer label="Fresh account" className="self-start" />
          {onChainView && (
            <button
              type="button"
              onClick={onChainView}
              className="self-start text-[13px] text-fg-muted underline decoration-line-strong underline-offset-4 hover:text-fg hover:decoration-brass"
            >
              What the chain sees
            </button>
          )}
        </div>
      </m.div>

      <div className="mt-7 rounded-lg border border-line bg-surface-2/50 p-4 sm:p-5">
        <Field
          label="Payment receipt"
          aside={<CopyButton value={receipt} label="Copy receipt" withText />}
          hint="Proves you paid this recipient. Whoever you give it to can check it on the Verify page; it links this one payment to the meta-address and gives no spending power."
        >
          {(p) => <Textarea {...p} mono readOnly rows={3} value={receipt} className="text-[12px]!" />}
        </Field>
      </div>

      <div className="mt-6 flex flex-wrap justify-between gap-2">
        <ButtonLink to={verifyLink} variant="ghost" iconRight={<ArrowRight aria-hidden className="size-4" />}>
          Verify this receipt
        </ButtonLink>
        <Button variant="secondary" onClick={onReset}>
          Send another
        </Button>
      </div>
    </Card>
  );
}

export function SenderCard({ m: model }: { m: SendModel }) {
  if (!model.sender)
    return (
      <Callout tone="warn" title="No account to pay from" action={<ButtonLink to="/app/settings" size="sm" variant="secondary">Get a demo wallet</ButtonLink>}>
        Create a funded testnet account in one click, or use an existing one — no wallet extension needed.
      </Callout>
    );
  return (
    <Card tone="sunken" padded={false} className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-fg-faint">Paying from · demo wallet</p>
      <div className="mt-2.5 flex min-w-0 flex-col gap-2">
        <AddressChip value={model.sender.accountId} explorer copy={false} label="Sender" size="sm" />
        {model.sender.balanceYocto !== null ? (
          <Amount yocto={model.sender.balanceYocto} size="sm" className="text-fg-muted" />
        ) : (
          <Skeleton className="h-4 w-24" />
        )}
      </div>
    </Card>
  );
}

function ObserverPreview({ sender, quote, amountInput }: { sender: string; quote: SendQuote | null; amountInput: string }) {
  return (
    <Card tone="outline" padded={false} className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-fg-faint">What everyone will see</p>
      <div className="mt-1">
        <Ledger
          rows={[
            {
              id: 'x',
              ref: 'new tx',
              from: sender,
              to: quote ? truncateMiddle(quote.stealthAccount, 4, 4) : 'fresh account',
              amount: quote ? formatYocto(quote.amountYocto) : amountInput || '—',
              highlight: 'veiled',
            },
          ]}
          layout="stacked"
        />
      </div>
      <p className="mt-1 flex items-start gap-2 text-[12.5px] leading-snug text-fg-muted">
        <VeilMark className="mt-0.5" />
        The recipient&rsquo;s name and meta-address never appear on-chain.
      </p>
    </Card>
  );
}

function RecentSends({ history }: { history: SentRecord[] }) {
  if (history.length === 0) return null;
  return (
    <Card tone="outline" padded={false} className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-fg-faint">Recently sent from this browser</p>
      <ul className="mt-2 divide-y divide-line">
        {history.map((r) => (
          <li key={r.id + r.stealthAccount} className="py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-[12.5px] text-fg">{short(r.recipientLabel)}</span>
              <Amount yocto={r.amountYocto} size="sm" />
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2 text-[12px] text-fg-faint">
              <span>
                {r.kind === 'payroll' ? 'Payroll' : r.kind === 'invoice' ? 'Invoice' : r.kind === 'onward' ? 'Paid onward' : 'Payment'} ·{' '}
                {formatDateTime(r.atMs)}
              </span>
              <TxLink hash={r.txHash} label="" className="min-h-6 text-[12px]" />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
