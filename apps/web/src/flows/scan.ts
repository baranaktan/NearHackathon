/**
 * Read-only discovery: page through the contract's announcements and test each
 * one with the view keys, check invoice accounts, read live balances. Used by
 * the Inbox (with the identity's keys), Audit (with a pasted viewing key) and
 * the guided demo runner.
 */
import { deriveInvoice, invoiceMatch, scanAnnouncement, type Announcement, type InvoicePayment, type ViewKeys } from '@perde/core';
import { mapLimit } from '../lib/async';
import { perde, rpc } from '../lib/perde';

export interface ScanProgress {
  scanned: number;
  /** Announcements to read in this pass (null until the count is known). */
  total: number | null;
}

export interface AnnouncementScan {
  matches: Announcement[];
  nextIndex: number;
  scanned: number;
}

export async function scanAnnouncementsFrom(
  viewKeys: ViewKeys,
  fromIndex: number,
  onProgress?: (p: ScanProgress) => void,
  signal?: { cancelled: boolean },
): Promise<AnnouncementScan> {
  const count = await perde.announcementCount();
  const total = Math.max(0, count - fromIndex);
  onProgress?.({ scanned: 0, total });
  const matches: Announcement[] = [];
  let cursor = fromIndex;
  for (;;) {
    if (signal?.cancelled) break;
    const page = await perde.fetchAnnouncements({ fromIndex: cursor, limit: 200 });
    for (const a of page.announcements) {
      if (scanAnnouncement(viewKeys, a) !== null) matches.push(a);
    }
    cursor = page.nextIndex;
    onProgress?.({ scanned: cursor - fromIndex, total: Math.max(total, cursor - fromIndex) });
    if (!page.hasMore || page.announcements.length === 0) break;
  }
  return { matches, nextIndex: cursor, scanned: cursor - fromIndex };
}

export interface LiveAccount {
  exists: boolean;
  balanceYocto: bigint;
}

/** Live liquid balance of each account (missing accounts → exists: false). */
export async function fetchBalances(accountIds: readonly string[]): Promise<Map<string, LiveAccount>> {
  const unique = [...new Set(accountIds)];
  const views = await mapLimit(unique, 6, async (id) => [id, await rpc.viewAccountOrNull(id)] as const);
  return new Map(views.map(([id, v]) => [id, { exists: v !== null, balanceYocto: v?.amount ?? 0n }]));
}

/** Invoice accounts 0, 1, … that exist on-chain (discovery: stops after 20 empty indices in a row). */
export function scanInvoiceAccounts(viewKeys: ViewKeys): Promise<InvoicePayment[]> {
  return perde.scanInvoices(viewKeys, { gapLimit: 20 });
}

/**
 * Cheap invoice check for an identity whose invoices this browser already
 * knows: indices 0 … `nextIndex` (one past the last created, in case another
 * tab made one), skipping accounts known to be deleted. One view per index.
 */
export async function checkKnownInvoices(viewKeys: ViewKeys, nextIndex: number, skip: ReadonlySet<string>): Promise<InvoicePayment[]> {
  const candidates = Array.from({ length: nextIndex + 1 }, (_, i) => deriveInvoice(viewKeys, i)).filter((d) => !skip.has(d.stealthAccountId));
  const live = await fetchBalances(candidates.map((d) => d.stealthAccountId));
  return candidates
    .filter((d) => live.get(d.stealthAccountId)?.exists)
    .map((d) => ({
      index: d.index,
      stealthAccountId: d.stealthAccountId,
      ephemeralPk: d.ephemeralPk,
      viewTag: d.viewTag,
      balance: live.get(d.stealthAccountId)?.balanceYocto ?? 0n,
      tweak: invoiceMatch(viewKeys, d.index).tweak,
    }));
}
