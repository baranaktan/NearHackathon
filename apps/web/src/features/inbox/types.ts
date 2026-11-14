/** View model for the Inbox page (scan + claim + pay onward). Amounts are yoctoNEAR strings. */
import type { Claimable } from '@perde/core';
import type { TxStep } from '../../flows/tx';
import type { ClaimRecord, SentRecord } from '../../state/schema';
import type { SpendState } from './onward';

export type ClaimMode = 'transfer' | 'deleteAccount';

export type ClaimState =
  | { status: 'unclaimed' }
  | { status: 'claiming'; destination: string; step: TxStep; startedAtMs: number }
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
  /** This browser also sent it (paying yourself, payroll sample, invoice paid from here, or paid onward from another stealth account). */
  sentRecord: SentRecord | null;
  /** Payments made FROM this stealth account ("pay onward"), newest first. */
  onward: SentRecord[];
  spend: SpendState;
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

/** Contract fee/minimum and one send's gas reserve (null until read from chain). */
export interface OnwardTerms {
  announceFeeYocto: bigint;
  minAmountYocto: bigint;
  gasReserveYocto: bigint;
}

export interface InboxModel {
  hasIdentity: boolean;
  scan: ScanState;
  payments: FoundPayment[];
  unclaimedYocto: string;
  /** Suggested claim destinations (the demo wallet). */
  destinationSuggestions: string[];
  /** Announcements are read from here (cached cursor). */
  cursor: number;
  /** Own meta-address (pay-onward shortcut). */
  selfMetaAddress: string | null;
  onwardTerms: OnwardTerms | null;
  rescan(): void;
  rescanFromStart(): void;
  estimateClaim(paymentId: string, destination: string, mode: ClaimMode): Promise<ClaimEstimate>;
  claim(paymentId: string, destination: string, mode: ClaimMode): void;
  /** What signs for this payment's stealth account (null if the scan cache lost it). */
  claimTarget(paymentId: string): Claimable | null;
  /** Re-read one stealth account's balance from chain (after paying onward from it). */
  refreshAccount(stealthAccount: string, balanceBefore?: bigint): Promise<bigint | null>;
}
