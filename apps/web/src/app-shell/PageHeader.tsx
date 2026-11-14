import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 sm:mb-10">
      <div className="min-w-0 max-w-2xl">
        <p className="mb-3 flex items-center gap-2.5 text-[11.5px] font-medium uppercase tracking-[0.18em] text-brass-text">
          <span aria-hidden className="h-px w-6 bg-brass/60" />
          {eyebrow}
        </p>
        <h1 className="text-display text-[40px] text-fg sm:text-[52px]">{title}</h1>
        {description && <p className="mt-3 text-[15.5px] leading-relaxed text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
