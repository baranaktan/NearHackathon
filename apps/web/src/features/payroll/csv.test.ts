import { describe, expect, it } from 'vitest';
import { parsePayrollCsv } from './csv';

describe('parsePayrollCsv', () => {
  it('skips the header and blank lines, keeps line numbers', () => {
    const rows = parsePayrollCsv('recipient,amount,memo\n\nalice.testnet,12.5,Nov, part 2\nbad one,3\nbob.testnet,-1');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ line: 3, recipient: 'alice.testnet', kind: 'name', memo: 'Nov, part 2', error: null });
    expect(rows[0]?.amountYocto).toBe('12500000000000000000000000');
    expect(rows[1]).toMatchObject({ line: 4, error: 'Not a perde: address or NEAR name' });
    expect(rows[2]).toMatchObject({ line: 5, error: 'Amount must be positive' });
  });
  it('rejects zero amounts', () => {
    expect(parsePayrollCsv('alice.testnet,0')[0]?.error).toBe('Amount must be more than 0');
  });
});
