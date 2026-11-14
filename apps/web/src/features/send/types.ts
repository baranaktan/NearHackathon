/** View model for the Send page. Amounts are yoctoNEAR decimal strings. */

export type RecipientResolution =
  | { status: 'empty' }
  | { status: 'resolving' }
  /** `input` is what was typed; `metaAddress` is what the payment derives from. */
  | { status: 'resolved'; input: string; kind: 'meta' | 'name'; metaAddress: string; name: string | null }
  | { status: 'invalid'; message: string };

export interface SendQuote {
  recipientLabel: string;
  metaAddress: string;
  /** Fresh account derived for this payment (64 hex). */
  stealthAccount: string;
  /** R, hex. */
  ephemeralPk: string;
  amountYocto: string;
  announceFeeYocto: string;
  /** amount + fee: the deposit attached to `send`. */
  totalYocto: string;
}

export type SubmitStep = 'sign' | 'broadcast' | 'confirm';

export type SendPhase =
  | { phase: 'edit' }
  | { phase: 'review'; quote: SendQuote }
  | { phase: 'submitting'; quote: SendQuote; step: SubmitStep }
  | { phase: 'success'; quote: SendQuote; txHash: string; /** "perdereceipt:…" */ receipt: string }
  | { phase: 'error'; quote: SendQuote | null; message: string };

export interface SenderAccount {
  accountId: string;
  balanceYocto: string;
  source: 'demo' | 'wallet';
}

export interface SendModel {
  sender: SenderAccount | null;
  contractId: string | null;
  recipientInput: string;
  setRecipientInput(v: string): void;
  recipient: RecipientResolution;
  /** Human decimal string as typed. */
  amountInput: string;
  setAmountInput(v: string): void;
  amountError: string | null;
  /** Contract minimums, for hints. */
  limits: { minAmountYocto: string; announceFeeYocto: string } | null;
  phase: SendPhase;
  canReview: boolean;
  review(): void;
  confirm(): void;
  back(): void;
  reset(): void;
}
