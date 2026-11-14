import { useId, type SVGProps } from 'react';
import { cn } from '../lib/cn';

/**
 * The Perde mark: a curtain on a rod, gathered to the left by a tieback.
 * Its silhouette is a lowercase-ish "P" — the bowl is the swept fabric,
 * the stem is the fall below the tieback. Monochrome, `currentColor`-driven.
 * Geometry lives in a 32×32 box; keep in sync with public/favicon.svg.
 */
const MARK_PATHS = {
  rod: 'M3 2.5h26a1.1 1.1 0 0 1 0 2.2H3a1.1 1.1 0 0 1 0-2.2Z',
  body: 'M4 6.4H20C25.4 6.4 28.3 8.8 27.6 12C26.9 15.4 21.2 17.3 11.4 18.4H4ZM4 20.6H11C11.2 24 11.9 27 13.4 29.4H4Z',
  folds:
    'M8.6 6.4C8.9 11 8.6 15 7.3 18.4M13.4 6.4C14 11 12.6 15.4 9.6 18.4M18.6 6.4C20.2 10.8 17.8 15.4 11.6 18.3M7.4 20.6C7.6 24 8 27 8.4 29.4M9.5 20.6C9.8 24 10.4 27 11.1 29.4',
} as const;

type MarkProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  size?: number | string;
  /** Accessible name. Omit when the mark sits next to visible text. */
  title?: string;
};

export function LogoMark({ size = 28, title, className, ...rest }: MarkProps) {
  const maskId = `perde-mark-${useId().replace(/:/g, '')}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="currentColor"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn('shrink-0', className)}
      {...rest}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
          <path d={MARK_PATHS.body} fill="#fff" />
          <path d={MARK_PATHS.folds} fill="none" stroke="#000" strokeWidth={1.25} strokeLinecap="round" />
        </mask>
      </defs>
      <path d={MARK_PATHS.rod} />
      <rect width="32" height="32" mask={`url(#${maskId})`} />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-display leading-none tracking-[-0.01em]', className)} translate="no">
      perde
    </span>
  );
}

type LogoProps = {
  variant?: 'mark' | 'wordmark' | 'lockup';
  /** Overall height in px; the wordmark scales with it. */
  size?: number;
  className?: string;
  /** Render the mark in the accent crimson while the wordmark keeps currentColor. */
  accentMark?: boolean;
};

export function Logo({ variant = 'lockup', size = 28, className, accentMark = false }: LogoProps) {
  if (variant === 'mark') return <LogoMark size={size} title="Perde" className={cn(accentMark && 'text-accent-text', className)} />;
  if (variant === 'wordmark')
    return (
      <span className={className} style={{ fontSize: size * 1.15 }} aria-label="Perde">
        <Wordmark />
      </span>
    );
  return (
    <span className={cn('inline-flex items-center gap-[0.32em]', className)} style={{ fontSize: size * 1.12 }} aria-label="Perde">
      <LogoMark size={size} className={cn(accentMark && 'text-accent-text', 'translate-y-[0.03em]')} />
      <Wordmark className="translate-y-[0.02em]" />
    </span>
  );
}
