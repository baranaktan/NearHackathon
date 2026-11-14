import type { ReactNode } from 'react';
import { ArrowRight, EyeOff, Megaphone, ShieldAlert } from 'lucide-react';
import { cn } from '../lib/cn';
import { ButtonLink } from '../ui/Button';
import { Logo } from '../brand/Logo';
import { APP_CONFIG } from '../config';

function SectionHeading({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="max-w-3xl">
      <p className="mb-4 flex items-center gap-3 text-[12px] font-medium uppercase tracking-[0.18em] text-brass-text">
        <span aria-hidden className="h-px w-8 bg-brass/60" />
        {eyebrow}
      </p>
      <h2 id={id} className="text-display text-[42px] text-fg sm:text-[56px]">
        {title}
      </h2>
      {children && <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-fg-muted">{children}</p>}
    </header>
  );
}

function Shell({ id, labelledBy, children, className }: { id: string; labelledBy: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={labelledBy} tabIndex={-1} className={cn('scroll-mt-6 outline-none', className)}>
      <div className="mx-auto max-w-[1240px] px-6 py-24 sm:px-10 sm:py-32">{children}</div>
    </section>
  );
}

/* ------------------------------- How it works ------------------------------- */

const acts: Array<{ numeral: string; title: string; body: ReactNode; math: string[] }> = [
  {
    numeral: 'I',
    title: 'Publish once',
    body: (
      <>
        Alice&rsquo;s browser derives a spend key and a view key from a 12-word phrase and publishes one meta-address — or
        registers it under <span className="font-mono text-[0.92em] text-fg">alice.near</span>.
      </>
    ),
    math: ['K_spend = k_spend·G', 'K_view  = k_view·G', 'meta = perde:base58(K_spend‖K_view)'],
  },
  {
    numeral: 'II',
    title: 'Pay a fresh account',
    body: (
      <>
        The sender&rsquo;s browser picks a one-time secret <span className="font-mono text-[0.92em] text-fg">r</span> and derives
        an account only Alice can recognise. One contract call records the announcement and moves the funds, atomically.
      </>
    ),
    math: ['R = r·G', 'P = K_spend + H(r·K_view)·G', 'account id = hex(P)'],
  },
  {
    numeral: 'III',
    title: 'Find and spend',
    body: (
      <>
        Alice&rsquo;s browser reads announcements with plain view calls, tests each with her view key, and signs from the new
        account with its derived key. The account pays its own gas.
      </>
    ),
    math: ['S = k_view·R', 'P ≟ K_spend + H(S)·G', 'p = k_spend + H(S) mod L'],
  },
];

export function HowItWorks() {
  return (
    <Shell id="how" labelledBy="how-title">
      <SectionHeading id="how-title" eyebrow="How it works" title={<>A payment in three acts.</>}>
        Standard dual-key stealth addresses on ed25519 — the same curve NEAR accounts already use. Everything below happens in
        the browser.
      </SectionHeading>
      <ol className="mt-16 grid gap-px overflow-hidden rounded-xl border border-line bg-line lg:grid-cols-3">
        {acts.map((a) => (
          <li key={a.numeral} className="flex min-w-0 flex-col bg-bg p-7 sm:p-9">
            <div className="flex items-baseline gap-4">
              <span className="text-display text-[64px] leading-none text-accent-text" aria-hidden>
                {a.numeral}
              </span>
              <span className="sr-only">Act {a.numeral}:</span>
              <h3 className="text-[19px] font-semibold tracking-[-0.01em] text-fg">{a.title}</h3>
            </div>
            <p className="mt-5 flex-1 text-[15px] leading-relaxed text-fg-muted">{a.body}</p>
            <pre className="mt-7 overflow-x-auto rounded-lg border border-line bg-surface px-4 py-3.5 font-mono text-[12.5px] leading-[1.9] text-fg">
              {a.math.join('\n')}
            </pre>
          </li>
        ))}
      </ol>
      <p className="mt-5 font-mono text-[12px] leading-relaxed text-fg-faint">
        G: ed25519 base point · L: group order · H: SHA-512 with a domain tag, reduced mod L · a one-byte view tag lets scanners
        skip most announcements cheaply.
      </p>
    </Shell>
  );
}

/* --------------------------------- Why NEAR --------------------------------- */

const reasons: Array<{ primitive: string; body: ReactNode; gives: string }> = [
  {
    primitive: 'Implicit accounts',
    body: 'A NEAR implicit account is an ed25519 public key written as 64 hex characters. Derive a fresh key, transfer to it, and the account exists. Funds sit in the recipient’s own account, not in a shared contract.',
    gives: 'No pool',
  },
  {
    primitive: 'Accounts pay their own gas',
    body: 'The stealth account signs its claim transaction with its derived key and pays the fee from the funds it received. Nobody has to front gas on the recipient’s behalf.',
    gives: 'No relayer',
  },
  {
    primitive: 'Contract view calls',
    body: 'Announcements live in a small, ownerless contract and are paged with free RPC view calls straight from the browser.',
    gives: 'No indexer',
  },
  {
    primitive: 'Named accounts',
    body: (
      <>
        Register your meta-address under <span className="font-mono text-[0.92em] text-fg">alice.near</span> once. Senders pay
        the name; every payment still lands on a fresh account.
      </>
    ),
    gives: 'Pay a name, privately',
  },
  {
    primitive: 'NEAR Intents',
    body: 'An invoice is a one-time stealth account derived from the view key, so a 1Click swap can deliver funds from another chain straight into it. In this build, cross-chain quotes are dry-run previews.',
    gives: 'Get paid from any chain',
  },
];

export function WhyNear() {
  return (
    <Shell id="why-near" labelledBy="why-title" className="border-t border-line">
      <SectionHeading id="why-title" eyebrow="Why NEAR" title="Native, not bolted on.">
        On most chains, private payments need a pool that holds everyone&rsquo;s funds, a relayer to pay gas and an indexer to
        find payments. NEAR&rsquo;s account model already does that work.
      </SectionHeading>
      <dl className="mt-14 border-t border-line">
        {reasons.map((r) => (
          <div
            key={r.primitive}
            className="grid gap-x-10 gap-y-3 border-b border-line py-7 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,13rem)] md:items-baseline"
          >
            <dt className="text-display text-[28px] leading-tight text-fg">{r.primitive}</dt>
            <dd className="text-[15px] leading-relaxed text-fg-muted">{r.body}</dd>
            <dd className="flex md:justify-end">
              <span className="inline-flex items-center gap-2 font-mono text-[12.5px] uppercase tracking-[0.1em] text-accent-text">
                <ArrowRight aria-hidden className="size-3.5" />
                {r.gives}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </Shell>
  );
}

/* ------------------------------ Privacy, honestly ----------------------------- */

const hidden = [
  { title: 'Who was paid', body: 'The recipient’s name and meta-address never appear in the payment. The chain sees a transfer to an account it has never seen.' },
  { title: 'That two payments share a recipient', body: 'Every payment derives a new account, so ten payments to Alice look like ten strangers.' },
  { title: 'The recipient’s other holdings', body: 'Nothing on-chain connects a stealth account to Alice’s main account — until she moves funds between them.' },
];

const visible = [
  { title: 'Sender, amount and time', body: 'The paying account, the exact amount and the block are public, as with any NEAR transfer.' },
  { title: 'That Perde was used', body: 'The contract call and its announcement are visible. Anyone can count Perde payments; nobody can attribute them.' },
  { title: 'Where claimed funds go', body: 'Claiming to alice.near links the two accounts. Claim to a fresh account, or spend in place, to keep the curtain closed.' },
];

export function PrivacyHonest() {
  return (
    <Shell id="privacy" labelledBy="privacy-title" className="border-t border-line">
      <SectionHeading id="privacy-title" eyebrow="What is and isn’t private" title="What the curtain hides — and what it doesn’t." />
      <div className="mt-14 grid gap-6 lg:grid-cols-2">
        <div className="relative overflow-hidden rounded-xl border border-line bg-surface">
          <div aria-hidden className="velvet h-2.5" />
          <div className="p-7 sm:p-9">
            <h3 className="flex items-center gap-2.5 text-[13px] font-medium uppercase tracking-[0.16em] text-fg">
              <EyeOff aria-hidden className="size-4 text-accent-text" />
              Behind the curtain
            </h3>
            <ul className="mt-6 space-y-6">
              {hidden.map((h) => (
                <li key={h.title}>
                  <p className="text-[17px] font-medium text-fg">{h.title}</p>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-fg-muted">{h.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-xl border border-line">
          <div aria-hidden className="h-2.5 bg-line" />
          <div className="p-7 sm:p-9">
            <h3 className="flex items-center gap-2.5 text-[13px] font-medium uppercase tracking-[0.16em] text-fg">
              <Megaphone aria-hidden className="size-4 text-brass" />
              On stage, in public
            </h3>
            <ul className="mt-6 space-y-6">
              {visible.map((h) => (
                <li key={h.title}>
                  <p className="text-[17px] font-medium text-fg">{h.title}</p>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-fg-muted">{h.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="mt-6 flex items-start gap-3 rounded-xl border border-warn/40 bg-warn/[0.06] px-5 py-4">
        <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
        <p className="text-[14.5px] leading-relaxed text-fg-muted">
          <span className="font-medium text-fg">Research prototype.</span> The cryptography is unaudited and the app runs on
          NEAR testnet only. Don&rsquo;t use it with funds you care about.
        </p>
      </div>
    </Shell>
  );
}

/* ---------------------------------- Closing ---------------------------------- */

export function ClosingCta() {
  return (
    <section aria-labelledby="cta-title" className="relative overflow-hidden border-t border-line">
      <div aria-hidden className="velvet absolute inset-y-0 left-0 w-3 sm:w-5" />
      <div aria-hidden className="velvet absolute inset-y-0 right-0 w-3 sm:w-5" />
      <div className="mx-auto flex max-w-[1240px] flex-col items-start gap-8 px-8 py-24 sm:px-14 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <h2 id="cta-title" className="text-display text-[44px] text-fg sm:text-[60px]">
            The curtain is up <em className="text-accent-text">on testnet.</em>
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-fg-muted">
            The demo creates throwaway testnet accounts in your browser. No wallet, no sign-up, nothing to install.
          </p>
        </div>
        <ButtonLink to="/app" size="lg" iconRight={<ArrowRight aria-hidden className="size-4" />} className="max-sm:w-full">
          Try the live demo
        </ButtonLink>
      </div>
    </section>
  );
}

export function SiteFooter({ githubUrl = APP_CONFIG.githubUrl }: { githubUrl?: string }) {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-6 py-14 sm:px-10 md:grid-cols-[1fr_auto]">
        <div>
          <Logo size={24} accentMark />
          <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-fg-muted">
            Private payments on NEAR. <span className="italic">Perde</span> is Turkish for curtain.
          </p>
        </div>
        <ul className="flex flex-wrap items-start gap-x-8 gap-y-3 text-[14px] text-fg-muted md:justify-end">
          <li>
            <ButtonLink to="/app" variant="quiet" size="sm">
              Open the app
            </ButtonLink>
          </li>
          {githubUrl && (
            <li>
              <a href={githubUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center underline decoration-line-strong underline-offset-4 hover:text-fg hover:decoration-brass">
                Source on GitHub
              </a>
            </li>
          )}
          <li className="inline-flex h-9 items-center">License {APP_CONFIG.license}</li>
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-[12.5px] text-fg-faint md:col-span-2">
          <p>Built at NEAR HACKATHON</p>
          <p className="font-mono uppercase tracking-[0.12em]">Testnet · unaudited</p>
        </div>
      </div>
    </footer>
  );
}
