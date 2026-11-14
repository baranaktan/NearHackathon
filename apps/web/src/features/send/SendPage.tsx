import { useState } from 'react';
import { ArrowLeft, Check, CircleCheck, RotateCcw } from 'lucide-react';
import { m } from 'motion/react';
import { PageHeader } from '../../app-shell/PageHeader';
import { Card, CardHeader, DataRow } from '../../ui/Card';
import { Button, ButtonLink } from '../../ui/Button';
import { Field, Input, Textarea } from '../../ui/Field';
import { AmountInput } from '../../ui/AmountInput';
import { AddressChip, VeilMark } from '../../ui/AddressChip';
import { Callout } from '../../ui/Feedback';
import { Stepper, Timeline, type StepStatus } from '../../ui/Stepper';
import { TxLink } from '../../ui/TxLink';
import { CopyButton } from '../../ui/CopyButton';
import { Spinner } from '../../ui/Spinner';
import { Amount } from '../../components/Amount';
import { ChainViewButton, ChainViewSheet } from '../../components/ChainView';
import { Ledger } from '../../components/Ledger';
import { formatYocto, truncateMiddle } from '../../lib/near-format';
import { useSend } from './useSend';
import type { SendModel, SendPhase, SendQuote, SubmitStep } from './types';

export default function SendPage() {
  const m = useSend();
  const [chainOpen, setChainOpen] = useState(false);
  const p = m.phase;
  const quote = 'quote' in p ? p.quote : null;

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
          {p.phase === 'edit' && <EditStep m={m} />}
          {p.phase === 'review' && <ReviewStep quote={p.quote} m={m} />}
          {p.phase === 'submitting' && <SubmittingStep quote={p.quote} step={p.step} />}
          {p.phase === 'success' && <SuccessStep phase={p} onReset={m.reset} onChainView={() => setChainOpen(true)} />}
          {p.phase === 'error' && (
            <Card>
              <Callout tone="danger" title="Payment not sent" role="alert">
                {p.message}
              </Callout>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="secondary" icon={<ArrowLeft aria-hidden className="size-4" />} onClick={m.back}>
                  Edit payment
                </Button>
                {p.quote && (
                  <Button icon={<RotateCcw aria-hidden className="size-4" />} onClick={m.review}>
                    Try again
                  </Button>
                )}
              </div>
            </Card>
          )}
        </div>
        <aside className="min-w-0 space-y-4" aria-label="Payment context">
          <SenderCard m={m} />
          <ObserverPreview sender={m.sender?.accountId ?? 'your-account.testnet'} quote={quote} amountInput={m.amountInput} />
        </aside>
      </div>

      <ChainViewSheet
        open={chainOpen}
        onClose={() => setChainOpen(false)}
        yourRole="sender"
        observerRows={[
          {
            id: 'tx',
            ref: p.phase === 'success' ? truncateMiddle(p.txHash, 4, 4) : 'pending',
            from: m.sender?.accountId ?? 'you',
            to: quote ? truncateMiddle(quote.stealthAccount, 4, 4) : 'new account',
            amount: quote ? `${formatYocto(quote.amountYocto)} NEAR` : '—',
            highlight: 'veiled',
          },
        ]}
        observerNote={
          <>
            Your account called <span className="font-mono text-fg">send</span> on the Perde contract and a never-seen account
            received the funds. Nothing on-chain names the recipient.
          </>
        }
        yourView={[
          { label: 'You paid', value: quote ? <span className="font-mono">{quote.recipientLabel}</span> : 'Not chosen yet' },
          { label: 'Fresh account for this payment', value: quote ? <AddressChip value={quote.stealthAccount} size="sm" /> : 'Derived at review' },
          { label: 'Proof you can share', value: 'A receipt that lets the recipient (or anyone you give it to) verify this payment.' },
        ]}
      />
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

function EditStep({ m }: { m: SendModel }) {
  const r = m.recipient;
  const balance = m.sender ? BigInt(m.sender.balanceYocto) : 0n;
  const fee = BigInt(m.limits?.announceFeeYocto ?? '0');
  return (
    <Card>
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          m.review();
        }}
      >
        <Field
          label="Recipient"
          hint={r.status === 'resolved' ? undefined : 'A perde: meta-address, or a NEAR name that registered one.'}
          error={r.status === 'invalid' ? r.message : undefined}
        >
          {(p) => (
            <div className="space-y-2.5">
              <Input
                {...p}
                mono
                value={m.recipientInput}
                onChange={(e) => m.setRecipientInput(e.target.value)}
                placeholder="perde:… or alice.testnet"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
              {r.status === 'resolving' && (
                <p className="flex items-center gap-2 text-[13px] text-fg-muted" role="status">
                  <Spinner size={14} /> Looking up meta-address…
                </p>
              )}
              {r.status === 'resolved' && (
                <p className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] text-fg-muted" role="status">
                  <Check aria-hidden className="size-3.5 text-success" />
                  {r.kind === 'name' ? 'Registered meta-address found' : 'Valid meta-address'}
                  <span className="min-w-0 truncate font-mono text-fg-faint">{truncateMiddle(r.metaAddress, 12, 6)}</span>
                </p>
              )}
            </div>
          )}
        </Field>
        <Field
          label="Amount"
          error={m.amountError}
          aside={m.sender ? <span className="num font-mono">Balance {formatYocto(m.sender.balanceYocto)} NEAR</span> : undefined}
          hint={m.limits ? `Plus a ${formatYocto(m.limits.announceFeeYocto)} NEAR announcement fee and network gas.` : undefined}
        >
          {(p) => (
            <AmountInput
              {...p}
              size="lg"
              value={m.amountInput}
              onValueChange={m.setAmountInput}
              onMax={m.sender ? () => m.setAmountInput(formatYocto((balance - fee - 10n ** 22n > 0n ? balance - fee - 10n ** 22n : 0n).toString(), { maxFractionDigits: 4, group: false })) : undefined}
            />
          )}
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <p className="text-[13px] text-fg-faint">Nothing is sent until you confirm on the next step.</p>
          <Button type="submit" disabled={!m.canReview}>
            Review payment
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ReviewStep({ quote, m }: { quote: SendQuote; m: SendModel }) {
  return (
    <Card>
      <CardHeader title="Review" description="Check the recipient and amount. The fresh account below was derived for this payment only." />
      <dl className="divide-y divide-line border-y border-line">
        <DataRow label="To">
          <span className="font-mono">{quote.recipientLabel.startsWith('perde:') ? truncateMiddle(quote.recipientLabel, 14, 6) : quote.recipientLabel}</span>
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
      </dl>
      <p className="mt-4 text-[13px] text-fg-faint">
        One transaction to <span className="font-mono">{m.contractId ?? 'the Perde contract'}</span>: records the announcement and
        transfers the amount atomically. Gas is paid separately from your balance.
      </p>
      <div className="mt-6 flex flex-wrap justify-between gap-2">
        <Button variant="ghost" icon={<ArrowLeft aria-hidden className="size-4" />} onClick={m.back}>
          Back
        </Button>
        <Button onClick={m.confirm}>Confirm and send</Button>
      </div>
    </Card>
  );
}

const STEP_ORDER: SubmitStep[] = ['sign', 'broadcast', 'confirm'];

function SubmittingStep({ quote, step }: { quote: SendQuote; step: SubmitStep }) {
  const at = STEP_ORDER.indexOf(step);
  const st = (i: number): StepStatus => (i < at ? 'done' : i === at ? 'active' : 'pending');
  return (
    <Card aria-busy="true">
      <CardHeader title="Sending" description={<>Paying <Amount yocto={quote.amountYocto} size="sm" /> to a fresh account.</>} />
      <Timeline
        label="Transaction progress"
        steps={[
          { id: 'sign', label: 'Signed in your browser', detail: 'Your key never leaves this device.', status: st(0) },
          { id: 'broadcast', label: 'Broadcast to NEAR testnet', status: st(1) },
          { id: 'confirm', label: 'Final on-chain', detail: 'Usually about two seconds.', status: st(2) },
        ]}
      />
    </Card>
  );
}

function SuccessStep({ phase, onReset, onChainView }: { phase: Extract<SendPhase, { phase: 'success' }>; onReset: () => void; onChainView: () => void }) {
  const { quote, txHash, receipt } = phase;
  return (
    <Card className="overflow-hidden">
      <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="flex items-start gap-3">
          <CircleCheck aria-hidden className="mt-1 size-5 shrink-0 text-success" />
          <div className="min-w-0">
            <h2 className="text-display text-[32px] text-fg sm:text-[38px]">Paid. The curtain stays closed.</h2>
            <p className="mt-2 text-[14.5px] text-fg-muted">
              <Amount yocto={quote.amountYocto} size="sm" className="text-fg" /> is waiting for{' '}
              <span className="font-mono text-fg">{quote.recipientLabel.startsWith('perde:') ? truncateMiddle(quote.recipientLabel, 12, 6) : quote.recipientLabel}</span> in a
              fresh account.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 pl-8">
          <TxLink hash={txHash} />
          <button type="button" onClick={onChainView} className="text-[13px] text-fg-muted underline decoration-line-strong underline-offset-4 hover:text-fg hover:decoration-brass">
            What the chain sees
          </button>
        </div>
      </m.div>

      <div className="mt-7 rounded-lg border border-line bg-surface-2/50 p-4 sm:p-5">
        <Field
          label="Payment receipt"
          aside={<CopyButton value={receipt} label="Copy receipt" withText />}
          hint="Proves you paid this recipient. Anyone you give it to can check it on the Verify page — it reveals the recipient only to them."
        >
          {(p) => <Textarea {...p} mono readOnly rows={3} value={receipt} className="text-[12px]!" />}
        </Field>
      </div>

      <div className="mt-6 flex flex-wrap justify-between gap-2">
        <ButtonLink to="/app/verify" variant="ghost">
          Open verifier
        </ButtonLink>
        <Button variant="secondary" onClick={onReset}>
          Send another
        </Button>
      </div>
    </Card>
  );
}

function SenderCard({ m }: { m: SendModel }) {
  if (!m.sender)
    return (
      <Callout tone="warn" title="No account to pay from" action={<ButtonLink to="/app/settings" size="sm" variant="secondary">Set up demo accounts</ButtonLink>}>
        Create a funded testnet account in one click — no wallet needed.
      </Callout>
    );
  return (
    <Card tone="sunken" padded={false} className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-fg-faint">Paying from · {m.sender.source === 'demo' ? 'demo account' : 'wallet'}</p>
      <div className="mt-2.5 flex min-w-0 flex-col gap-2">
        <AddressChip value={m.sender.accountId} explorer copy={false} label="Sender" size="sm" />
        <Amount yocto={m.sender.balanceYocto} size="sm" className="text-fg-muted" />
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
