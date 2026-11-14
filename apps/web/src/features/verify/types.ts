/** View model for Verify receipt: checks a "perdereceipt:…" string against the chain. */

export interface VerifyCheck {
  id: string;
  label: string;
  /** What exactly was compared, shown in mono. */
  detail: string;
  /** "info" = context that is not pass/fail (e.g. the current balance). */
  status: 'pass' | 'fail' | 'skipped' | 'info';
}

export interface ReceiptSummary {
  metaAddress: string;
  stealthAccount: string;
  amountYocto: string | null;
  txHash: string | null;
  /** Whether `txHash` was checked against the chain (see the "tx" check row). */
  txCheck: 'match' | 'mismatch' | 'unchecked';
  timestampMs: number | null;
}

export type VerifyState =
  | { status: 'idle' }
  | { status: 'verifying' }
  | { status: 'verified'; summary: ReceiptSummary; checks: VerifyCheck[] }
  | { status: 'failed'; summary: ReceiptSummary | null; reason: string; checks: VerifyCheck[] }
  /** Not a parseable receipt at all. */
  | { status: 'invalid'; message: string }
  /** The chain could not be read. */
  | { status: 'error'; message: string };

export interface VerifyModel {
  input: string;
  setInput(v: string): void;
  state: VerifyState;
  verify(): void;
  clear(): void;
}
