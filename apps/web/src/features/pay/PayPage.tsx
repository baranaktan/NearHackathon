import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowRight, CircleCheck, Quote } from 'lucide-react';
import { Logo } from '../../brand/Logo';
import { ThemeToggle } from '../../components/ThemeToggle';
import { NetworkBadge } from '../../app-shell/NetworkBadge';
import { Card, CardHeader, DataRow } from '../../ui/Card';
import { Button, ButtonLink } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { AmountInput } from '../../ui/AmountInput';
import { AddressChip } from '../../ui/AddressChip';
import { Callout } from '../../ui/Feedback';
import { TxProgress } from '../../components/TxProgress';
import { TxLink } from '../../ui/TxLink';
import { Amount } from '../../components/Amount';
import { WalletCard } from '../../components/wallet/WalletCard';
import { WalletSetup } from '../../components/wallet/WalletSetup';
import { useAppState } from '../../state/context';
import { formatYocto } from '../../lib/near-format';
import { SendFlow } from '../send/SendPage';
import { useSend } from '../send/useSend';
import { AnyChainPanel } from '../anychain/AnyChainPanel';
import { parsePayParams, type PayTarget } from './params';
import { usePayInvoice } from './usePayInvoice';

/** Public page a payer lands on from a pay link or QR code. */
export default function PayPage() {
  const [params] = useSearchParams();
  const target = useMemo(() => parsePayParams(params), [params]);
  useEffect(() => {
    document.title = 'Pay privately · Perde';
  }, []);
  return (
    <div className="grain min-h-dvh bg-bg">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="rounded-md text-fg" aria-label="Perde home">
            <Logo size={22} accentMark />
          </Link>
          <div className="flex items-center gap-1.5">
            <NetworkBadge compact />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
        {target.kind === 'invalid' && <InvalidLink reason={target.reason} />}
        {target.kind === 'meta' && <MetaPay target={target} />}
        {target.kind === 'invoice' && <InvoicePay target={target} />}
        <p className="mt-10 text-center text-[12.5px] text-fg-faint">
          Perde · private payments on NEAR testnet · <Link to="/" className="underline underline-offset-4 hover:text-fg">how it works</Link>
        </p>
      </main>
    </div>
  );
}

function Heading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-7">
      <p className="mb-3 flex items-center gap-2.5 text-[11.5px] font-medium uppercase tracking-[0.18em] text-brass-text">
        <span aria-hidden className="h-px w-6 bg-brass/60" />
        {eyebrow}
      </p>
      <h1 className="text-display text-[38px] text-fg sm:text-[48px]">{title}</h1>
      {children && <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">{children}</p>}
    </header>
  );
}

function InvalidLink({ reason }: { reason: string }) {
  return (
    <>
      <Heading eyebrow="Pay link" title="This link can’t be used" />
      <Callout tone="danger" role="alert" title="Invalid pay link" action={<ButtonLink to="/" variant="secondary" size="sm">Go to Perde</ButtonLink>}>
        {reason} Ask the person who sent it for a fresh link.
      </Callout>
    </>
  );
}

/** The link's note is untrusted text from whoever made it. Rendered as plain text, clearly attributed. */
function LinkNote({ note }: { note: string }) {
  if (!note) return null;
  return (
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-line bg-surface-2/50 px-4 py-3">
      <Quote aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-faint" />
      <div className="min-w-0">
        <p className="break-words text-[14.5px] text-fg">{note}</p>
        <p className="mt-1 text-[12px] text-fg-faint">Note from the link — written by whoever made it, not verified.</p>
      </div>
    </div>
  );
}

function WalletSection() {
  const { wallet } = useAppState();
  return (
    <Card className="mb-5">
      <CardHeader title="Pay from" description={wallet ? undefined : 'You need a testnet account to pay. Create one in a few seconds, or use an existing one.'} className={wallet ? 'mb-3' : undefined} />
      {wallet ? <WalletCard allowForget={false} /> : <WalletSetup compact />}
    </Card>
  );
}

function MetaPay({ target }: { target: Extract<PayTarget, { kind: 'meta' }> }) {
  const model = useSend({
    initialRecipient: target.metaAddress,
    initialAmount: target.amountYocto ? formatYocto(target.amountYocto, { maxFractionDigits: 24, group: false }) : undefined,
  });
  return (
    <>
      <Heading eyebrow="Private payment" title="Pay privately">
        Your payment goes to a brand-new account derived from this address. Nobody watching the chain can tell who receives it.
      </Heading>
      <LinkNote note={target.note} />
      <Card tone="sunken" className="mb-5">
        <p className="text-[12px] text-fg-muted">To meta-address</p>
        <p className="mt-1 break-hex font-mono text-[13px] text-fg" translate="no">
          {target.metaAddress}
        </p>
      </Card>
      <WalletSection />
      <SendFlow m={model} lockRecipient />
    </>
  );
}

function InvoicePay({ target }: { target: Extract<PayTarget, { kind: 'invoice' }> }) {
  const { wallet } = useAppState();
  const pay = usePayInvoice(target.account, target.amountYocto);
  const p = pay.phase;
  return (
    <>
      <Heading eyebrow="Invoice" title={target.amountYocto ? `Pay ${formatYocto(target.amountYocto)} NEAR` : 'Pay this invoice'}>
        A one-time account that only the invoice’s creator can open. Paying it is a plain transfer: no contract, no announcement.
      </Heading>
      <LinkNote note={target.note} />
      <Card tone="sunken" className="mb-5">
        <dl className="divide-y divide-line">
          <DataRow label="One-time account">
            <AddressChip value={target.account} explorer label="Invoice account" size="sm" />
          </DataRow>
          <DataRow label="Amount">{target.amountYocto ? <Amount yocto={target.amountYocto} /> : <span className="text-fg-muted">Payer chooses</span>}</DataRow>
        </dl>
      </Card>

      <WalletSection />

      <Card className="mb-5">
        <CardHeader title="Pay with testnet NEAR" description="One Transfer from your wallet to the invoice account, signed in this browser." />
        {(p.phase === 'edit' || p.phase === 'error') && (
          <div className="flex flex-col gap-4">
            {!target.amountYocto && (
              <Field label="Amount" error={pay.amountError}>
                {(f) => <AmountInput {...f} value={pay.amountInput} onValueChange={pay.setAmountInput} />}
              </Field>
            )}
            {target.amountYocto && pay.amountError && (
              <p className="text-[13px] text-danger" role="alert">
                {pay.amountError}
              </p>
            )}
            {pay.gasReserveYocto && (
              <p className="text-[12.5px] text-fg-faint">
                Gas at most {formatYocto(pay.gasReserveYocto, { maxFractionDigits: 5 })} NEAR
                {pay.createsAccount ? ' (includes creating the one-time account on first payment)' : ''}; unused gas is refunded.
              </p>
            )}
            {p.phase === 'error' && (
              <Callout tone="danger" role="alert" title="Payment not sent">
                {p.message}
                {p.txHash && (
                  <span className="mt-2 block">
                    <TxLink hash={p.txHash} label="Check this transaction first" />
                  </span>
                )}
              </Callout>
            )}
            <div>
              <Button onClick={pay.pay} disabled={!pay.canPay}>
                {pay.amountYocto ? `Pay ${formatYocto(pay.amountYocto)} NEAR` : 'Pay'}
              </Button>
              {!wallet && <p className="mt-2 text-[12.5px] text-fg-faint">Set up a wallet above first.</p>}
            </div>
          </div>
        )}
        {p.phase === 'submitting' && (
          <InvoiceProgress step={p.step} />
        )}
        {p.phase === 'success' && (
          <div className="flex items-start gap-3">
            <CircleCheck aria-hidden className="mt-1 size-5 shrink-0 text-success" />
            <div className="min-w-0">
              <p className="text-[16px] font-medium text-fg">Paid {formatYocto(p.amountYocto)} NEAR</p>
              <p className="mt-1 text-[13.5px] text-fg-muted">
                {p.arrived ? 'The invoice account shows the funds. ' : 'Confirmed on-chain. '}The recipient sees it as paid and claims it from their Inbox.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <TxLink hash={p.txHash} />
                <Button variant="ghost" size="sm" onClick={pay.reset}>
                  Pay again
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      <AnyChainPanel stealthAccountId={target.account} amountYocto={target.amountYocto} />
      <p className="mt-6 flex items-center justify-center gap-1.5 text-[13px] text-fg-muted">
        Want your own private address?
        <ButtonLink to="/app/start" variant="quiet" size="sm" iconRight={<ArrowRight aria-hidden className="size-3.5" />}>
          Try Perde
        </ButtonLink>
      </p>
    </>
  );
}

/** Mounted when the payment starts; the elapsed-time wording counts from here. */
function InvoiceProgress({ step }: { step: 'sign' | 'broadcast' | 'confirm' }) {
  const [startedAt] = useState(() => Date.now());
  return <TxProgress label="Payment progress" step={step} startedAtMs={startedAt} labels={{ confirm: 'Invoice balance read back from chain' }} />;
}