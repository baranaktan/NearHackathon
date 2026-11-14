/** View model for Audit: a viewing key gives a read-only list of incoming payments. */

export interface AuditEntry {
  stealthAccount: string;
  source: 'announcement' | 'invoice';
  /** Announced amount; for invoices the current balance (no amount is announced). */
  amountYocto: string;
  balanceYocto: string;
  exists: boolean;
  timestampMs: number | null;
  announcementIndex: number | null;
  invoiceIndex: number | null;
  /** held: balance ≥ amount · moved: account gone or emptied · partial: some moved out. */
  status: 'held' | 'partial' | 'moved';
}

export type AuditState =
  | { status: 'idle' }
  | { status: 'scanning'; scanned: number; total: number | null; stage: 'announcements' | 'invoices' | 'balances' }
  | { status: 'done'; metaAddress: string; entries: AuditEntry[]; announcedYocto: string; heldYocto: string; scanned: number }
  | { status: 'error'; message: string };

export interface AuditModel {
  keyInput: string;
  setKeyInput(v: string): void;
  keyError: string | null;
  /** This browser's own viewing key is available (shortcut). */
  canUseOwnKey: boolean;
  fillOwnKey(): void;
  state: AuditState;
  run(): void;
  clear(): void;
}
