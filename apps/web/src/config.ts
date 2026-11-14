/**
 * Static app configuration. No secrets live here — the app has no backend and
 * no API keys; everything is public RPC / explorer / 1Click endpoints.
 */
import { NETWORKS } from '@perde/core';

export const APP_CONFIG = {
  networkId: 'testnet' as const,
  /** Perde announcement contract (source of truth: deployments/testnet.json; a unit test keeps them in sync). */
  contractId: 'perde-pay.testnet',
  /** Open demo SputnikDAO (deployments/testnet.json → dao.daoId). Anyone may propose and approve `call` proposals. */
  daoId: 'perde-demo.sputnikv2.testnet',
  /**
   * Tried in order; transport errors, 429 and 5xx fail over to the next one.
   * FastNEAR (core's default) first, dRPC's public testnet endpoint second (both
   * CORS-enabled). Core's other default, rpc.testnet.near.org, is left out: it is
   * deprecated and answers 429 to every request (checked 2026-11-14).
   */
  rpcUrls: [NETWORKS.testnet.rpcUrls[0] ?? 'https://test.rpc.fastnear.com', 'https://near-testnet.drpc.org'] as readonly string[],
  explorerUrl: NETWORKS.testnet.explorerUrl,
  githubUrl: 'https://github.com/baranaktan/NearHackathon' as string,
  license: 'Apache-2.0',
};

export const explorerTxUrl = (hash: string): string => `${APP_CONFIG.explorerUrl}/txns/${encodeURIComponent(hash)}`;
export const explorerAccountUrl = (accountId: string): string => `${APP_CONFIG.explorerUrl}/address/${encodeURIComponent(accountId)}`;
