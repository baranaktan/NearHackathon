/** View model for the Invoice page: one-time accounts derived from the view key. */

export type InvoiceStatus = 'checking' | 'open' | 'partial' | 'paid' | 'claimed';

export interface Invoice {
  /** Derivation index i (r_i = H(k_view ‖ i)). */
  index: number;
  stealthAccount: string;
  /** App link a payer can open: "…/#/pay?to=<64hex>&amount=…&note=…". */
  payLink: string;
  /** Requested amount in yocto; null = any amount. */
  amountYocto: string | null;
  memo: string;
  createdAtMs: number;
  status: InvoiceStatus;
  /** Live balance of the invoice account (null while unknown). */
  receivedYocto: string | null;
  /** Claim transaction, once claimed from the Inbox. */
  claimTxHash: string | null;
}

export interface InvoiceModel {
  hasIdentity: boolean;
  invoices: Invoice[];
  /** The invoice being shown (latest created / selected). */
  current: Invoice | null;
  /** Returns an error message, or null when created. */
  create(input: { amount: string; memo: string }): string | null;
  select(index: number): void;
  /** Error from the last balance read, if any. */
  balanceError: string | null;
  refresh(): void;
}
