import type { Announcement } from '@perde/core';
import type { CachedPayment, ScanCache } from './schema';

export function toCached(a: Announcement): CachedPayment {
  return {
    index: a.index,
    stealthAccount: a.stealthAccountId,
    ephemeralPk: a.ephemeralPk,
    viewTag: a.viewTag,
    amountYocto: a.amount.toString(),
    timestampMs: a.timestampMs,
  };
}

/**
 * Fold a scan pass into the cache. A cache for another meta-address is
 * discarded; payments are de-duplicated by announcement index, newest first.
 */
export function mergeScan(cache: ScanCache | null, metaAddress: string, found: readonly Announcement[], nextIndex: number, nowMs: number): ScanCache {
  const base = cache && cache.metaAddress === metaAddress ? cache.payments : [];
  const byIndex = new Map<number, CachedPayment>(base.map((p) => [p.index, p]));
  for (const a of found) byIndex.set(a.index, toCached(a));
  return {
    metaAddress,
    nextIndex,
    payments: [...byIndex.values()].sort((a, b) => b.index - a.index),
    scannedAtMs: nowMs,
  };
}

/** Where an incremental scan should start for this identity. */
export function scanStart(cache: ScanCache | null, metaAddress: string): number {
  return cache && cache.metaAddress === metaAddress ? cache.nextIndex : 0;
}
