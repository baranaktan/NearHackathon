import type { ReactNode } from 'react';
import { m } from 'motion/react';
import { useMotionUnavailable } from '../lib/motion-status';

/**
 * Content that fades in from 8 px below. Without the animation code (it failed
 * to download) it is simply shown: remounted with `initial={false}`, so it
 * renders at full opacity instead of staying at its starting style.
 */
export function FadeUp({ children, duration = 0.35, className }: { children: ReactNode; duration?: number; className?: string }) {
  const off = useMotionUnavailable();
  return (
    <m.div key={off ? 'static' : 'animated'} initial={off ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration }} className={className}>
      {children}
    </m.div>
  );
}
