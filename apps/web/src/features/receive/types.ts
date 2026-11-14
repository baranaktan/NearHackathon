/** View model for the Receive page (identity + meta-address + name registration). */

export interface Identity {
  /** "perde:" + base58(K_spend ‖ K_view ‖ checksum) */
  metaAddress: string;
  /** "perdeview:" + base58(K_spend ‖ k_view ‖ checksum) — read-only key for auditors. */
  viewingKey: string;
  /** NEAR account the meta-address is registered under (read from the contract), if any. */
  registeredName: string | null;
}

export type IdentityState =
  | { status: 'loading' }
  /** No identity in this browser yet. */
  | { status: 'none' }
  /** Just created: the phrase must be shown once and confirmed as saved. */
  | { status: 'created'; identity: Identity; words: string[] }
  | { status: 'ready'; identity: Identity }
  | { status: 'error'; message: string };

export type RegistrationState =
  /** No demo wallet: nothing can sign `register`. */
  | { status: 'no-wallet' }
  | { status: 'checking' }
  | { status: 'unregistered' }
  /** The wallet's name points at this identity's meta-address. */
  | { status: 'registered'; accountId: string; txHash: string | null }
  /** The wallet's name points at a different meta-address (e.g. an older identity). */
  | { status: 'other'; accountId: string; metaAddress: string }
  | { status: 'pending'; action: 'register' | 'unregister' }
  | { status: 'error'; message: string; retry: 'check' | 'register' | 'unregister' };

export interface ReceiveModel {
  identity: IdentityState;
  /** The account that signs `register` (the demo wallet). Null = nothing to sign with. */
  signerAccountId: string | null;
  registration: RegistrationState;
  /** Deposit attached to `register` (yocto); the contract refunds what storage doesn't use. */
  registerDepositYocto: string;
  /** `#/pay?to=<meta-address>` on this deployment. */
  payLink: string | null;

  createIdentity(): void;
  /** Validates the BIP-39 phrase; resolves with an error message or null. */
  restoreIdentity(phrase: string): Promise<string | null>;
  /** Person confirmed they stored the phrase → status becomes "ready". */
  confirmSaved(): void;
  /** Returns the 12 words for a deliberate re-reveal. */
  revealPhrase(): Promise<string[]>;
  registerName(): void;
  unregisterName(): void;
  retryRegistration(): void;
  forgetIdentity(): void;
}
