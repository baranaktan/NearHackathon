/**
 * Static app configuration. No secrets live here — the app has no backend and
 * no API keys; everything is public RPC / explorer endpoints.
 */
export const APP_CONFIG = {
  networkId: 'testnet' as const,
  rpcUrl: 'https://rpc.testnet.near.org',
  explorerUrl: 'https://testnet.nearblocks.io',
  /** Set once the repository is public; the footer hides the link while empty. */
  githubUrl: '' as string,
  license: 'Apache-2.0',
};

export const explorerTxUrl = (hash: string): string => `${APP_CONFIG.explorerUrl}/txns/${hash}`;
export const explorerAccountUrl = (accountId: string): string => `${APP_CONFIG.explorerUrl}/address/${accountId}`;
