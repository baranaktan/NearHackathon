import type { ReactNode } from 'react';
import { Eye, Globe } from 'lucide-react';
import { Sheet } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Ledger, type LedgerRowData } from './Ledger';

export function ChainViewButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="secondary" size="sm" icon={<Globe aria-hidden className="size-4" />} onClick={onClick}>
      Chain view
    </Button>
  );
}

export interface ChainViewProps {
  open: boolean;
  onClose: () => void;
  /** Rows exactly as a block explorer would list them. */
  observerRows: LedgerRowData[];
  observerNote: ReactNode;
  /** What only you (sender or recipient) know. */
  yourView: Array<{ label: string; value: ReactNode }>;
  yourRole: 'sender' | 'recipient';
}

/**
 * "Chain view vs your view": the same payment, from the public's seat and
 * from behind the curtain. Same visual language as the landing hero.
 */
export function ChainViewSheet({ open, onClose, observerRows, observerNote, yourView, yourRole }: ChainViewProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Chain view" description="The same payment, as the public sees it and as you see it.">
      <section aria-labelledby="cv-public">
        <h3 id="cv-public" className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-fg-faint">
          <Globe aria-hidden className="size-3.5" />
          Any observer
        </h3>
        <div className="rounded-lg border border-line bg-surface-2/50 px-3.5 pt-1">
          <Ledger rows={observerRows} caption="Public transfers" layout="stacked" />
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-fg-muted">{observerNote}</p>
      </section>

      <div aria-hidden className="relative my-7 h-4">
        <div className="velvet absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-sm" />
        <div className="absolute inset-x-0 top-0 h-px bg-brass/60" />
      </div>

      <section aria-labelledby="cv-yours">
        <h3 id="cv-yours" className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-brass-text">
          <Eye aria-hidden className="size-3.5" />
          Behind the curtain · {yourRole === 'sender' ? 'you, the sender' : 'you, the recipient'}
        </h3>
        <dl className="divide-y divide-line rounded-lg border border-brass/35 px-4">
          {yourView.map((r) => (
            <div key={r.label} className="flex flex-col gap-1 py-3">
              <dt className="text-[12.5px] text-fg-muted">{r.label}</dt>
              <dd className="min-w-0 text-[14px] text-fg">{r.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Sheet>
  );
}
