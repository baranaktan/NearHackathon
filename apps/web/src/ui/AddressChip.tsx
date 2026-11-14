import { ArrowUpRight } from 'lucide-react';
import { cn } from '../lib/cn';
import { isImplicitAccount, truncateMiddle } from '../lib/near-format';
import { explorerAccountUrl } from '../config';
import { CopyButton } from './CopyButton';

export interface AddressChipProps {
  value: string;
  /** Characters kept on each side when middle-truncating. */
  head?: number;
  tail?: number;
  /** Show the whole value, wrapping anywhere (detail views). */
  full?: boolean;
  copy?: boolean;
  /** Link to the account on the testnet explorer. Ignored for meta-addresses. */
  explorer?: boolean;
  /** Marks a stealth account with the velvet tab. Defaults to true for 64-hex ids. */
  veiled?: boolean;
  /** Accessible description of what this is ("Stealth account"). */
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** Velvet tab — the visual shorthand for "a fresh account behind the curtain". */
export function VeilMark({ className }: { className?: string }) {
  return <span aria-hidden className={cn('velvet-fine inline-block h-3.5 w-2 shrink-0 rounded-[2px]', className)} />;
}

export function AddressChip({
  value,
  head = 6,
  tail = 6,
  full = false,
  copy = true,
  explorer = false,
  veiled,
  label,
  size = 'md',
  className,
}: AddressChipProps) {
  const isHex = isImplicitAccount(value);
  const isMeta = value.startsWith('perde:') || value.startsWith('perdeview:');
  const showVeil = veiled ?? isHex;
  const shown = full ? value : isHex || isMeta ? truncateMiddle(value, isMeta ? head + 6 : head, tail) : value;

  return (
    <span
      className={cn(
        'inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-line bg-surface-2/70 pl-2 font-mono text-fg',
        size === 'sm' ? 'h-7 text-[12px]' : 'min-h-8 text-[13px]',
        full && 'h-auto py-1.5',
        !copy && !explorer && 'pr-2',
        className,
      )}
    >
      {showVeil && <VeilMark />}
      <span className={cn('num min-w-0', full ? 'break-hex' : 'truncate')} title={value} translate="no">
        {label && <span className="sr-only">{label}: </span>}
        {shown}
      </span>
      {(copy || explorer) && (
        <span className="flex shrink-0 items-center pr-0.5">
          {copy && <CopyButton value={value} label={`Copy ${label ?? 'address'}`} />}
          {explorer && !isMeta && (
            <a
              href={explorerAccountUrl(value)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${label ?? 'account'} on explorer (new tab)`}
              title="Open on testnet explorer"
              className="relative inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface-3 hover:text-fg after:absolute after:left-1/2 after:top-1/2 after:size-11 after:-translate-1/2 after:content-['']"
            >
              <ArrowUpRight aria-hidden className="size-4" />
            </a>
          )}
        </span>
      )}
    </span>
  );
}
