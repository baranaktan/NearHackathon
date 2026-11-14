/** View model for the Inbox page (scan + claim). Amounts are yoctoNEAR strings. */

export type ClaimState =
  | { status: 'unclaimed' }
  | { status: 'claiming'; destination: string }
  | { status: 'claimed'; destination: string; txHash: string; claimedYocto: string }
  | { status: 'error'; destination: string; message: string };

export interface FoundPayment {
  id: string;
  stealthAccount: string;
  /** Amount announced in the `send` call (or detected balance for invoices). */
  amountYocto: string;
  /** Current on-chain balance of the stealth account. */
  balanceYocto: string;
  timestampMs: number;
  /** Index in the announcement log; null for invoice payments (no announcement). */
  announcementIndex: number | null;
  source: 'announcement' | 'invoice';
  claim: ClaimState;
}

export type ScanState =
  | { status: 'idle' }
  | { status: 'scanning'; scanned: number; total: number | null }
  | { status: 'done'; scanned: number; finishedAtMs: number }
  | { status: 'error'; message: string };

export interface InboxModel {
  hasIdentity: boolean;
  scan: ScanState;
  payments: FoundPayment[];
  unclaimedYocto: string;
  /** Suggested claim destinations (e.g. demo recipient account). */
  destinationSuggestions: string[];
  /** Estimated gas the stealth account will pay for a claim. */
  claimFeeYocto: string | null;
  rescan(): void;
  claim(paymentId: string, destination: string): void;
}
