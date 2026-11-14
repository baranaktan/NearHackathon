import { Link } from 'react-router';
import { Wallet } from 'lucide-react';
import { useAppState } from '../../state/context';
import { formatYocto, truncateMiddle } from '../../lib/near-format';
import { Skeleton } from '../../ui/Feedback';
import { cn } from '../../lib/cn';

/** Compact "who pays" card for the sidebar / mobile top bar. Links to Settings. */
export function WalletWidget({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { wallet, balance } = useAppState();
  const amount =
    balance.status === 'ready' ? (
      <span className="num font-mono">{formatYocto(balance.spendableYocto, { maxFractionDigits: compact ? 2 : 4 })} NEAR</span>
    ) : balance.status === 'loading' ? (
      <Skeleton className="inline-block h-3.5 w-16 align-middle" />
    ) : balance.status === 'missing' ? (
      <span className="text-danger">not found</span>
    ) : balance.status === 'error' ? (
      <span className="text-warn">balance unavailable</span>
    ) : null;

  if (compact) {
    return (
      <Link
        to="/app/settings"
        className={cn(
          'inline-flex h-9 min-w-0 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line-strong px-3 text-[12px] text-fg-muted hover:border-brass hover:text-fg',
          className,
        )}
        aria-label={wallet ? `Demo wallet ${wallet.accountId}` : 'Get a demo wallet'}
      >
        <Wallet aria-hidden className="size-3.5 shrink-0" />
        {wallet ? amount : <span>Get wallet</span>}
      </Link>
    );
  }

  return (
    <Link
      to="/app/settings"
      className={cn('block rounded-lg border border-line px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-surface-2/60', className)}
    >
      <span className="flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.16em] text-fg-faint">
        <Wallet aria-hidden className="size-3.5" />
        Demo wallet
      </span>
      {wallet ? (
        <>
          <span className="mt-1.5 block truncate font-mono text-[12.5px] text-fg" title={wallet.accountId} translate="no">
            {truncateMiddle(wallet.accountId, 12, 10)}
          </span>
          <span className="mt-0.5 block text-[12.5px] text-fg-muted">{amount}</span>
        </>
      ) : (
        <span className="mt-1.5 block text-[13px] text-accent-text">Get a demo wallet →</span>
      )}
    </Link>
  );
}
