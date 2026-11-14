import { ArrowUpRight } from 'lucide-react';
import { cn } from '../lib/cn';
import { truncateMiddle } from '../lib/near-format';
import { explorerTxUrl } from '../config';

/** Transaction hash linking to the testnet explorer. */
export function TxLink({ hash, label = 'View transaction', className }: { hash: string; label?: string; className?: string }) {
  return (
    <a
      href={explorerTxUrl(hash)}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'group inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md text-[13px] text-fg underline decoration-line-strong underline-offset-4 hover:decoration-brass',
        className,
      )}
    >
      <span className="text-fg-muted">{label}</span>
      <span className="num truncate font-mono" translate="no" title={hash}>
        {truncateMiddle(hash, 6, 4)}
      </span>
      <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-fg-faint transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
      <span className="sr-only">(opens testnet explorer in a new tab)</span>
    </a>
  );
}
