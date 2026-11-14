import type { ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { Spinner } from './Spinner';

export type StepStatus = 'pending' | 'active' | 'done' | 'error';

export interface Step {
  id: string;
  label: ReactNode;
  detail?: ReactNode;
  status: StepStatus;
}

function Node({ status, index }: { status: StepStatus; index: number }) {
  return (
    <span
      className={cn(
        'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-medium num',
        status === 'done' && 'border-success/60 bg-success/12 text-success',
        status === 'active' && 'border-brass bg-surface text-brass-text',
        status === 'error' && 'border-danger/60 bg-danger/12 text-danger',
        status === 'pending' && 'border-line-strong bg-surface text-fg-faint',
      )}
    >
      {status === 'done' ? (
        <Check aria-hidden className="size-3.5" />
      ) : status === 'error' ? (
        <X aria-hidden className="size-3.5" />
      ) : status === 'active' ? (
        <Spinner size={14} />
      ) : (
        index + 1
      )}
    </span>
  );
}

const statusText: Record<StepStatus, string> = {
  pending: 'not started',
  active: 'in progress',
  done: 'complete',
  error: 'failed',
};

/** Vertical timeline for multi-step transactions. */
export function Timeline({ steps, className, label = 'Progress' }: { steps: Step[]; className?: string; label?: string }) {
  return (
    <ol className={cn('flex flex-col', className)} aria-label={label}>
      {steps.map((s, i) => (
        <li key={s.id} className="relative flex gap-3.5 pb-5 last:pb-0" aria-current={s.status === 'active' ? 'step' : undefined}>
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className={cn('absolute left-[13.5px] top-7 bottom-0 w-px', s.status === 'done' ? 'bg-success/50' : 'bg-line-strong')}
            />
          )}
          <Node status={s.status} index={i} />
          <div className="min-w-0 pt-0.5">
            <p className={cn('text-[14px] font-medium', s.status === 'pending' ? 'text-fg-muted' : 'text-fg')}>
              {s.label}
              <span className="sr-only"> — {statusText[s.status]}</span>
            </p>
            {s.detail && <div className="mt-1 text-[13px] leading-snug text-fg-muted">{s.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Compact horizontal stepper for flows (Edit → Review → Done). */
export function Stepper({ steps, className }: { steps: Array<{ id: string; label: string; status: StepStatus }>; className?: string }) {
  return (
    <ol className={cn('flex items-center gap-2 text-[13px]', className)} aria-label="Steps">
      {steps.map((s, i) => (
        <li key={s.id} className="flex min-w-0 items-center gap-2" aria-current={s.status === 'active' ? 'step' : undefined}>
          <span
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] num',
              s.status === 'done' && 'border-success/60 text-success',
              s.status === 'active' && 'border-brass bg-brass/15 text-brass-text',
              s.status === 'error' && 'border-danger/60 text-danger',
              s.status === 'pending' && 'border-line-strong text-fg-faint',
            )}
            aria-hidden
          >
            {s.status === 'done' ? <Check className="size-3" /> : i + 1}
          </span>
          <span className={cn('truncate', s.status === 'active' ? 'text-fg' : 'text-fg-muted')}>
            {s.label}
            <span className="sr-only"> — {statusText[s.status]}</span>
          </span>
          {i < steps.length - 1 && <span aria-hidden className="h-px w-5 shrink-0 bg-line-strong sm:w-8" />}
        </li>
      ))}
    </ol>
  );
}
