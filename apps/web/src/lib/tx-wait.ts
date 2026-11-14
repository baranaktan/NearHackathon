/** Elapsed-time-aware wording for chain actions in progress. */
import { useEffect, useState } from 'react';
import type { TxStep } from '../flows/tx';

/** Whole seconds since `startedAtMs`, ticking once a second while `active`. */
export function useElapsed(startedAtMs: number | null, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAtMs === null || !active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [startedAtMs, active]);
  return startedAtMs === null ? 0 : Math.max(0, Math.floor((now - startedAtMs) / 1000));
}

/** What to tell someone waiting at `step`, `seconds` after the action started. */
export function waitMessage(step: TxStep, seconds: number): string {
  if (step === 'sign') return 'Signing in this browser — the key never leaves this device.';
  if (step === 'broadcast') {
    if (seconds < 6) return `Waiting for NEAR testnet to execute it… usually 1–3 s${seconds >= 1 ? ` · ${seconds} s` : ''}`;
    if (seconds < 20) return `Taking longer than usual (${seconds} s). Testnet is busy; the transaction is signed once, so waiting can’t pay twice.`;
    return `Still waiting (${seconds} s). If no node answers, you’ll get the transaction hash to check on the explorer before retrying.`;
  }
  if (seconds < 10) return `Reading the result back from chain… usually under 2 s · ${seconds} s`;
  return `The RPC node is a block or two behind (${seconds} s). The transaction already executed; this is only the read-back.`;
}
