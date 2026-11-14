/** Pure helpers for payroll: batch planning and client-side receipt exports. */
import { chunk } from '../../lib/async';
import { formatYocto } from '../../lib/near-format';
import type { PayrollResult } from './types';

/** Split payable rows into transactions of at most `maxPerTx` sends (NEAR's 300 Tgas limit). */
export function planBatches<T>(rows: readonly T[], maxPerTx: number): T[][] {
  return rows.length === 0 ? [] : chunk(rows, maxPerTx);
}

function csvCell(v: string | number | null): string {
  const s = v === null ? '' : String(v);
  // Quote when needed; neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function receiptsCsv(results: readonly PayrollResult[]): string {
  const header = ['line', 'recipient', 'amount_near', 'memo', 'status', 'stealth_account', 'announcement_index', 'tx_hash', 'receipt'];
  const lines = results.map((r) =>
    [r.line, r.recipient, formatYocto(r.amountYocto, { maxFractionDigits: 24, group: false }), r.memo, r.status, r.stealthAccount, r.announcementIndex, r.txHash, r.receipt]
      .map(csvCell)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n') + '\n';
}

export function receiptsJson(results: readonly PayrollResult[], meta: { network: string; contractId: string; senderId: string; createdAt: string }): string {
  return (
    JSON.stringify(
      {
        ...meta,
        note: 'Perde payroll receipts. Each receipt proves one payment to one meta-address; keep them private.',
        payments: results.map((r) => ({ ...r, amountNear: formatYocto(r.amountYocto, { maxFractionDigits: 24, group: false }) })),
      },
      null,
      2,
    ) + '\n'
  );
}

/** Save text as a file in the browser (no server involved). */
export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
