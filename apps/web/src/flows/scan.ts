/**
 * Read-only discovery: page through the contract's announcements and test each
 * one with the view keys, check invoice accounts, read live balances. Used by
 * the Inbox (with the identity's keys), Audit (with a pasted viewing key) and
 * the guided demo runner.
 */
import { scanAnnouncement, type Announcement, type InvoicePayment, type ViewKeys } from '@perde/core';
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

/** Invoice accounts 0, 1, … that exist on-chain (stops after 20 empty indices in a row). */
export function scanInvoiceAccounts(viewKeys: ViewKeys): Promise<InvoicePayment[]> {
  return perde.scanInvoices(viewKeys, { gapLimit: 20 });
}
