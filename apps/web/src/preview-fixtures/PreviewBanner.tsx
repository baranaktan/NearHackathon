/**
 * PREVIEW ONLY — the strip that says "sample data" and lets reviewers flip
 * between UI states. Remove together with this folder.
 */
import { Link, useLocation, useSearchParams } from 'react-router';
import { cn } from '../lib/cn';
import { PREVIEW_STATES, type PreviewRoute } from './preview-state';

export function PreviewBanner() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const states = (PREVIEW_STATES as Record<string, readonly string[]>)[pathname as PreviewRoute];
  if (!states) return null;
  const current = params.get('state') ?? states[0];
  return (
    <div className="border-b border-dashed border-brass/50 bg-brass/[0.06]">
      <div className="mx-auto flex max-w-[960px] flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 sm:px-8">
        <p className="text-[12.5px] text-fg-muted">
          <span className="font-medium text-brass-text">Preview data.</span> Not connected to testnet yet.
        </p>
        <nav aria-label="Preview state" className="-mx-1 flex max-w-full gap-1 overflow-x-auto scrollbar-none">
          {states.map((s) => (
            <Link
              key={s}
              to={{ pathname, search: `?state=${s}` }}
              aria-current={s === current ? 'true' : undefined}
              className={cn(
                'inline-flex h-7 shrink-0 items-center rounded-full px-2.5 font-mono text-[11.5px]',
                s === current ? 'bg-brass/20 text-fg' : 'text-fg-faint hover:text-fg',
              )}
            >
              {s}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
