import type { ReactNode } from 'react';
import { m } from 'motion/react';
import { Eye } from 'lucide-react';
import { cn } from '../lib/cn';

export interface CurtainRevealProps {
  revealed: boolean;
  /** Called when the person presses the reveal control on the closed curtain. */
  onReveal?: () => void;
  /** Label on the closed curtain's button. */
  label?: string;
  /** Small line under the button, e.g. "Check no one can see your screen". */
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Keep a narrow gathered drape at both edges once open. */
  frame?: boolean;
  rounded?: string;
}

const EASE = [0.65, 0, 0.2, 1] as const;

/**
 * The signature motion: private content sits behind two velvet panels that
 * gather to the sides when revealed. Content stays mounted (no layout shift)
 * but is `inert` and hidden from assistive tech while the curtain is closed.
 */
export function CurtainReveal({
  revealed,
  onReveal,
  label = 'Reveal',
  hint,
  children,
  className,
  frame = true,
  rounded = 'rounded-xl',
}: CurtainRevealProps) {
  const gathered = frame ? 0.035 : 0;
  return (
    <div className={cn('relative isolate overflow-hidden', rounded, className)}>
      <div inert={!revealed} aria-hidden={!revealed || undefined} className={cn('transition-opacity duration-500', !revealed && 'opacity-0')}>
        {children}
      </div>

      {(['left', 'right'] as const).map((side) => (
        <m.div
          key={side}
          aria-hidden
          initial={false}
          animate={{ scaleX: revealed ? gathered : 1, opacity: revealed && !frame ? 0 : 1 }}
          transition={{ duration: revealed ? 0.9 : 0.6, ease: EASE, opacity: { delay: revealed ? 0.7 : 0, duration: 0.2 } }}
          style={{ originX: side === 'left' ? 0 : 1 }}
          className={cn(
            'velvet pointer-events-none absolute inset-y-0 z-10 w-1/2',
            side === 'left' ? 'left-0 shadow-[8px_0_24px_-12px_rgb(0_0_0/0.6)]' : 'right-0 shadow-[-8px_0_24px_-12px_rgb(0_0_0/0.6)]',
          )}
        />
      ))}

      {/* Brass hem along the top, like a pelmet. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-20 h-px bg-brass/60" />

      {!revealed && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 p-4 text-center">
          {onReveal && (
            <button
              type="button"
              onClick={onReveal}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d3b77f]/70 bg-[#1a0306]/70 px-5 text-[14px] font-medium text-[#f3ede2] shadow-[0_8px_24px_-8px_rgb(0_0_0/0.6)] backdrop-blur-sm transition-colors hover:border-[#d3b77f] hover:bg-[#1a0306]/85"
            >
              <Eye aria-hidden className="size-4" />
              {label}
            </button>
          )}
          {hint && <p className="max-w-xs text-[12.5px] leading-snug text-[#f3ede2]/85 [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">{hint}</p>}
        </div>
      )}
    </div>
  );
}
