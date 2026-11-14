import { useState } from 'react';
import { ArrowRight, AtSign, ExternalLink, KeyRound, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { PageHeader } from '../../app-shell/PageHeader';
import { Card, CardHeader } from '../../ui/Card';
import { Button, ButtonLink } from '../../ui/Button';
import { Spinner } from '../../ui/Spinner';
import { formatYocto, truncateMiddle } from '../../lib/near-format';
import { Field, Textarea } from '../../ui/Field';
import { Callout, Skeleton } from '../../ui/Feedback';
import { CopyButton } from '../../ui/CopyButton';
import { QR } from '../../ui/QR';
import { SecretPhrase } from '../../ui/SecretPhrase';
import { CurtainReveal } from '../../ui/CurtainReveal';
import { Dialog } from '../../ui/Dialog';
import { Badge } from '../../ui/Badge';
import { TxLink } from '../../ui/TxLink';
import { AddressChip } from '../../ui/AddressChip';
import { useReceive } from './useReceive';
import type { Identity, ReceiveModel } from './types';

export default function ReceivePage() {
  const m = useReceive();
  const s = m.identity;
  return (
    <>
      <PageHeader
        eyebrow="Receive"
        title="Your private address"
        description="Publish one meta-address. Every payment to it lands in a brand-new account that only you can find and spend."
      />
      {s.status === 'loading' && <LoadingState />}
      {s.status === 'error' && (
        <Callout tone="danger" title="Couldn’t open your identity" role="alert" action={<Button variant="secondary" size="sm" icon={<RotateCcw aria-hidden className="size-4" />} onClick={m.forgetIdentity}>Start over or restore</Button>}>
          {s.message}
        </Callout>
      )}
      {s.status === 'none' && <Onboarding m={m} />}
      {s.status === 'created' && <SavePhrase words={s.words} onDone={m.confirmSaved} />}
      {s.status === 'ready' && <Ready identity={s.identity} m={m} />}
    </>
  );
}

function LoadingState() {
  return (
    <Card aria-busy="true" aria-label="Loading identity">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-4 h-14 w-full" />
      <div className="mt-6 flex gap-3">
        <Skeleton className="h-11 w-32" />
        <Skeleton className="h-11 w-24" />
      </div>
    </Card>
  );
}

function Onboarding({ m }: { m: ReceiveModel }) {
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card className="flex flex-col">
        <span className="mb-5 flex size-10 items-center justify-center rounded-lg border border-line bg-surface-2">
          <Sparkles aria-hidden className="size-4.5 text-accent-text" />
        </span>
        <h2 className="text-[19px] font-semibold tracking-[-0.01em]">Create a new identity</h2>
        <p className="mt-2 flex-1 text-[14.5px] leading-relaxed text-fg-muted">
          Generates a 12-word recovery phrase in this browser. Your spend and view keys are derived from it; nothing is sent
          anywhere.
        </p>
        <Button className="mt-6 self-start" onClick={m.createIdentity}>
          Create identity
        </Button>
      </Card>
      <Card tone="sunken" className="flex flex-col">
        <span className="mb-5 flex size-10 items-center justify-center rounded-lg border border-line bg-surface">
          <KeyRound aria-hidden className="size-4.5 text-fg-muted" />
        </span>
        <h2 className="text-[19px] font-semibold tracking-[-0.01em]">Restore from a phrase</h2>
        <form
          className="mt-4 flex flex-1 flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(await m.restoreIdentity(phrase));
            setBusy(false);
          }}
        >
          <Field label="Recovery phrase" hint="12 words separated by spaces." error={error}>
            {(p) => (
              <Textarea
                {...p}
                mono
                rows={3}
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="word1 word2 word3 …"
              />
            )}
          </Field>
          <Button type="submit" variant="secondary" className="self-start" loading={busy} loadingLabel="Restoring" disabled={!phrase.trim()}>
            Restore
          </Button>
        </form>
      </Card>
    </div>
  );
}

function SavePhrase({ words, onDone }: { words: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <Card>
      <CardHeader
        eyebrow="Before you continue"
        title="Write down your recovery phrase"
        description="These 12 words are the only way to recover payments sent to you. Perde has no server and cannot reset them."
      />
      <SecretPhrase words={words} />
      <label className="mt-6 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-line px-4 py-3 text-[14.5px] text-fg">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-0.5 size-4.5 shrink-0 accent-(--accent)"
        />
        I have stored these words somewhere safe and offline.
      </label>
      <div className="mt-5 flex justify-end">
        <Button disabled={!saved} onClick={onDone}>
          Continue
        </Button>
      </div>
    </Card>
  );
}

function Registration({ m }: { m: ReceiveModel }) {
  const reg = m.registration;
  const deposit = formatYocto(m.registerDepositYocto, { maxFractionDigits: 4 });
  if (reg.status === 'no-wallet')
    return (
      <Callout title="No account to sign with" action={<ButtonLink to="/app/settings" size="sm" variant="secondary">Get a demo wallet</ButtonLink>}>
        Registering is a transaction from your demo wallet. Receiving by meta-address works without it.
      </Callout>
    );
  if (reg.status === 'checking')
    return (
      <p className="flex items-center gap-2 text-[13.5px] text-fg-muted" role="status">
        <Spinner size={14} /> Reading the contract…
      </p>
    );
  if (reg.status === 'registered')
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="success" dot>
            Registered
          </Badge>
          <AddressChip value={reg.accountId} explorer label="Registered account" />
          {reg.txHash && <TxLink hash={reg.txHash} />}
        </div>
        <p className="text-[13px] text-fg-faint">
          Read from <span className="font-mono">get_meta_address</span> on the contract. Senders who type{' '}
          <span className="font-mono text-fg-muted">{reg.accountId}</span> pay a fresh account derived from your meta-address.
        </p>
        <div>
          <Button variant="ghost" size="sm" onClick={m.unregisterName}>
            Unregister and refund the deposit
          </Button>
        </div>
      </div>
    );
  const pending = reg.status === 'pending';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-[14px] text-fg-muted">
        <AtSign aria-hidden className="size-4 text-fg-faint" />
        Register under
        <AddressChip value={m.signerAccountId ?? ''} copy={false} label="Account" />
      </div>
      {reg.status === 'other' && (
        <Callout tone="warn" title="This name points at another meta-address">
          {reg.accountId} is registered to <span className="font-mono">{truncateMiddle(reg.metaAddress, 12, 6)}</span>, probably an earlier identity.
          Registering again replaces it with this one.
        </Callout>
      )}
      {reg.status === 'error' && (
        <Callout tone="danger" role="alert" action={<Button size="sm" variant="secondary" onClick={m.retryRegistration}>Try again</Button>}>
          {reg.message}
        </Callout>
      )}
      <div>
        <Button
          variant="secondary"
          onClick={m.registerName}
          loading={pending}
          loadingLabel={pending && reg.action === 'unregister' ? 'Unregistering' : 'Registering'}
        >
          {reg.status === 'other' ? 'Replace with this meta-address' : 'Register name'}
        </Button>
        <p className="mt-2 text-[12.5px] text-fg-faint">
          Attaches {deposit} NEAR; the contract keeps the exact storage cost and refunds the rest. Unregistering refunds the storage.
        </p>
      </div>
    </div>
  );
}

function Ready({ identity, m }: { identity: Identity; m: ReceiveModel }) {
  const [showKey, setShowKey] = useState(false);
  const [phraseOpen, setPhraseOpen] = useState(false);
  const [phrase, setPhrase] = useState<string[] | null>(null);
  const [forgetOpen, setForgetOpen] = useState(false);

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden p-0! sm:p-0!">
        <div className="grid md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 p-5 sm:p-7">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-brass-text">Meta-address</p>
            <p className="break-hex mt-3 font-mono text-[14px] leading-[1.7] text-fg sm:text-[15px]" translate="no">
              {identity.metaAddress}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <CopyButton value={identity.metaAddress} label="Copy meta-address" withText className="border border-line-strong bg-surface-2" />
              {identity.registeredName && (
                <Badge tone="success" dot>
                  Also reachable as {identity.registeredName}
                </Badge>
              )}
            </div>
            <p className="mt-6 max-w-md text-[13.5px] leading-relaxed text-fg-muted">
              Safe to post publicly. Payers derive a fresh account from it each time; the address itself never appears on-chain.
            </p>
          </div>
          <div className="flex items-center justify-center border-t border-line bg-surface-2/50 p-6 md:border-l md:border-t-0">
            <QR value={m.payLink ?? identity.metaAddress} size={168} label="QR code of your pay link" caption="Scan to open the pay page" />
          </div>
        </div>
        {m.payLink && (
          <div className="border-t border-line px-5 py-4 sm:px-7">
            <p className="mb-1.5 text-[12.5px] text-fg-muted">Pay link — opens a payment form for this address</p>
            <div className="flex min-w-0 items-center gap-1 rounded-md border border-line bg-surface-2/70 py-1 pl-3 pr-1">
              <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-fg" title={m.payLink} translate="no">
                {m.payLink}
              </span>
              <CopyButton value={m.payLink} label="Copy pay link" />
              <a
                href={m.payLink}
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
        )}
      </Card>

      <Card>
        <CardHeader
          eyebrow="Optional"
          title="Pay me at a NEAR name"
          description="Store your meta-address in the Perde contract under your account, so people can pay a readable name. Each payment still goes to a fresh account."
        />
        <Registration m={m} />
      </Card>

      <Card>
        <CardHeader
          eyebrow="For auditors"
          title="Viewing key"
          description="Lets someone see payments you received — never spend them. Share it only with people you would show your statements to."
        />
        <CurtainReveal revealed={showKey} onReveal={() => setShowKey(true)} label="Reveal viewing key" className="border border-line bg-surface-2/60">
          <div className="flex items-start gap-3 px-5 py-5 sm:px-7">
            <p className="break-hex min-w-0 flex-1 font-mono text-[13px] leading-[1.7] text-fg" translate="no">
              {showKey ? identity.viewingKey : 'perdeview:' + '•'.repeat(48)}
            </p>
            {showKey && <CopyButton value={identity.viewingKey} label="Copy viewing key" />}
          </div>
        </CurtainReveal>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {showKey && (
            <Button variant="ghost" size="sm" onClick={() => setShowKey(false)}>
              Hide
            </Button>
          )}
          <ButtonLink to="/app/audit" variant="ghost" size="sm" iconRight={<ArrowRight aria-hidden className="size-3.5" />}>
            See what an auditor sees
          </ButtonLink>
        </div>
      </Card>

      <Card tone="outline">
        <CardHeader title="Recovery and reset" description="Your keys live only in this browser." className="mb-4" />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<KeyRound aria-hidden className="size-4" />}
            onClick={async () => {
              setPhrase(await m.revealPhrase());
              setPhraseOpen(true);
            }}
          >
            Show recovery phrase
          </Button>
          <Button variant="danger" size="sm" icon={<Trash2 aria-hidden className="size-4" />} onClick={() => setForgetOpen(true)}>
            Forget this identity
          </Button>
        </div>
      </Card>

      <Dialog open={phraseOpen} onClose={() => setPhraseOpen(false)} title="Recovery phrase" description="Anyone with these words can spend your payments.">
        {phrase && <SecretPhrase words={phrase} />}
      </Dialog>
      <Dialog
        open={forgetOpen}
        onClose={() => setForgetOpen(false)}
        title="Forget this identity?"
        description="Keys are removed from this browser. Unclaimed payments can only be recovered with your 12 words."
        footer={
          <>
            <Button variant="ghost" onClick={() => setForgetOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setForgetOpen(false);
                m.forgetIdentity();
              }}
            >
              Forget identity
            </Button>
          </>
        }
      >
        <Callout tone="warn">Make sure your recovery phrase is written down before you continue.</Callout>
      </Dialog>
    </div>
  );
}
