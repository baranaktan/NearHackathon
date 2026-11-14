import type { PayrollRow } from './types';
import { classifyRecipient, parseNearToYocto } from '../../lib/near-format';

export const PAYROLL_MAX_ROWS = 50;

/** Split one CSV line on `sep`, honouring double-quoted fields ("a, b" and "" escapes). */
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"' && cur.trim() === '') {
      quoted = true;
      cur = '';
    } else if (c === sep) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Parse "recipient,amount[,memo]" lines. A first line starting with
 * "recipient" is treated as a header. Spreadsheet exports work too: a UTF-8
 * BOM is ignored, double-quoted fields may contain the separator, and a file
 * whose first line is separated by ";" (European spreadsheets) is read with
 * ";" as the separator and "," as its decimal mark. Names are lowercased, as
 * NEAR account ids are (the Send form does the same). Pure.
 */
export function parsePayrollCsv(csv: string): PayrollRow[] {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/);
  const firstIndex = lines.findIndex((l) => l.trim() !== '');
  const first = lines[firstIndex] ?? '';
  const semi = first.indexOf(';');
  const comma = first.indexOf(',');
  const sep = semi !== -1 && (comma === -1 || semi < comma) ? ';' : ',';
  const rows: PayrollRow[] = [];
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const [field0 = '', field1 = '', ...memoParts] = splitCsvLine(line, sep);
    const rawRecipient = field0.trim();
    const rawAmount = field1.trim();
    const recipient = rawRecipient.startsWith('perde:') ? rawRecipient : rawRecipient.toLowerCase();
    const amountInput = sep === ';' && !rawAmount.includes('.') ? rawAmount.replace(',', '.') : rawAmount;
    if (i === firstIndex && /^recipient$/i.test(recipient)) return;
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
      memo: memoParts.join(sep).trim(),
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
