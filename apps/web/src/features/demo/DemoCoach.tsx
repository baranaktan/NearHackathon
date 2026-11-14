import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ArrowRight, Check, ListChecks, X } from 'lucide-react';
import { useAppState } from '../../state/context';
import { Sheet } from '../../ui/Dialog';
import { cn } from '../../lib/cn';
import { useDemoSteps } from './useDemoSteps';
import type { DemoStep } from './steps';

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label="Guided demo progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      <div className="h-full rounded-full bg-linear-to-r from-velvet-mid to-accent-text transition-[width] duration-500" style={{ width: `${(done / total) * 100}%` }} />
    </div>
  );
}

export function StepList({ steps, onNavigate, dense = false }: { steps: DemoStep[]; onNavigate?: () => void; dense?: boolean }) {
  const next = steps.find((s) => !s.done);
  return (
    <ol className={cn('space-y-1', dense && 'space-y-0.5')}>
      {steps.map((s) => {
        const isNext = s.id === next?.id;
        return (
          <li key={s.id}>
            <Link
              to={s.to}
              onClick={onNavigate}
              className={cn(
                'flex min-h-10 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors hover:bg-surface-2',
                isNext ? 'text-fg' : s.done ? 'text-fg-muted' : 'text-fg-faint',
              )}
              aria-current={isNext ? 'step' : undefined}
            >
              <span
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full border text-[10.5px] num',
                  s.done ? 'border-success/60 bg-success/12 text-success' : isNext ? 'border-brass text-brass-text' : 'border-line-strong',
                )}
                aria-hidden
              >
                {s.done ? <Check className="size-3" /> : s.n}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {s.title}
                {s.bonus && <span className="ml-1.5 text-fg-faint">· bonus</span>}
              </span>
              <span className="sr-only">{s.done ? '(done)' : isNext ? '(next)' : ''}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/** Desktop: a card at the bottom of the sidebar nav. */
export function DemoCoachCard() {
  const { dispatch } = useAppState();
  const { steps, done, total, next, dismissed } = useDemoSteps();
  const { pathname } = useLocation();
  if (dismissed || pathname === '/app/start') return null;
  return (
    <section aria-labelledby="coach-title" className="mx-0 mt-2 rounded-lg border border-brass/35 bg-surface-2/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="coach-title" className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-brass-text">
            Guided demo
          </h2>
          <p className="mt-1 text-[12.5px] text-fg-muted">
            <span className="num">{done}</span> of <span className="num">{total}</span> steps done
          </p>
        </div>
        <button
          type="button"
          onClick={() => dispatch({ type: 'demo/update', patch: { dismissed: true } })}
          aria-label="Hide the guided demo (bring it back from Settings)"
          title="Hide (bring it back from Settings)"
          className="relative -mr-1 -mt-1 inline-flex size-7 items-center justify-center rounded-md text-fg-faint hover:bg-surface-3 hover:text-fg after:absolute after:-inset-2 after:content-['']"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </div>
      <div className="mt-2.5">
        <Progress done={done} total={total} />
      </div>
      {next ? (
        <Link to={next.to} className="mt-3 flex items-start gap-2 rounded-md text-[13px] text-fg hover:text-accent-text">
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] text-fg-faint">Next · step {next.n}</span>
            {next.title}
          </span>
          <ArrowRight aria-hidden className="mt-4 size-3.5 shrink-0" />
        </Link>
      ) : (
        <p className="mt-3 text-[13px] text-success">All steps done.</p>
      )}
      <Link to="/app/start" className="mt-2 inline-flex min-h-8 items-center text-[12px] text-fg-muted underline decoration-line-strong underline-offset-4 hover:text-fg hover:decoration-brass">
        All steps{steps.some((s) => !s.done) ? ' · run it for me' : ''}
      </Link>
    </section>
  );
}

/** Mobile: a pill in the top bar that opens the checklist as a bottom sheet. */
export function DemoCoachPill() {
  const { steps, done, total, dismissed } = useDemoSteps();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  if (dismissed || pathname === '/app/start') return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-brass/50 px-3 text-[12px] font-medium text-brass-text"
      >
        <ListChecks aria-hidden className="size-3.5" />
        <span className="num">
          {done}/{total}
        </span>
        <span className="sr-only">guided demo steps done</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Guided demo" description="See it work in a minute — every step is a real testnet action." side="bottom">
        <Progress done={done} total={total} />
        <div className="mt-4 -mx-2">
          <StepList steps={steps} onNavigate={() => setOpen(false)} />
        </div>
        <Link
          to="/app/start"
          onClick={() => setOpen(false)}
          className="mt-4 inline-flex min-h-11 items-center gap-2 text-[14px] text-fg underline decoration-line-strong underline-offset-4 hover:decoration-brass"
        >
          Open the guided demo page <ArrowRight aria-hidden className="size-4" />
        </Link>
      </Sheet>
    </>
  );
}
