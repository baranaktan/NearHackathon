import { ArrowRight, Check, Play, RotateCcw } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '../../app-shell/PageHeader';
import { Card, CardHeader } from '../../ui/Card';
import { Button, ButtonLink } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Callout } from '../../ui/Feedback';
import { Timeline, type StepStatus } from '../../ui/Stepper';
import { TxLink } from '../../ui/TxLink';
import { AddressChip } from '../../ui/AddressChip';
import { useAppState } from '../../state/context';
import { cn } from '../../lib/cn';
import { useDemoSteps } from './useDemoSteps';
import { RUN_PHASES, useDemoRunner, type RunPhase } from './useDemoRunner';
import { DEMO_SEND_AMOUNT } from './steps';

const PHASE_LABEL: Record<RunPhase, string> = {
  wallet: 'Demo wallet',
  identity: 'Private identity',
  send: `Send ${DEMO_SEND_AMOUNT} NEAR to yourself`,
  scan: 'Find it with your view key',
};

export default function GuidedDemoPage() {
  const { steps, done, total } = useDemoSteps();
  const { state, dispatch } = useAppState();
  const { run, start, reset } = useDemoRunner();
  const coreDone = steps.slice(0, 4).every((s) => s.done);

  const phaseStatus = (p: RunPhase): StepStatus =>
    run.completed.includes(p) ? 'done' : run.current === p ? (run.status === 'error' ? 'error' : 'active') : 'pending';

  return (
    <>
      <PageHeader
        eyebrow="Guided demo"
        title="See it work in a minute"
        description="Six short steps on NEAR testnet, plus three bonus tours. Each one is a real action — the checklist ticks itself off from what actually happened in this browser."
        actions={
          state.demo.dismissed ? (
            <Button variant="secondary" size="sm" onClick={() => dispatch({ type: 'demo/update', patch: { dismissed: false } })}>
              Show the sidebar checklist
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card padded={false} className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 sm:px-6">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-fg-faint">Steps</h2>
            <Badge tone={done === total ? 'success' : 'brass'} dot>
              {done} of {total} done
            </Badge>
          </div>
          <ol>
            {steps.map((s, i) => {
              const isNext = steps.findIndex((x) => !x.done) === i;
              return (
                <li key={s.id} className={cn('border-t border-line first:border-t-0', isNext && 'bg-surface-2/50')}>
                  <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-3 px-5 py-4 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center sm:px-6">
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-8 items-center justify-center rounded-full border text-[13px] num',
                        s.done ? 'border-success/60 bg-success/12 text-success' : isNext ? 'border-brass text-brass-text' : 'border-line-strong text-fg-faint',
                      )}
                    >
                      {s.done ? <Check className="size-4" /> : s.n}
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-fg">
                        {s.title}
                        {s.bonus && <Badge>Bonus</Badge>}
                        <span className="sr-only">{s.done ? '— done' : isNext ? '— next' : ''}</span>
                      </p>
                      <p className="mt-1 text-[13.5px] leading-relaxed text-fg-muted">{s.body}</p>
                    </div>
                    <div className="col-start-2 sm:col-start-3">
                      <ButtonLink to={s.to} size="sm" variant={isNext ? 'primary' : 'secondary'} iconRight={<ArrowRight aria-hidden className="size-3.5" />}>
                        {s.done ? 'Open' : 'Go'}
                      </ButtonLink>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>

        <aside className="order-first min-w-0 space-y-4 lg:order-none" aria-label="Run the demo automatically">
          <Card>
            <CardHeader
              title="Run the demo for me"
              description={`Does steps 1–4 with the real flows: uses your demo wallet (or asks the faucet for one), creates an identity if you have none, sends ${DEMO_SEND_AMOUNT} NEAR to yourself and scans for it.`}
              className="mb-4"
            />
            {run.status === 'idle' && (
              <Button full icon={<Play aria-hidden className="size-4" />} onClick={() => void start()}>
                {coreDone ? 'Run it again' : 'Run steps 1–4'}
              </Button>
            )}
            {run.status !== 'idle' && (
              <Timeline
                label="Automatic demo progress"
                steps={RUN_PHASES.map((p) => ({ id: p, label: PHASE_LABEL[p], detail: run.detail[p], status: phaseStatus(p) }))}
              />
            )}
            {run.status === 'error' && run.error && (
              <div className="mt-4 space-y-3">
                <Callout tone="danger" role="alert" title={run.error.title}>
                  {run.error.message}
                  {run.errorTxHash && (
                    <span className="mt-2 block">
                      <TxLink hash={run.errorTxHash} label="Check" />
                    </span>
                  )}
                </Callout>
                <Button variant="secondary" icon={<RotateCcw aria-hidden className="size-4" />} onClick={() => void start()}>
                  Try again
                </Button>
              </div>
            )}
            {run.status === 'done' && run.result && (
              <div className="mt-5 space-y-3 border-t border-line pt-4">
                <p className="text-[14px] text-fg">{run.result.found ? 'Done — the payment is waiting in your Inbox.' : 'Done.'}</p>
                <div className="flex flex-col gap-2">
                  <TxLink hash={run.result.txHash} />
                  <AddressChip value={run.result.stealthAccount} size="sm" explorer label="Fresh account" className="self-start" />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <ButtonLink to="/app/inbox" size="sm" iconRight={<ArrowRight aria-hidden className="size-3.5" />}>
                    Open Inbox (steps 5–6)
                  </ButtonLink>
                  <Button size="sm" variant="ghost" onClick={reset}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </Card>
          <Callout tone="info">
            Testnet only. Keys live unencrypted in this browser; nothing here has value. Want to do it by hand? Follow the steps one by one — start with{' '}
            <Link to="/app/settings" className="underline underline-offset-4">
              the demo wallet
            </Link>
            .
          </Callout>
        </aside>
      </div>
    </>
  );
}
