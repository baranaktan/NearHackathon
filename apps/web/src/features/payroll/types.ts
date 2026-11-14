/** View model for Payroll: CSV → validated rows → one transaction with many `send` actions. */

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

export interface PayrollResult {
  line: number;
  recipient: string;
  amountYocto: string;
  stealthAccount: string | null;
  status: 'sent' | 'failed';
  message?: string;
}

export type PayrollPhase =
  | { phase: 'input' }
  | { phase: 'review' }
  | { phase: 'submitting' }
  | { phase: 'done'; txHash: string; results: PayrollResult[] }
  | { phase: 'error'; message: string };

export interface PayrollModel {
  csv: string;
  setCsv(v: string): void;
  loadFile(file: File): void;
  rows: PayrollRow[];
  validCount: number;
  invalidCount: number;
  totalYocto: string;
  feeYocto: string;
  /** Upper bound of actions per transaction. */
  maxRows: number;
  sender: { accountId: string; balanceYocto: string } | null;
  phase: PayrollPhase;
  review(): void;
  submit(): void;
  back(): void;
  reset(): void;
}
