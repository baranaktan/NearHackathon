/** 1Click token list → options for the "pay from any chain" picker. */
import { NEAR_ASSET_ID, type OneClickToken } from '@perde/core';
import { oneClick } from '../../lib/perde';

export interface Asset {
  /** 1Click asset id, e.g. "nep141:eth-0x…omft.near". */
  id: string;
  symbol: string;
  chain: string;
  chainName: string;
  decimals: number;
  group: string;
}

const CHAIN_NAMES: Record<string, string> = {
  eth: 'Ethereum',
  arb: 'Arbitrum',
  base: 'Base',
  sol: 'Solana',
  btc: 'Bitcoin',
  near: 'NEAR',
  op: 'Optimism',
  pol: 'Polygon',
  bsc: 'BNB Chain',
  avax: 'Avalanche',
  gnosis: 'Gnosis',
  tron: 'Tron',
  ton: 'TON',
  sui: 'Sui',
  aptos: 'Aptos',
  doge: 'Dogecoin',
  xrp: 'XRP Ledger',
  zec: 'Zcash',
  ltc: 'Litecoin',
  bch: 'Bitcoin Cash',
  bera: 'Berachain',
  starknet: 'Starknet',
  stellar: 'Stellar',
  cardano: 'Cardano',
  monad: 'Monad',
  scroll: 'Scroll',
};

export const chainName = (c: string): string => CHAIN_NAMES[c] ?? c.charAt(0).toUpperCase() + c.slice(1);

/** Shown first: what most payers hold. Matched by symbol + chain, so ids come from the live list. */
const FEATURED: Array<[string, string]> = [
  ['USDC', 'eth'],
  ['USDC', 'arb'],
  ['USDC', 'base'],
  ['USDC', 'sol'],
  ['ETH', 'eth'],
  ['BTC', 'btc'],
  ['SOL', 'sol'],
  ['USDT', 'eth'],
];

export function toAssets(tokens: readonly OneClickToken[]): Asset[] {
  const usable = tokens.filter((t) => t.assetId !== NEAR_ASSET_ID && typeof t.symbol === 'string' && typeof t.blockchain === 'string');
  const featuredIds = new Set<string>();
  const featured: Asset[] = [];
  for (const [sym, chain] of FEATURED) {
    const t = usable.find((x) => x.symbol === sym && x.blockchain === chain);
    if (t && !featuredIds.has(t.assetId)) {
      featuredIds.add(t.assetId);
      featured.push({ id: t.assetId, symbol: t.symbol, chain: t.blockchain, chainName: chainName(t.blockchain), decimals: t.decimals, group: 'Popular' });
    }
  }
  const rest = usable
    .filter((t) => !featuredIds.has(t.assetId))
    .map((t) => ({ id: t.assetId, symbol: t.symbol, chain: t.blockchain, chainName: chainName(t.blockchain), decimals: t.decimals, group: chainName(t.blockchain) }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.symbol.localeCompare(b.symbol));
  const seen = new Set<string>();
  return [...featured, ...rest].filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
}

let cache: { at: number; promise: Promise<Asset[]> } | null = null;
const TTL_MS = 10 * 60_000;

/** Token list, cached in memory for 10 minutes. */
export function loadAssets(): Promise<Asset[]> {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const promise = oneClick.listTokens().then(toAssets);
    cache = { at: Date.now(), promise };
    promise.catch(() => {
      cache = null;
    });
  }
  return cache.promise;
}
