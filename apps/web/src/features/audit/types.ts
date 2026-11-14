/** View model for Audit: a viewing key gives a read-only list of incoming payments. */

export interface AuditEntry {
  stealthAccount: string;
  amountYocto: string;
  balanceYocto: string;
  timestampMs: number;
  announcementIndex: number;
  /** Balance moved out since receipt. */
  spent: boolean;
}

export type AuditState =
  | { status: 'idle' }
  | { status: 'scanning'; scanned: number; total: number | null }
  | { status: 'done'; metaAddress: string; entries: AuditEntry[]; totalYocto: string }
  | { status: 'error'; message: string };

export interface AuditModel {
  keyInput: string;
  setKeyInput(v: string): void;
  keyError: string | null;
  state: AuditState;
  run(): void;
  clear(): void;
}
