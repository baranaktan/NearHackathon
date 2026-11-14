import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react';
import { cn } from '../lib/cn';

/* ---------------------------------- Skeleton --------------------------------- */

export function Skeleton({ className, rounded = 'md' }: { className?: string; rounded?: 'sm' | 'md' | 'full' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'skeleton block',
        rounded === 'full' ? 'rounded-full' : rounded === 'sm' ? 'rounded-sm' : 'rounded-md',
        className,
      )}
    />
  );
}

/* --------------------------------- EmptyState -------------------------------- */

/** A drawn-closed stage: three small pleats over an empty floor line. */
function EmptyStageArt() {
  return (
    <svg width="88" height="56" viewBox="0 0 88 56" aria-hidden className="text-line-strong">
      <rect x="4" y="3" width="80" height="2.5" rx="1.25" fill="var(--brass)" opacity="0.7" />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <rect key={i} x={8 + i * 9} y="8" width="8" height="40" rx="1" className={i % 2 ? 'fill-velvet-mid' : 'fill-velvet-light'} opacity={0.85} />
      ))}
      <path d="M2 51.5h84" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function EmptyState({
  title,
  children,
  action,
  art = true,
  className,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  art?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {art && <EmptyStageArt />}
      <h3 className={cn('font-display text-[26px] leading-tight text-fg', art && 'mt-5')}>{title}</h3>
      {children && <div className="mt-2 max-w-sm text-[14px] leading-relaxed text-fg-muted">{children}</div>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/* ---------------------------------- Callout ---------------------------------- */

export type CalloutTone = 'info' | 'success' | 'warn' | 'danger';

const calloutTone: Record<CalloutTone, { box: string; icon: typeof Info }> = {
  info: { box: 'border-brass/40 bg-brass/[0.06] [--c:var(--brass-text)]', icon: Info },
  success: { box: 'border-success/40 bg-success/[0.07] [--c:var(--success)]', icon: CheckCircle2 },
  warn: { box: 'border-warn/45 bg-warn/[0.07] [--c:var(--warn)]', icon: AlertTriangle },
  danger: { box: 'border-danger/45 bg-danger/[0.07] [--c:var(--danger)]', icon: OctagonAlert },
};

export function Callout({
  tone = 'info',
  title,
  children,
  action,
  className,
  role,
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  role?: 'alert' | 'status';
}) {
  const { box, icon: Icon } = calloutTone[tone];
  return (
    <div role={role} className={cn('flex gap-3 rounded-lg border px-4 py-3.5', box, className)}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-(--c)" />
      <div className="min-w-0 flex-1 text-[14px] leading-relaxed">
        {title && <p className="font-medium text-fg">{title}</p>}
        {children && <div className={cn('text-fg-muted', title ? 'mt-0.5' : undefined)}>{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}
