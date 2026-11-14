/**
 * Animation code (`motion-features`) is downloaded lazily by <LazyMotion> in
 * App.tsx. If that download fails (flaky network, a tab left open across a
 * redeploy), no `m` element ever animates or updates its animated styles: an
 * element would stay at its `initial` values (e.g. opacity 0) and an
 * <AnimatePresence> exit would never finish. Components that animate read
 * this flag and then render their end state directly instead.
 */
import { createContext, useContext } from 'react';

export const MotionUnavailableContext = createContext(false);

/** True once the animation code has failed to load: render the final state, without animation. */
export function useMotionUnavailable(): boolean {
  return useContext(MotionUnavailableContext);
}
