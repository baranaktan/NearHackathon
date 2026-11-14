import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

type CardTone = 'raised' | 'sunken' | 'outline';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  tone?: CardTone;
  as?: 'section' | 'div' | 'article' | 'aside';
  padded?: boolean;
}

const tones: Record<CardTone, string> = {
  raised: 'border border-line bg-surface shadow-lift',
  sunken: 'border border-line bg-surface-2/60',
  outline: 'border border-line',
};

export function Card({ tone = 'raised', as: Tag = 'section', padded = true, className, children, ...rest }: CardProps) {
  return (
    <Tag className={cn('min-w-0 rounded-xl', tones[tone], padded && 'p-5 sm:p-6', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  titleId,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleId?: string;
}) {
  return (
    <header className={cn('mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3', className)}>
      <div className="min-w-0 flex-1 basis-60">
        {eyebrow && <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-brass-text">{eyebrow}</p>}
        <h2 id={titleId} className="text-[17px] font-semibold tracking-[-0.01em] text-fg">
          {title}
        </h2>
        {description && <p className="mt-1.5 max-w-prose text-[14px] leading-relaxed text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A definition row: label on the left, value on the right (stacks on narrow screens). */
export function DataRow({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6', className)}>
      <dt className="shrink-0 text-[13px] text-fg-muted">{label}</dt>
      <dd className="min-w-0 text-[14px] text-fg sm:text-right">{children}</dd>
    </div>
  );
}
