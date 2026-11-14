/** View model for the Send page. Amounts are yoctoNEAR decimal strings. */
import type { SentRecord } from '../../state/schema';

export type RecipientResolution =
  | { status: 'empty' }
  | { status: 'resolving' }
  /** `input` is what was typed; `metaAddress` is what the payment derives from. */
  | { status: 'resolved'; input: string; kind: 'meta' | 'name'; metaAddress: string; name: string | null }
  | { status: 'invalid'; message: string };

export interface SendQuote {
  recipientLabel: string;
  metaAddress: string;
  /** Fresh account derived for this payment (64 hex). This exact account is paid on confirm. */
  stealthAccount: string;
  /** R, hex. */
  ephemeralPk: string;
  amountYocto: string;
  announceFeeYocto: string;
  /** amount + fee: the deposit attached to `send`. */
  totalYocto: string;
  /** Most the transaction can reserve for gas; the unused part is refunded. */
  gasReserveYocto: string;
}

export type SubmitStep = 'sign' | 'broadcast' | 'confirm';

export type SendPhase =
  | { phase: 'edit' }
  | { phase: 'review'; quote: SendQuote }
  | { phase: 'submitting'; quote: SendQuote; step: SubmitStep }
  | { phase: 'success'; quote: SendQuote; txHash: string; /** "perdereceipt:…" */ receipt: string; announcementIndex: number | null; record: SentRecord }
  | { phase: 'error'; quote: SendQuote | null; message: string; /** Set when the tx may have landed: check before retrying. */ txHash: string | null };

export interface SenderAccount {
  accountId: string;
  /** Spendable balance (liquid minus storage), or null while loading. */
  balanceYocto: string | null;
  source: 'demo';
}

export interface SendModel {
  sender: SenderAccount | null;
  contractId: string;
  recipientInput: string;
  setRecipientInput(v: string): void;
  recipient: RecipientResolution;
  /** This browser's own meta-address, for "pay yourself" (guided demo). */
  selfMetaAddress: string | null;
  /** Human decimal string as typed. */
  amountInput: string;
  setAmountInput(v: string): void;
  amountError: string | null;
  /** Contract minimums + gas headroom, for hints and the Max button. Null while loading. */
  limits: { minAmountYocto: string; announceFeeYocto: string; gasReserveYocto: string } | null;
  limitsError: string | null;
  phase: SendPhase;
  canReview: boolean;
  review(): void;
  confirm(): void;
  back(): void;
  reset(): void;
  /** Most recent payments sent from this browser. */
  history: SentRecord[];
}
