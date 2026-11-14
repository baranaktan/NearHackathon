/** View model for the Inbox page (scan + claim). Amounts are yoctoNEAR strings. */
import type { ClaimRecord, SentRecord } from '../../state/schema';

export type ClaimMode = 'transfer' | 'deleteAccount';

export type ClaimState =
  | { status: 'unclaimed' }
  | { status: 'claiming'; destination: string }
  | { status: 'claimed'; destination: string; txHash: string; claimedYocto: string; mode: ClaimMode }
  | { status: 'error'; destination: string; message: string };

export interface FoundPayment {
  id: string;
  stealthAccount: string;
  /** Announced amount, or for invoices the balance seen (or claimed). */
  amountYocto: string;
  /** Live on-chain balance of the stealth account (null while loading). */
  balanceYocto: string | null;
  /** False once the account was deleted (full sweep) — nothing left to claim. */
  exists: boolean | null;
  /** Announcement time; for invoices the time the invoice was created here (if known). */
  timestampMs: number | null;
  /** Index in the announcement log; null for invoice payments (no announcement). */
  announcementIndex: number | null;
  invoiceIndex: number | null;
  /** Local note of the invoice, if any. */
  note: string;
  source: 'announcement' | 'invoice';
  claim: ClaimState;
  /** Raw claim record (for the chain view). */
  claimRecord: ClaimRecord | null;
  /** This browser also sent it (paying yourself, payroll sample, invoice paid from here). */
  sentRecord: SentRecord | null;
}

export type ScanState =
  | { status: 'idle' }
  | { status: 'scanning'; scanned: number; total: number | null }
  | { status: 'done'; scanned: number; finishedAtMs: number }
  | { status: 'error'; message: string };

export type ClaimEstimate =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ready';
      destinationExists: boolean;
      /** What the destination should receive. */
      receiveYocto: string;
      /** Gas the claim burns at most (deleteAccount) or reserves (transfer). */
      feeYocto: string;
      /** Transfer mode only: the reserve stays behind; the unburnt part comes back as dust. */
      leavesDust: boolean;
      /** Why this mode/destination can't work, if so. */
      blocker: string | null;
    }
  | { status: 'error'; message: string };

export interface InboxModel {
  hasIdentity: boolean;
  scan: ScanState;
  payments: FoundPayment[];
  unclaimedYocto: string;
  /** Suggested claim destinations (the demo wallet). */
  destinationSuggestions: string[];
  /** Announcements are read from here (cached cursor). */
  cursor: number;
  rescan(): void;
  rescanFromStart(): void;
  estimateClaim(paymentId: string, destination: string, mode: ClaimMode): Promise<ClaimEstimate>;
  claim(paymentId: string, destination: string, mode: ClaimMode): void;
}
