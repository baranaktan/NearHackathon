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
  it('reads spreadsheet exports: BOM, quoted fields, CRLF', () => {
    const rows = parsePayrollCsv('\uFEFFrecipient,amount,memo\r\n"alice.testnet","1.5","Rent, November"\r\n"bob.testnet",2,"He said ""hi"""');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ line: 2, recipient: 'alice.testnet', amountYocto: '1500000000000000000000000', memo: 'Rent, November', error: null });
    expect(rows[1]).toMatchObject({ recipient: 'bob.testnet', memo: 'He said "hi"', error: null });
  });
  it('reads semicolon-separated files with decimal commas', () => {
    const rows = parsePayrollCsv('recipient;amount;memo\nalice.testnet;1,25;Nov; part 2');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recipient: 'alice.testnet', amountYocto: '1250000000000000000000000', memo: 'Nov; part 2', error: null });
  });
  it('lowercases names like the Send form does, keeps meta-addresses as typed', () => {
    expect(parsePayrollCsv('Alice.Testnet,1')[0]).toMatchObject({ recipient: 'alice.testnet', kind: 'name', error: null });
    expect(parsePayrollCsv('perde:AbC,1')[0]?.recipient).toBe('perde:AbC');
  });
  it('rejects scientific notation and thousands separators instead of misreading them', () => {
    expect(parsePayrollCsv('alice.testnet,1e3')[0]?.error).toBeTruthy();
    expect(parsePayrollCsv('alice.testnet;1.000,5')[0]?.error).toBeTruthy();
  });
});
