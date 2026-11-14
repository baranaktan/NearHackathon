import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '../lib/cn';
import { VeilMark } from '../ui/AddressChip';

export interface LedgerRowData {
  id: string;
  /** Short tx hash or block label shown in the first column. */
  ref: string;
  from: string;
  to: ReactNode;
  amount: string;
  /** Visual emphasis: the row the story is about. */
  highlight?: 'exposed' | 'veiled';
}

/*
 * Two layouts: a four-column explorer table, and a stacked list where each row
 * reads "ref / from → to … amount". `auto` switches to stacked below 640px.
 * Class strings are written out in full so Tailwind can see them.
 */
const L = {
  auto: {
    thead: 'max-sm:sr-only',
    tr: 'max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-3 max-sm:gap-y-1 max-sm:py-3 max-sm:first:border-t-0',
    ref: 'max-sm:col-span-2 max-sm:py-0 max-sm:text-[11px]',
    col: 'max-sm:hidden',
    pair: 'hidden max-sm:flex',
    amount: 'max-sm:py-0',
  },
  stacked: {
    thead: 'sr-only',
    tr: 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 py-3',
    ref: 'col-span-2 py-0! text-[11px]',
    col: 'hidden',
    pair: 'flex',
    amount: 'py-0!',
  },
} as const;

/**
 * A block-explorer-like list of transfers. Used in the landing hero and in the
 * app's "chain view" drawers, so the public-observer language is identical
 * everywhere.
 */
export function Ledger({
  rows,
  caption,
  className,
  layout = 'auto',
}: {
  rows: LedgerRowData[];
  caption?: string;
  className?: string;
  layout?: 'auto' | 'stacked';
}) {
  const c = L[layout];
  return (
    <div className={cn('min-w-0', className)}>
      <table className="w-full table-fixed border-collapse text-left">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className={c.thead}>
          <tr className="text-[10.5px] uppercase tracking-[0.16em] text-fg-faint">
            <th scope="col" className="w-[17%] pb-2.5 font-medium">Tx</th>
            <th scope="col" className="w-[31%] pb-2.5 font-medium">From</th>
            <th scope="col" className="w-[31%] pb-2.5 font-medium">To</th>
            <th scope="col" className="w-[21%] pb-2.5 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody className="font-mono text-[12.5px] sm:text-[13px]">
          {rows.map((r, i) => (
            <tr key={r.id} className={cn(c.tr, i > 0 || layout === 'auto' ? 'border-t border-line' : '', r.highlight ? 'text-fg' : 'text-fg-faint')}>
              <td className={cn('num truncate py-3 pr-3', c.ref, r.highlight && 'text-fg-faint')}>{r.ref}</td>
              <td className={cn('truncate py-3 pr-3', c.col)} translate="no">
                {r.from}
              </td>
              <td className={cn('py-3 pr-3', c.col)} translate="no">
                <ToCell to={r.to} highlight={r.highlight} />
              </td>
              <td className={cn('min-w-0 items-center gap-1.5', c.pair)} translate="no">
                <span className="min-w-0 truncate">{r.from}</span>
                <ArrowRight aria-hidden className="size-3 shrink-0 opacity-60" />
                <ToCell to={r.to} highlight={r.highlight} />
              </td>
              <td className={cn('num whitespace-nowrap py-3 text-right', c.amount)}>{r.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ToCell({ to, highlight }: { to: ReactNode; highlight?: LedgerRowData['highlight'] }) {
  if (highlight === 'exposed')
    return (
      <span className="inline-flex min-w-0 max-w-full items-center rounded-sm bg-accent/15 px-1.5 py-0.5 text-accent-text ring-1 ring-accent-text/35">
        <span className="truncate">{to}</span>
      </span>
    );
  if (highlight === 'veiled')
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5">
        <VeilMark />
        <span className="truncate">{to}</span>
      </span>
    );
  return <span className="block min-w-0 truncate">{to}</span>;
}
