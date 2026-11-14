import { describe, expect, it } from 'vitest';
import { planBatches, receiptsCsv, receiptsJson } from './batch';
import { parsePayrollCsv, PAYROLL_MAX_ROWS } from './csv';
import type { PayrollResult } from './types';

describe('planBatches', () => {
  it('fits up to 15 sends per transaction and chunks the rest in order', () => {
    const rows = Array.from({ length: 33 }, (_, i) => i);
    const b = planBatches(rows, 15);
    expect(b.map((x) => x.length)).toEqual([15, 15, 3]);
    expect(b.flat()).toEqual(rows);
    expect(planBatches([], 15)).toEqual([]);
    expect(planBatches([1, 2], 15)).toEqual([[1, 2]]);
  });

  it('rejects a non-positive size', () => {
    expect(() => planBatches([1], 0)).toThrow(RangeError);
  });

  it('the parser allows more rows than one transaction holds (they get chunked)', () => {
    const csv = Array.from({ length: 20 }, () => 'alice.testnet,1').join('\n');
    expect(parsePayrollCsv(csv).filter((r) => !r.error)).toHaveLength(20);
    expect(PAYROLL_MAX_ROWS).toBeGreaterThan(15);
  });
});

const result = (over: Partial<PayrollResult> = {}): PayrollResult => ({
  line: 2,
  recipient: 'alice.testnet',
  amountYocto: '20000000000000000000000',
  memo: 'Nov, "bonus"',
  status: 'sent',
  stealthAccount: 'a'.repeat(64),
  announcementIndex: 41,
  receipt: 'perdereceipt:abc',
  txHash: 'TxHash1',
  txNumber: 1,
  ...over,
});

describe('receipt exports', () => {
  it('writes an escaped CSV with NEAR amounts', () => {
    const csv = receiptsCsv([result(), result({ line: 3, memo: '=HYPERLINK("x")', status: 'not-sent', stealthAccount: null, announcementIndex: null, receipt: null, txHash: null })]);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('line,recipient,amount_near,memo,status,stealth_account,announcement_index,tx_hash,receipt');
    expect(lines[1]).toBe(`2,alice.testnet,0.02,"Nov, ""bonus""",sent,${'a'.repeat(64)},41,TxHash1,perdereceipt:abc`);
    expect(lines[2]).toContain(`"'=HYPERLINK(""x"")"`); // formula injection neutralised
  });

  it('writes JSON with metadata', () => {
    const j = JSON.parse(receiptsJson([result()], { network: 'testnet', contractId: 'perde-pay.testnet', senderId: 's.testnet', createdAt: '2026-11-14T00:00:00Z' }));
    expect(j.contractId).toBe('perde-pay.testnet');
    expect(j.payments[0].amountNear).toBe('0.02');
  });
});
