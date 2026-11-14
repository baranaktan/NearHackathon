export type NetworkId = 'testnet' | 'mainnet';

export interface NetworkConfig {
  readonly networkId: NetworkId;
  readonly rpcUrls: readonly string[];
  readonly explorerUrl: string;
}

export const NETWORKS: Readonly<Record<NetworkId, NetworkConfig>> = {
  testnet: {
    networkId: 'testnet',
    rpcUrls: ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org'],
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
