import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Bell, Plus, Settings } from 'lucide-react';
import { Logo, LogoMark, Wordmark } from '../brand/Logo';
import { Drape } from '../brand/Drape';
import { ThemeToggle } from '../components/ThemeToggle';
import { Ledger } from '../components/Ledger';
import { Amount } from '../components/Amount';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { Field, Input, Textarea } from '../ui/Field';
import { AmountInput } from '../ui/AmountInput';
import { Select } from '../ui/Select';
import { Combobox } from '../ui/Combobox';
import { Tabs } from '../ui/Tabs';
import { Card, CardHeader, DataRow } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { AddressChip } from '../ui/AddressChip';
import { TxLink } from '../ui/TxLink';
import { CopyButton } from '../ui/CopyButton';
import { QR } from '../ui/QR';
import { Stepper, Timeline } from '../ui/Stepper';
import { useToast } from '../ui/toast-context';
import { Dialog, Sheet } from '../ui/Dialog';
import { Callout, EmptyState, Skeleton } from '../ui/Feedback';
import { SecretPhrase } from '../ui/SecretPhrase';
import { CurtainReveal } from '../ui/CurtainReveal';

/* Static showcase values (not data). */
const HEX = 'f1746fde79b38d7a2ca71e273164a5d4b4e5c13511af89f242409608a1261e84';
const META = 'perde:KiueHztcJDDjak6937JRQKxEJQ5GPiEjk2Y72ESDcQiqmZYmi4wCeiYR16ztLyQAn69h2TXb3bJqVkaJVmErX9UPHxcoY';
const TX = 'HdhLmPvF6fdoAckPPTnMby1RUUW3CWM7bWYMQfuavJZn';
const WORDS = ['velvet', 'harbor', 'lantern', 'quiet', 'orbit', 'meadow', 'stage', 'copper', 'whisper', 'ladder', 'autumn', 'ribbon'];

const TOKENS = [
  ['bg', 'var(--bg)'],
  ['surface', 'var(--surface)'],
  ['surface-2', 'var(--surface-2)'],
  ['line-strong', 'var(--line-strong)'],
  ['fg', 'var(--fg)'],
  ['fg-muted', 'var(--fg-muted)'],
  ['fg-faint', 'var(--fg-faint)'],
  ['accent', 'var(--accent)'],
  ['accent-text', 'var(--accent-text)'],
  ['brass', 'var(--brass)'],
  ['success', 'var(--success)'],
  ['warn', 'var(--warn)'],
  ['danger', 'var(--danger)'],
] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-line py-10">
      <h2 id={id} className="mb-6 text-display text-[30px] text-fg">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <p className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-fg-faint">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export default function KitPage() {
  const toast = useToast();
  const [tab, setTab] = useState<'a' | 'b' | 'c'>('a');
  const [line, setLine] = useState<'x' | 'y'>('x');
  const [amount, setAmount] = useState('12.5');
  const [asset, setAsset] = useState<string | null>('usdc');
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1080px] items-center justify-between px-5">
          <Link to="/" className="rounded-md text-fg" aria-label="Perde home">
            <Logo size={22} accentMark />
          </Link>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-fg-faint">/kit</span>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1080px] px-5 pb-24 pt-10">
        <h1 className="text-display text-[52px] text-fg">Component kit</h1>
        <p className="mt-2 max-w-xl text-[15px] text-fg-muted">Every primitive and state, for visual QA in both themes.</p>

        <Section id="k-brand" title="Brand">
          <Row label="Mark sizes">
            {[16, 20, 24, 32, 48, 72].map((s) => (
              <LogoMark key={s} size={s} title={`Perde mark ${s}px`} />
            ))}
            <LogoMark size={48} className="text-accent-text" />
          </Row>
          <Row label="Lockup / wordmark">
            <Logo size={32} accentMark />
            <Logo size={24} />
            <span className="text-[40px] text-fg">
              <Wordmark />
            </span>
          </Row>
          <Row label="Velvet">
            <div className="velvet h-28 w-40 rounded-lg" />
            <div className="velvet-fine h-28 w-16 rounded-lg" />
            <div className="h-48 w-24">
              <Drape />
            </div>
            <div className="h-48 w-24">
              <Drape side="right" />
            </div>
          </Row>
        </Section>

        <Section id="k-tokens" title="Colour & type">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {TOKENS.map(([name, v]) => (
              <div key={name} className="overflow-hidden rounded-lg border border-line">
                <div className="h-14" style={{ background: v }} />
                <p className="px-2.5 py-2 font-mono text-[11px] text-fg-muted">{name}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 space-y-3">
            <p className="text-display text-[64px] text-fg">
              Display <em className="text-accent-text">serif</em>
            </p>
            <p className="text-[17px] text-fg">Geist UI text — the quick brown fox pays a fresh account.</p>
            <p className="text-[15px] text-fg-muted">Muted body copy for descriptions.</p>
            <p className="text-[13px] text-fg-faint">Faint meta text, still AA.</p>
            <p className="num font-mono text-[15px] text-fg">0123456789 · 1,240.0005 NEAR · {HEX.slice(0, 24)}…</p>
          </div>
        </Section>

        <Section id="k-buttons" title="Buttons">
          <Row label="Variants">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="quiet">Quiet link</Button>
          </Row>
          <Row label="Sizes / icons">
            <Button size="sm" icon={<Plus aria-hidden className="size-4" />}>
              Small
            </Button>
            <Button iconRight={<ArrowRight aria-hidden className="size-4" />}>Medium</Button>
            <Button size="lg">Large</Button>
          </Row>
          <Row label="States">
            <Button loading loadingLabel="Sending">
              Loading
            </Button>
            <Button variant="secondary" loading>
              Loading secondary
            </Button>
            <Button disabled>Disabled</Button>
          </Row>
          <Row label="Icon buttons">
            <IconButton label="Notifications" icon={<Bell aria-hidden className="size-4.5" />} />
            <IconButton label="Settings" icon={<Settings aria-hidden className="size-4.5" />} />
            <CopyButton value={HEX} label="Copy account" />
            <CopyButton value={HEX} withText />
          </Row>
        </Section>

        <Section id="k-forms" title="Forms">
          <div className="grid gap-6 md:grid-cols-2">
            <Field label="Recipient" hint="A perde: meta-address or NEAR name.">
              {(p) => <Input {...p} mono placeholder="perde:… or alice.testnet" />}
            </Field>
            <Field label="Recipient" error="That account has no meta-address registered.">
              {(p) => <Input {...p} mono defaultValue="bob.testnet" />}
            </Field>
            <Field label="Amount" aside="Balance 9.87 NEAR">
              {(p) => <AmountInput {...p} value={amount} onValueChange={setAmount} onMax={() => setAmount('9.85')} />}
            </Field>
            <Field label="Amount (large)" hint="Bigint-safe: up to 24 decimals.">
              {(p) => <AmountInput {...p} size="lg" value={amount} onValueChange={setAmount} />}
            </Field>
            <Field label="Network" optional>
              {(p) => (
                <Select {...p} defaultValue="testnet">
                  <option value="testnet">testnet</option>
                  <option value="mainnet" disabled>
                    mainnet (not available)
                  </option>
                </Select>
              )}
            </Field>
            <Field label="Asset">
              {(p) => (
                <Combobox
                  {...p}
                  value={asset}
                  onChange={setAsset}
                  options={[
                    { value: 'usdc', label: 'USDC', detail: 'Ethereum' },
                    { value: 'eth', label: 'ETH', detail: 'Arbitrum' },
                    { value: 'btc', label: 'BTC', detail: 'Bitcoin' },
                    { value: 'sol', label: 'SOL', detail: 'Solana' },
                  ]}
                />
              )}
            </Field>
            <Field label="Notes" className="md:col-span-2">
              {(p) => <Textarea {...p} placeholder="Multi-line input" />}
            </Field>
          </div>
        </Section>

        <Section id="k-nav" title="Tabs & steps">
          <Row label="Segmented">
            <Tabs aria-label="Demo segmented" value={tab} onChange={setTab} items={[{ value: 'a', label: 'Without Perde' }, { value: 'b', label: 'With Perde' }, { value: 'c', label: 'Third' }]} />
          </Row>
          <Row label="Line">
            <Tabs aria-label="Demo line" variant="line" value={line} onChange={setLine} items={[{ value: 'x', label: 'Incoming' }, { value: 'y', label: 'Claimed' }]} />
          </Row>
          <Row label="Stepper">
            <Stepper steps={[{ id: '1', label: 'Details', status: 'done' }, { id: '2', label: 'Review', status: 'active' }, { id: '3', label: 'Sent', status: 'pending' }]} />
          </Row>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <Timeline
                steps={[
                  { id: 'a', label: 'Signed in your browser', detail: 'Key never leaves this device.', status: 'done' },
                  { id: 'b', label: 'Broadcast to testnet', status: 'active' },
                  { id: 'c', label: 'Final on-chain', status: 'pending' },
                ]}
              />
            </Card>
            <Card>
              <Timeline
                steps={[
                  { id: 'a', label: 'Signed', status: 'done' },
                  { id: 'b', label: 'Rejected by RPC', detail: 'Not enough balance for gas.', status: 'error' },
                  { id: 'c', label: 'Final on-chain', status: 'pending' },
                ]}
              />
            </Card>
          </div>
        </Section>

        <Section id="k-data" title="Data display">
          <Row label="Badges">
            <Badge>Neutral</Badge>
            <Badge tone="accent">Accent</Badge>
            <Badge tone="success" dot>
              Claimed
            </Badge>
            <Badge tone="warn" dot pulse>
              Funding
            </Badge>
            <Badge tone="danger" dot>
              Failed
            </Badge>
            <Badge tone="brass">Invoice</Badge>
          </Row>
          <Row label="Address chips">
            <AddressChip value={HEX} explorer label="Stealth account" />
            <AddressChip value="perde-demo-alice-2m9q.testnet" explorer />
            <AddressChip value={META} />
            <AddressChip value={HEX} size="sm" copy={false} />
          </Row>
          <Row label="Full address (wraps)">
            <AddressChip value={HEX} full className="max-w-md" />
          </Row>
          <Row label="Tx link / amounts">
            <TxLink hash={TX} />
            <Amount yocto="250000000000000000000000000" size="lg" />
            <Amount yocto="1500000000000000000" size="sm" />
          </Row>
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
            <Card>
              <CardHeader eyebrow="Card" title="Card header" description="With description and actions." actions={<Button size="sm" variant="secondary">Action</Button>} />
              <dl className="divide-y divide-line border-y border-line">
                <DataRow label="Amount">
                  <Amount yocto="2500000000000000000000000" />
                </DataRow>
                <DataRow label="Lands in">
                  <AddressChip value={HEX} size="sm" />
                </DataRow>
              </dl>
            </Card>
            <Card className="flex items-center justify-center">
              <QR value={META} size={148} caption="Scan to pay" />
            </Card>
          </div>
          <div className="mt-6 rounded-xl border border-line bg-surface p-5">
            <Ledger
              caption="Example ledger"
              rows={[
                { id: '1', ref: '8kQ2…xT4w', from: 'bob.near', to: 'carol.near', amount: '12 NEAR' },
                { id: '2', ref: 'Fh7d…2nVa', from: 'dao-treasury.near', to: 'alice.near', amount: '250 NEAR', highlight: 'exposed' },
                { id: '3', ref: 'Fh7d…2nVa', from: 'dao-treasury.near', to: '4f3a…c91e', amount: '250 NEAR', highlight: 'veiled' },
              ]}
            />
          </div>
        </Section>

        <Section id="k-feedback" title="Feedback">
          <div className="grid gap-3 md:grid-cols-2">
            <Callout title="Info">Quotes are dry runs; nothing is signed.</Callout>
            <Callout tone="success" title="Claimed">2.4995 NEAR arrived in your account.</Callout>
            <Callout tone="warn" title="Links accounts">Claiming to a named account is public.</Callout>
            <Callout tone="danger" title="Failed">RPC did not respond in time.</Callout>
          </div>
          <Row label="Toasts">
            <Button variant="secondary" size="sm" onClick={() => toast.show({ title: 'Copied meta-address' })}>
              Neutral toast
            </Button>
            <Button variant="secondary" size="sm" onClick={() => toast.show({ title: 'Payment sent', description: '2.5 NEAR to a fresh account.', tone: 'success' })}>
              Success toast
            </Button>
            <Button variant="secondary" size="sm" onClick={() => toast.show({ title: 'Claim failed', description: 'Not enough balance for gas.', tone: 'danger' })}>
              Error toast
            </Button>
          </Row>
          <Row label="Overlays">
            <Button variant="secondary" size="sm" onClick={() => setDialog(true)}>
              Open dialog
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setSheet(true)}>
              Open sheet
            </Button>
          </Row>
          <div className="grid gap-6 md:grid-cols-2">
            <Card aria-label="Skeleton example">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-8 w-48" />
              <Skeleton className="mt-6 h-24 w-full" />
            </Card>
            <Card tone="outline">
              <EmptyState title="Nothing behind the curtain yet" action={<Button size="sm" variant="secondary">Share address</Button>}>
                Empty states use the closed-stage drawing.
              </EmptyState>
            </Card>
          </div>
        </Section>

        <Section id="k-secret" title="Secrets & the curtain">
          <div className="grid gap-6 md:grid-cols-2">
            <SecretPhrase words={WORDS} />
            <div>
              <CurtainReveal revealed={revealed} onReveal={() => setRevealed(true)} label="Reveal viewing key" hint="Check that nobody can see your screen." className="border border-line bg-surface-2/60">
                <p className="break-hex px-6 py-8 font-mono text-[13px] text-fg">{revealed ? 'perdeview:TbjGULcyGY5Y5aEkfA1dS5ij4uAXxeuHDrw3CnteCPhB4EXq' : '•'.repeat(56)}</p>
              </CurtainReveal>
              {revealed && (
                <Button variant="ghost" size="sm" className="mt-3" onClick={() => setRevealed(false)}>
                  Draw the curtain
                </Button>
              )}
            </div>
          </div>
        </Section>
      </main>

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Claim 2.5 NEAR"
        description="The stealth account signs and pays its own gas."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => setDialog(false)}>Claim</Button>
          </>
        }
      >
        <Field label="Destination account">{(p) => <Input {...p} mono placeholder="name.testnet" />}</Field>
      </Dialog>
      <Sheet open={sheet} onClose={() => setSheet(false)} title="Sheet" description="Right drawer on desktop, bottom sheet on mobile.">
        <p className="text-[14px] text-fg-muted">Esc, the close button or a backdrop click closes it. Focus returns to the opener.</p>
      </Sheet>
    </div>
  );
}
