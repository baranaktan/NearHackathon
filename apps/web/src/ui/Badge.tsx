import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warn' | 'danger' | 'brass';

const tones: Record<BadgeTone, string> = {
  neutral: 'border-line-strong text-fg-muted',
  accent: 'border-accent-text/40 bg-accent/12 text-accent-text',
  success: 'border-success/40 bg-success/10 text-success',
  warn: 'border-warn/45 bg-warn/10 text-warn',
  danger: 'border-danger/45 bg-danger/10 text-danger',
  brass: 'border-brass/50 text-brass-text',
};

const dots: Record<BadgeTone, string> = {
  neutral: 'bg-fg-faint',
  accent: 'bg-accent-text',
  success: 'bg-success',
  warn: 'bg-warn',
  danger: 'bg-danger',
  brass: 'bg-brass',
};

export function Badge({
  tone = 'neutral',
  dot = false,
  pulse = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[11.5px] font-medium tracking-[0.02em]',
        tones[tone],
        className,
      )}
    >
      {dot && (
        <span className="relative flex size-1.5" aria-hidden>
          {pulse && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:hidden', dots[tone])} />}
          <span className={cn('relative size-1.5 rounded-full', dots[tone])} />
        </span>
      )}
      {children}
    </span>
  );
}
