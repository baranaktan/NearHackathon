import { createContext, useContext, type Dispatch } from 'react';
import type { SeedSigner } from '@perde/core';
import type { DerivedIdentity } from '../lib/perde';
import type { Action } from './reducer';
import type { PersistedState, WalletRecord } from './schema';

export type BalanceState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; totalYocto: string; spendableYocto: string; updatedAtMs: number }
  /** The account id does not exist on-chain (deleted, or a typo when importing). */
  | { status: 'missing' }
  | { status: 'error'; message: string };

export interface AppStateValue {
  state: PersistedState;
  dispatch: Dispatch<Action>;
  /** False when the browser refused to persist (private mode / quota). */
  persisted: boolean;
  identity: DerivedIdentity | null;
  /** Set when the stored phrase could not be turned into keys. */
  identityError: string | null;
  wallet: WalletRecord | null;
  signer: SeedSigner | null;
  balance: BalanceState;
  /** Re-read the wallet balance now (and once more shortly after, for gas refunds). */
  refreshBalance(): void;
}

export const AppStateContext = createContext<AppStateValue | null>(null);

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside <AppStateProvider>');
  return ctx;
}

/** Spendable balance in yocto, or null while unknown. */
export function spendableOf(b: BalanceState): bigint | null {
  return b.status === 'ready' ? BigInt(b.spendableYocto) : null;
}
