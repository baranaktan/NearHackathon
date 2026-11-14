/**
 * The guided demo's checklist, computed from real state only: a step is done
 * when the thing it describes actually happened in this browser.
 */
import type { PersistedState } from '../../state/schema';

export type DemoStepId = 'wallet' | 'identity' | 'send' | 'inbox' | 'chain' | 'claim' | 'onward' | 'invoice' | 'payroll' | 'dao';

export interface DemoStep {
  id: DemoStepId;
  n: number;
  title: string;
  body: string;
  /** Deep link into the app. */
  to: string;
  done: boolean;
  bonus: boolean;
}

export const DEMO_SEND_AMOUNT = '0.05';

export function demoSteps(state: PersistedState, metaAddress: string | null): DemoStep[] {
  const selfSends = metaAddress ? state.sent.filter((r) => r.metaAddress === metaAddress && r.kind === 'send') : [];
  const found = !!metaAddress && state.scan?.metaAddress === metaAddress && state.scan.payments.length > 0;
  const sendLink = metaAddress
    ? `/app/send?${new URLSearchParams({ to: metaAddress, amount: DEMO_SEND_AMOUNT }).toString()}`
    : '/app/receive';
  return [
    {
      id: 'wallet',
      n: 1,
      title: 'Get a demo wallet',
      body: 'One throwaway testnet account pays for everything. Create one from the faucet or paste an existing testnet account.',
      to: '/app/settings',
      done: state.wallet !== null,
      bonus: false,
    },
    {
      id: 'identity',
      n: 2,
      title: 'Create your private identity',
      body: 'A 12-word phrase gives you a meta-address to share. Payments to it land in fresh accounts only you can find.',
      to: '/app/receive',
      done: state.identity?.confirmed === true,
      bonus: false,
    },
    {
      id: 'send',
      n: 3,
      title: 'Send yourself a private payment',
      body: `Pay ${DEMO_SEND_AMOUNT} NEAR to your own meta-address from the demo wallet. A real testnet transaction.`,
      to: sendLink,
      done: selfSends.length > 0,
      bonus: false,
    },
    {
      id: 'inbox',
      n: 4,
      title: 'Find it in the Inbox',
      body: 'Your browser scans public announcements with your view key and recognises the payment.',
      to: '/app/inbox',
      done: found,
      bonus: false,
    },
    {
      id: 'chain',
      n: 5,
      title: 'Look at the chain view',
      body: 'See exactly what a public observer gets for that payment — and what only you know.',
      to: '/app/inbox',
      done: state.demo.chainViewSeen,
      bonus: false,
    },
    {
      id: 'claim',
      n: 6,
      title: 'Claim it',
      body: 'Sweep the stealth account to an account you choose. The stealth key signs in your browser and pays its own gas.',
      to: '/app/inbox',
      done: Object.keys(state.claims).length > 0,
      bonus: false,
    },
    {
      id: 'onward',
      n: 7,
      title: 'Pay onward without claiming',
      body: 'Send another payment to yourself, then use “Pay someone from here”: the stealth account pays a fresh one directly, so your named account never appears.',
      to: '/app/inbox',
      done: state.sent.some((r) => r.kind === 'onward'),
      bonus: true,
    },
    {
      id: 'invoice',
      n: 8,
      title: 'Create an invoice & get a cross-chain quote',
      body: 'A one-time account anyone can pay, plus a real NEAR Intents dry quote from another chain.',
      to: '/app/invoice',
      done: state.invoices.length > 0 && state.demo.quoteSeen,
      bonus: true,
    },
    {
      id: 'payroll',
      n: 9,
      title: 'Run payroll',
      body: 'Several private payments in one transaction. The sample uses your own meta-address so you can find them.',
      to: '/app/payroll',
      done: state.sent.some((r) => r.kind === 'payroll'),
      bonus: true,
    },
    {
      id: 'dao',
      n: 10,
      title: 'Pay from a DAO treasury',
      body: 'Propose a payout from the open demo SputnikDAO to your own meta-address, approve it, and find it in the Inbox.',
      to: '/app/dao',
      done: state.demo.daoPaid,
      bonus: true,
    },
  ];
}

export function demoProgress(steps: readonly DemoStep[]): { done: number; total: number; next: DemoStep | null } {
  const core = steps.filter((s) => !s.bonus);
  return { done: core.filter((s) => s.done).length, total: core.length, next: steps.find((s) => !s.done) ?? null };
}
