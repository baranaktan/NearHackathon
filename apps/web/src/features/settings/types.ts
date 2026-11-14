/** View model for Settings & demo: network info + throwaway testnet accounts. */

export type DemoRole = 'sender' | 'recipient';

export interface DemoAccount {
  role: DemoRole;
  /** Null until created. */
  accountId: string | null;
  balanceYocto: string | null;
  status: 'missing' | 'funding' | 'ready' | 'error';
  error?: string;
}

export interface NetworkInfo {
  networkId: 'testnet';
  rpcUrl: string;
  explorerUrl: string;
  contractId: string | null;
  contractVersion: string | null;
}

export interface SettingsModel {
  network: NetworkInfo;
  demoAccounts: DemoAccount[];
  /** Create (if missing) and top up from the testnet faucet. */
  fund(role: DemoRole): void;
  /** Forget identity, demo accounts and local state in this browser. */
  resetAll(): void;
}
