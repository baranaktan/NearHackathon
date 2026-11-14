/** View model for Verify receipt: checks a "perdereceipt:…" string against the chain. */

export interface VerifyCheck {
  id: string;
  label: string;
  /** What exactly was compared, shown in mono. */
  detail: string;
  status: 'pass' | 'fail' | 'skipped';
}

export interface ReceiptSummary {
  metaAddress: string;
  stealthAccount: string;
  amountYocto: string | null;
  txHash: string | null;
  timestampMs: number | null;
}

export type VerifyState =
  | { status: 'idle' }
  | { status: 'verifying' }
  | { status: 'verified'; summary: ReceiptSummary; checks: VerifyCheck[] }
  | { status: 'failed'; summary: ReceiptSummary | null; reason: string; checks: VerifyCheck[] }
  /** Not a parseable receipt at all. */
  | { status: 'invalid'; message: string };

export interface VerifyModel {
  input: string;
  setInput(v: string): void;
  state: VerifyState;
  verify(): void;
  clear(): void;
}
