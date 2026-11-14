import { useState } from 'react';
import { EyeOff } from 'lucide-react';
import { cn } from '../lib/cn';
import { CurtainReveal } from './CurtainReveal';
import { CopyButton } from './CopyButton';

export interface SecretPhraseProps {
  /** The 12 words. Rendered into the DOM only while revealed. */
  words: string[];
  /** Start revealed (e.g. right after the person asked to see it). */
  defaultRevealed?: boolean;
  allowCopy?: boolean;
  className?: string;
}

export function SecretPhrase({ words, defaultRevealed = false, allowCopy = true, className }: SecretPhraseProps) {
  const [revealed, setRevealed] = useState(defaultRevealed);
  const cells = revealed ? words : words.map(() => '');

  return (
    <div className={cn('min-w-0', className)}>
      <CurtainReveal
        revealed={revealed}
        onReveal={() => setRevealed(true)}
        label="Reveal recovery phrase"
        hint="Check that nobody can see your screen."
        className="border border-line bg-surface-2/60"
      >
        <ol className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-5 py-5 sm:grid-cols-3 sm:px-7" aria-label="Recovery phrase">
          {cells.map((w, i) => (
            <li key={i} className="flex min-w-0 items-baseline gap-2.5 rounded-md border border-line bg-surface px-3 py-2.5">
              <span className="num w-5 shrink-0 text-right font-mono text-[11px] text-fg-faint">{i + 1}</span>
              <span className={cn('min-w-0 truncate font-mono text-[15px] text-fg', !w && 'select-none')} translate="no">
                {w || '•••••'}
              </span>
            </li>
          ))}
        </ol>
      </CurtainReveal>
      <div className="mt-3 flex min-h-9 flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-fg-faint">
          {words.length} words · anyone with these can spend your payments.
        </p>
        {revealed && (
          <div className="flex items-center gap-1">
            {allowCopy && <CopyButton value={words.join(' ')} label="Copy recovery phrase" withText />}
            <button
              type="button"
              onClick={() => setRevealed(false)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-fg-muted hover:bg-surface-3 hover:text-fg"
            >
              <EyeOff aria-hidden className="size-4" />
              Hide
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
