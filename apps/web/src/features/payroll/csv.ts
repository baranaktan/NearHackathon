import type { PayrollRow } from './types';
import { classifyRecipient, parseNearToYocto } from '../../lib/near-format';

export const PAYROLL_MAX_ROWS = 50;

/**
 * Parse "recipient,amount[,memo]" lines. A first line starting with
 * "recipient" is treated as a header. Pure; safe to keep after wiring.
 */
export function parsePayrollCsv(csv: string): PayrollRow[] {
  const lines = csv.split(/\r?\n/);
  const rows: PayrollRow[] = [];
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const [rawRecipient = '', rawAmount = '', ...memoParts] = line.split(',');
    const recipient = rawRecipient.trim();
    const amountInput = rawAmount.trim();
    if (i === 0 && /^recipient$/i.test(recipient)) return;
    const kind = classifyRecipient(recipient);
    const amount = parseNearToYocto(amountInput);
    let error: string | null = null;
    if (kind !== 'meta' && kind !== 'name') error = 'Not a perde: address or NEAR name';
    else if (!amount.ok) error = amountInput.startsWith('-') ? 'Amount must be positive' : amount.error;
    else if (amount.yocto === '0') error = 'Amount must be more than 0';
    rows.push({
      line: i + 1,
      recipient,
      amountInput,
      amountYocto: amount.ok ? amount.yocto : null,
      memo: memoParts.join(',').trim(),
      kind: kind === 'meta' || kind === 'name' ? kind : null,
      error,
    });
  });
  if (rows.filter((r) => !r.error).length > PAYROLL_MAX_ROWS) {
    rows.slice(PAYROLL_MAX_ROWS).forEach((r) => {
      if (!r.error) r.error = `Over the ${PAYROLL_MAX_ROWS}-row limit for one transaction`;
    });
  }
  return rows;
}
