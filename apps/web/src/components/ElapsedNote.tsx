import { useState } from 'react';
import { useElapsed } from '../lib/tx-wait';

/**
 * A waiting line for a chain action without step callbacks. Mount it when the
 * action starts: it counts from its own mount and changes its wording once
 * the wait is longer than `slowAfterS`.
 */
export function ElapsedNote({ doing, typical, slowAfterS = 12 }: { doing: string; typical: string; slowAfterS?: number }) {
  const [startedAt] = useState(() => Date.now());
  const s = useElapsed(startedAt);
  return (
    <p className="text-[12.5px] leading-snug text-fg-faint">
      {s < slowAfterS
        ? `${doing}… ${typical} · ${s} s`
        : `Taking longer than usual (${s} s). Testnet is busy; the transaction is signed once, so waiting can’t send it twice.`}
    </p>
  );
}
