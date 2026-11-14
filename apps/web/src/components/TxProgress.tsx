/**
 * Step-level progress for one chain action (sign → broadcast/execute →
 * read back), with messages that change with the time already spent waiting.
 */
import type { ReactNode } from 'react';
import { Timeline, type StepStatus } from '../ui/Stepper';
import type { TxStep } from '../flows/tx';
import { useElapsed, waitMessage } from '../lib/tx-wait';

const ORDER: TxStep[] = ['sign', 'broadcast', 'confirm'];

export interface TxProgressProps {
  step: TxStep;
  /** When the action started (for the elapsed-time messages). */
  startedAtMs: number;
  /** Labels per step; defaults describe a generic transaction. */
  labels?: Partial<Record<TxStep, ReactNode>>;
  label?: string;
}

export function TxProgress({ step, startedAtMs, labels, label = 'Transaction progress' }: TxProgressProps) {
  const seconds = useElapsed(startedAtMs);
  const at = ORDER.indexOf(step);
  const st = (i: number): StepStatus => (i < at ? 'done' : i === at ? 'active' : 'pending');
  // Not a live region: the seconds tick every second and would be read out each time.
  const detail = (s: TxStep, i: number) => (i === at ? waitMessage(s, seconds) : undefined);
  return (
    <Timeline
      label={label}
      steps={[
        { id: 'sign', label: labels?.sign ?? 'Signed in your browser', detail: detail('sign', 0), status: st(0) },
        { id: 'broadcast', label: labels?.broadcast ?? 'Broadcast and executed on NEAR testnet', detail: detail('broadcast', 1), status: st(1) },
        { id: 'confirm', label: labels?.confirm ?? 'Result read back from chain', detail: detail('confirm', 2), status: st(2) },
      ]}
    />
  );
}

/** One-line version for tight spots (a list row). */
export function TxWaitLine({ step, startedAtMs }: { step: TxStep; startedAtMs: number }) {
  const seconds = useElapsed(startedAtMs);
  return <>{waitMessage(step, seconds)}</>;
}
