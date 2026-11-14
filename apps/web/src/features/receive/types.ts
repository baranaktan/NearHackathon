/** View model for the Receive page (identity + meta-address + name registration). */

export interface Identity {
  /** "perde:" + base58(K_spend ‖ K_view ‖ checksum) */
  metaAddress: string;
  /** "perdeview:" + base58(K_spend ‖ k_view ‖ checksum) — read-only key for auditors. */
  viewingKey: string;
  /** NEAR account the meta-address is registered under, if any. */
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
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'done'; accountId: string; txHash: string }
  | { status: 'error'; message: string };

export interface ReceiveModel {
  identity: IdentityState;
  /** The account that would sign `register` (demo recipient or connected wallet). Null = nothing to sign with. */
  signerAccountId: string | null;
  registration: RegistrationState;

  createIdentity(): void;
  /** Validates the BIP-39 phrase; resolves with an error message or null. */
  restoreIdentity(phrase: string): Promise<string | null>;
  /** Person confirmed they stored the phrase → status becomes "ready". */
  confirmSaved(): void;
  /** Returns the 12 words for a deliberate re-reveal. */
  revealPhrase(): Promise<string[]>;
  registerName(): void;
  forgetIdentity(): void;
}
