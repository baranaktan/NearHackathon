export type NetworkId = 'testnet' | 'mainnet';

export interface NetworkConfig {
  readonly networkId: NetworkId;
  readonly rpcUrls: readonly string[];
  readonly explorerUrl: string;
}

/**
 * Default endpoints, tried in order with failover. Testnet (checked
 * 2026-11-14): FastNEAR answers fast and without a request-time cap, but
 * rate-limits after a burst of ~200 requests (its 429 carries no CORS header);
 * dRPC's public endpoint absorbed 400 requests at 10 concurrent without a 429
 * and sends CORS headers on every answer, but its free tier stops any request
 * that runs longer than ~2 s (HTTP 408), which can hit a waiting `send_tx`.
 * `rpc.testnet.near.org` is deprecated (throttled to ~3 s per answer).
 */
export const NETWORKS: Readonly<Record<NetworkId, NetworkConfig>> = {
  testnet: {
    networkId: 'testnet',
    rpcUrls: ['https://test.rpc.fastnear.com', 'https://near-testnet.drpc.org'],
    explorerUrl: 'https://testnet.nearblocks.io',
  },
  mainnet: {
    networkId: 'mainnet',
    rpcUrls: ['https://free.rpc.fastnear.com', 'https://rpc.mainnet.near.org'],
    explorerUrl: 'https://nearblocks.io',
  },
};

export function explorerTxUrl(network: NetworkId, txHash: string): string {
  return `${NETWORKS[network].explorerUrl}/txns/${encodeURIComponent(txHash)}`;
}

export function explorerAccountUrl(network: NetworkId, accountId: string): string {
  return `${NETWORKS[network].explorerUrl}/address/${encodeURIComponent(accountId)}`;
}
