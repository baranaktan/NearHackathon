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
   * Endpoints for reads, in failover order (an endpoint that fails rests for
   * 30 s; see `lib/perde.ts`). Measured 2026-11-14 from a browser origin:
   * dRPC's public endpoint took 400 requests at 10 concurrent without a 429
   * and sends CORS headers on every answer, errors included; FastNEAR is as
   * fast but answers 429 after a burst of ~200 requests, without CORS headers,
   * which the browser reports as a console error it cannot suppress.
   */
  rpcUrls: ['https://near-testnet.drpc.org', 'https://test.rpc.fastnear.com'] as readonly string[],
  /**
   * Endpoints for `send_tx`, which waits for execution server-side: dRPC's
   * free tier ends any request after ~2 s with HTTP 408, so FastNEAR (no such
   * cap, ~1 s for a payment) broadcasts first.
   */
  broadcastUrls: ['https://test.rpc.fastnear.com', 'https://near-testnet.drpc.org'] as readonly string[],
  explorerUrl: NETWORKS.testnet.explorerUrl,
  githubUrl: 'https://github.com/baranaktan/NearHackathon' as string,
  license: 'Apache-2.0',
};

export const explorerTxUrl = (hash: string): string => `${APP_CONFIG.explorerUrl}/txns/${encodeURIComponent(hash)}`;
export const explorerAccountUrl = (accountId: string): string => `${APP_CONFIG.explorerUrl}/address/${encodeURIComponent(accountId)}`;
