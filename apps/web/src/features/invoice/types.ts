/** View model for the Invoice page: one-time addresses + "pay from any chain" quotes. */

export interface Invoice {
  /** Derivation index i (r_i = H(k_view ‖ i)). */
  index: number;
  stealthAccount: string;
  /** App link a payer can open, e.g. "https://…/#/pay?to=…&amount=…". */
  payLink: string;
  /** Requested amount in yocto; null = any amount. */
  amountYocto: string | null;
  memo: string;
  createdAtMs: number;
  status: 'open' | 'paid';
  receivedYocto: string;
}

export interface Asset {
  /** 1Click asset id, e.g. "nep141:eth-0x…omft.near". */
  id: string;
  symbol: string;
  chain: string;
  name: string;
}

export interface DryQuote {
  assetId: string;
  /** Human-formatted strings exactly as the 1Click API returns them. */
  amountInFormatted: string;
  amountOutFormatted: string;
  timeEstimateSec: number;
  /** ISO timestamp the quote was produced. */
  quotedAt: string;
}

export type QuoteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; quote: DryQuote }
  | { status: 'error'; message: string };

export interface InvoiceModel {
  hasIdentity: boolean;
  invoices: Invoice[];
  /** The invoice being shown (latest created / selected). */
  current: Invoice | null;
  creating: boolean;
  create(input: { amount: string; memo: string }): void;
  select(index: number): void;

  assets: Asset[];
  selectedAssetId: string | null;
  selectAsset(id: string): void;
  quote: QuoteState;
  requestQuote(): void;
}
