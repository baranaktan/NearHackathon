/** View model for Payroll: CSV → validated rows → one transaction (or a few) with many `send` actions. */

export interface PayrollRow {
  /** 1-based CSV line number. */
  line: number;
  recipient: string;
  amountInput: string;
  amountYocto: string | null;
  memo: string;
  kind: 'meta' | 'name' | null;
  error: string | null;
}

/** A parsed row after on-chain checks (names resolved, contract minimum). */
export interface CheckedRow extends PayrollRow {
  status: 'invalid' | 'resolving' | 'ready';
  /** Why the row can't be paid (parse error, unregistered name, below minimum). */
  problem: string | null;
  metaAddress: string | null;
}

export interface PayrollResult {
  line: number;
  recipient: string;
  amountYocto: string;
  memo: string;
  status: 'sent' | 'not-sent';
  stealthAccount: string | null;
  announcementIndex: number | null;
  receipt: string | null;
  txHash: string | null;
  /** 1-based transaction number within the run. */
  txNumber: number | null;
}

export type PayrollPhase =
  | { phase: 'input' }
  | { phase: 'review' }
  | { phase: 'submitting'; tx: number; of: number; step: 'sign' | 'broadcast' | 'confirm' }
  | { phase: 'done'; results: PayrollResult[]; txs: string[]; /** Set when a later transaction failed after earlier ones landed. */ partialError: string | null }
  | { phase: 'error'; message: string };

export interface PayrollModel {
  csv: string;
  setCsv(v: string): void;
  loadFile(file: File): void;
  rows: CheckedRow[];
  validCount: number;
  invalidCount: number;
  resolvingCount: number;
  totalYocto: string;
  feeYocto: string;
  /** Upper bound of gas the transactions can reserve (unused part refunded). */
  gasYocto: string;
  /** Payments per transaction (gas limit). */
  maxPerTx: number;
  /** Number of transactions the valid rows need. */
  txCount: number;
  maxRows: number;
  sender: { accountId: string; balanceYocto: string | null } | null;
  /** Total + fees + gas exceeds the spendable balance. */
  balanceProblem: string | null;
  limitsError: string | null;
  phase: PayrollPhase;
  canLoadSample: boolean;
  loadSample(): void;
  review(): void;
  submit(): void;
  back(): void;
  reset(): void;
}
