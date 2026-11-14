/** View model for Settings & demo: the one demo wallet, network info, storage, reset. */

export interface NetworkInfo {
  networkId: 'testnet';
  /** Tried in order (failover). */
  rpcUrls: readonly string[];
  explorerUrl: string;
  contractId: string;
  /** From the contract's get_config (null while loading / on error). */
  contractVersion: string | null;
  announceFeeYocto: string | null;
  minAmountYocto: string | null;
  configError: string | null;
}

export interface SettingsModel {
  network: NetworkInfo;
  hasWallet: boolean;
  /** False when the browser refuses to persist (private mode / storage disabled). */
  persisted: boolean;
  demoDismissed: boolean;
  showDemo(): void;
  /** Forget identity, wallet and local history in this browser. */
  resetAll(): void;
}
