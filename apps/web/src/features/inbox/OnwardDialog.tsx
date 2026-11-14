import { ArrowLeft, Check, CircleCheck, RotateCcw, UserRound } from 'lucide-react';
import { Dialog } from '../../ui/Dialog';
import { Button } from '../../ui/Button';
import { DataRow } from '../../ui/Card';
import { Field, Input, Textarea } from '../../ui/Field';
import { AmountInput } from '../../ui/AmountInput';
import { AddressChip } from '../../ui/AddressChip';
import { Callout, Skeleton } from '../../ui/Feedback';
import { CopyButton } from '../../ui/CopyButton';
import { Spinner } from '../../ui/Spinner';
import { TxLink } from '../../ui/TxLink';
import { Amount } from '../../components/Amount';
import { TxProgress } from '../../components/TxProgress';
import { formatYocto, truncateMiddle } from '../../lib/near-format';
import { DUST_FLOOR_YOCTO } from './onward';
import { useOnward, type OnwardModel, type OnwardQuote } from './useOnward';
import type { FoundPayment, InboxModel } from './types';

const label = (q: OnwardQuote) => (q.isSelf ? 'yourself' : q.recipientLabel.startsWith('perde:') ? truncateMiddle(q.recipientLabel, 12, 6) : q.recipientLabel);

/**
 * "Pay someone from here": the stealth account pays a Perde `send` itself,
 * so the money moves to a fresh account without touching a named account.
 */
export function OnwardDialog({ m, payment, onClose, onSweep }: { m: InboxModel; payment: FoundPayment | null; onClose: () => void; onSweep: (p: FoundPayment) => void }) {
  const o = useOnward(m, payment);
  const p = o.phase;
  const title =
    p.phase === 'sending' ? 'Paying onward' : p.phase === 'done' ? 'Paid onward' : p.phase === 'error' ? 'Payment not sent' : 'Pay someone from this account';
  const left = p.phase === 'done' && p.settlement ? p.settlement.leftYocto : null;

  return (
    <Dialog
      open={!!payment}
      onClose={onClose}
      title={title}
      description={
        p.phase === 'form' || p.phase === 'review'
          ? 'This stealth account pays directly: the recipient gets a fresh account and a new announcement, and none of your named accounts appear in the transaction.'
          : undefined
      }
      footer={
        <>
          {p.phase === 'form' && (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={!o.canReview} onClick={o.review}>
                Review payment
              </Button>
            </>
          )}
          {p.phase === 'review' && (
            <>
              <Button variant="ghost" icon={<ArrowLeft aria-hidden className="size-4" />} onClick={o.back}>
                Back
              </Button>
              <Button onClick={o.confirm}>Confirm and pay</Button>
            </>
          )}
          {p.phase === 'sending' && (
            <p className="mr-auto flex items-center gap-2 text-[13px] text-fg-muted">
              <Spinner size={14} /> You can close this — the payment keeps going and a notice appears when it lands.
            </p>
          )}
          {p.phase === 'done' && (
            <>
              {payment && left !== null && left > DUST_FLOOR_YOCTO && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    onClose();
                    onSweep(payment);
                  }}
                >
                  Sweep the remainder…
                </Button>
              )}
              <Button onClick={onClose}>Done</Button>
            </>
          )}
          {p.phase === 'error' && (
            <>
              <Button variant="ghost" icon={<ArrowLeft aria-hidden className="size-4" />} onClick={o.back}>
                Edit payment
              </Button>
              <Button icon={<RotateCcw aria-hidden className="size-4" />} onClick={o.review}>
                Review again
              </Button>
            </>
          )}
        </>
      }
    >
      {payment && p.phase === 'form' && <FormStep o={o} m={m} payment={payment} />}
      {payment && p.phase === 'review' && <ReviewStep quote={p.quote} payment={payment} />}
      {p.phase === 'sending' && (
        <div aria-busy="true" className="space-y-4">
          <p className="text-[14px] text-fg-muted">
            Paying <Amount yocto={p.quote.amountYocto} size="sm" className="text-fg" /> to {label(p.quote)} from a stealth account.
          </p>
          <TxProgress
            step={p.step}
            startedAtMs={p.startedAtMs}
            labels={{ sign: 'Signed with the stealth account’s own key', confirm: 'New announcement and what stayed behind read back' }}
          />
        </div>
      )}
      {p.phase === 'done' && <DoneStep phase={p} />}
      {p.phase === 'error' && (
        <Callout tone="danger" title="Nothing was paid onward" role="alert">
          {p.message}
          {p.txHash && (
            <span className="mt-2 block">
              <TxLink hash={p.txHash} label="Check this transaction first" />
            </span>
          )}
        </Callout>
      )}
    </Dialog>
  );
}

function FromRow({ payment, balance }: { payment: FoundPayment; balance: bigint | null }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-line bg-surface-2/50 px-3.5 py-3">
      <AddressChip value={payment.stealthAccount} size="sm" label="Paying from (stealth account)" />
      <span className="text-[13px] text-fg-muted">
        holds {balance !== null ? <Amount yocto={balance} size="sm" className="text-fg" maxFractionDigits={5} /> : <Skeleton className="inline-block h-4 w-20 align-middle" />}
      </span>
    </div>
  );
}

function FormStep({ o, m, payment }: { o: OnwardModel; m: InboxModel; payment: FoundPayment }) {
  const r = o.recipient;
  const limits = o.limits;
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        o.review();
      }}
    >
      <FromRow payment={payment} balance={o.balance} />
      {limits && !limits.canPay && (
        <Callout tone="warn" title="Too little here to pay onward">
          {limits.reason} You can still claim it.
        </Callout>
      )}
      <Field
        label="Recipient"
        hint={r.status === 'resolved' ? undefined : 'A perde: meta-address, or a NEAR name that registered one.'}
        error={r.status === 'invalid' ? r.message : undefined}
        aside={
          m.selfMetaAddress && !o.isSelf ? (
            <button
              type="button"
              onClick={() => o.setRecipientInput(m.selfMetaAddress ?? '')}
              className="inline-flex min-h-8 items-center gap-1.5 text-[13px] text-fg-muted underline decoration-line-strong underline-offset-4 hover:text-fg hover:decoration-brass"
            >
              <UserRound aria-hidden className="size-3.5" />
              My own address
            </button>
          ) : undefined
        }
      >
        {(fp) => (
          <div className="space-y-2.5">
            <Input
              {...fp}
              mono
              value={o.recipientInput}
              onChange={(e) => o.setRecipientInput(e.target.value)}
              placeholder="perde:… or alice.testnet"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            {r.status === 'resolving' && (
              <p className="flex items-center gap-2 text-[13px] text-fg-muted" role="status">
                <Spinner size={14} /> Looking up the name in the Perde directory…
              </p>
            )}
            {r.status === 'resolved' && (
              <p className="flex min-w-0 flex-wrap items-center gap-2 text-[13px] text-fg-muted" role="status">
                <Check aria-hidden className="size-3.5 text-success" />
                {o.isSelf ? 'Your own meta-address: it shows up in this Inbox as a new payment' : r.kind === 'name' ? 'Registered meta-address found' : 'Valid meta-address'}
              </p>
            )}
          </div>
        )}
      </Field>
      <Field
        label="Amount"
        error={o.amountError}
        aside={limits?.canPay ? <span className="num font-mono">Up to {formatYocto(limits.maxYocto, { maxFractionDigits: 5 })} NEAR</span> : undefined}
      >
        {(fp) => <AmountInput {...fp} value={o.amountInput} onValueChange={o.setAmountInput} onMax={o.sendAll} maxLabel="Send all" />}
      </Field>
      <div className="rounded-lg border border-line px-4 py-3 text-[13px]" aria-live="polite">
        {o.preview ? (
          <div className="space-y-1.5">
            <Line label="Recipient receives" yocto={o.preview.amountYocto} strong />
            <Line label="Announcement fee" yocto={o.preview.announceFeeYocto} />
            <Line label="Gas reserved up front (the unused part is refunded here)" yocto={o.preview.gasReserveYocto} />
            <Line label="Stays in this account, at least" yocto={o.preview.staysAtLeastYocto} />
          </div>
        ) : (
          <p className="text-fg-faint">
            {m.onwardTerms ? 'Enter a recipient and an amount to see exactly what moves and what stays.' : 'Reading the contract’s fee and the gas price…'}
          </p>
        )}
      </div>
      <p className="text-[12.5px] leading-relaxed text-fg-faint">
        NEAR reserves the payment’s gas up front and refunds what it didn’t use to this account a moment later, so even “Send all” leaves a little behind. You’ll
        see the exact amount afterwards.
      </p>
    </form>
  );
}

function Line({ label, yocto, strong = false }: { label: string; yocto: bigint; strong?: boolean }) {
  return (
    <p className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 ${strong ? 'text-fg' : 'text-fg-muted'}`}>
      <span className="min-w-0">{label}</span>
      <Amount yocto={yocto} size="sm" maxFractionDigits={5} />
    </p>
  );
}

function SettleRow({ label, yocto, strong = false }: { label: string; yocto: bigint; strong?: boolean }) {
  return (
    <div className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 ${strong ? 'border-t border-line pt-1.5 text-fg' : ''}`}>
      <dt className="min-w-0">{label}</dt>
      <dd>
        <Amount yocto={yocto} size="sm" maxFractionDigits={5} />
      </dd>
    </div>
  );
}

function ReviewStep({ quote, payment }: { quote: OnwardQuote; payment: FoundPayment }) {
  return (
    <div className="space-y-4">
      <dl className="divide-y divide-line border-y border-line">
        <DataRow label="From">
          <AddressChip value={payment.stealthAccount} size="sm" label="Stealth account" />
        </DataRow>
        <DataRow label="To">
          <span className="font-mono">{label(quote)}</span>
        </DataRow>
        <DataRow label="Lands in">
          <AddressChip value={quote.stealth.stealthAccountId} label="Fresh account" size="sm" />
        </DataRow>
        <DataRow label="Amount">
          <Amount yocto={quote.amountYocto} />
        </DataRow>
        <DataRow label="Announcement fee">
          <Amount yocto={quote.preview.announceFeeYocto} className="text-fg-muted" />
        </DataRow>
        <DataRow label="Gas, at most">
          <span className="text-fg-muted">
            <Amount yocto={quote.preview.gasReserveYocto} size="sm" /> <span className="text-[12.5px]">· unused part refunded</span>
          </span>
        </DataRow>
      </dl>
      <p className="text-[13px] leading-relaxed text-fg-faint">
        Signed in this browser with the stealth account’s own key (derived from your spend key). Your demo wallet doesn’t sign and doesn’t appear. The fresh
        account above is exactly the one that will be paid.
      </p>
    </div>
  );
}

function DoneStep({ phase }: { phase: Extract<OnwardModel['phase'], { phase: 'done' }> }) {
  const { quote, txHash, receipt, announcementIndex, settlement } = phase;
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <CircleCheck aria-hidden className="mt-1 size-5 shrink-0 text-success" />
        <div className="min-w-0">
          <p className="text-display text-[26px] leading-tight text-fg">Still nothing links it to you.</p>
          <p className="mt-1.5 text-[14px] text-fg-muted">
            <Amount yocto={quote.amountYocto} size="sm" className="text-fg" /> went from one fresh account to another
            {announcementIndex !== null ? <> (announcement #{announcementIndex})</> : null}
            {quote.isSelf ? '. It will show up in this Inbox as a new payment.' : `, for ${label(quote)}.`}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 pl-8">
        <TxLink hash={txHash} />
        <AddressChip value={quote.stealth.stealthAccountId} size="sm" explorer label="Fresh account" className="self-start" />
      </div>
      {settlement ? (
        <div className="rounded-lg border border-line bg-surface-2/50 px-4 py-3 text-[13px] leading-relaxed text-fg-muted">
          <dl className="space-y-1">
            <SettleRow label="This account held" yocto={quote.costs.balanceYocto} />
            <SettleRow label="Sent to the recipient" yocto={quote.amountYocto} />
            <SettleRow label="Announcement fee" yocto={quote.costs.announceFeeYocto} />
            <SettleRow label="Network cost (gas, incl. NEAR’s charge for creating the new account)" yocto={settlement.networkCostYocto} />
            <SettleRow label="Stays in this stealth account" yocto={settlement.leftYocto} strong />
          </dl>
          {settlement.leftYocto > DUST_FLOOR_YOCTO && settlement.leftIsStuck && (
            <p className="mt-2">
              That’s mostly the refunded gas reserve, and too little to pay onward again. Sweep it with a claim — a public link to wherever it goes — or leave it
              where it is.
            </p>
          )}
        </div>
      ) : (
        <p className="text-[13px] text-fg-faint">The leftover balance couldn’t be read yet; the Inbox shows it after the next rescan.</p>
      )}
      {receipt && (
        <Field
          label="Payment receipt"
          aside={<CopyButton value={receipt} label="Copy receipt" withText />}
          hint="Proves this payment went to that recipient; gives no spending power. Share it only with someone who should know."
        >
          {(fp) => <Textarea {...fp} mono readOnly rows={3} value={receipt} className="text-[12px]!" />}
        </Field>
      )}
    </div>
  );
}
