import { cn } from '../lib/cn';

/** Persistent "Testnet · unaudited" marker. */
export function NetworkBadge({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-2 rounded-full border border-warn/40 px-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-warn',
        className,
      )}
      title="NEAR testnet · unaudited research prototype"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-warn" />
      Testnet
      {!compact && (
        <>
          <span aria-hidden className="text-warn/50">·</span>
          <span>unaudited</span>
        </>
      )}
      {compact && <span className="sr-only">, unaudited</span>}
    </span>
  );
}
