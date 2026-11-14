import { describe, expect, it } from 'vitest';
import deployments from '../../../../deployments/testnet.json';
import { APP_CONFIG } from '../config';
import { reducer } from './reducer';
import { initialState, migrate, STORAGE_KEY, type PersistedState, type SentRecord } from './schema';
import { clearState, loadState, saveState, type KeyValueStorage } from './storage';
import { mergeScan, scanStart } from './scan-cache';

const HEX = 'a'.repeat(64);
const HEX2 = 'b'.repeat(64);
const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const sent = (id: string, extra: Partial<SentRecord> = {}): SentRecord => ({
  id,
  kind: 'send',
  txHash: id,
  atMs: 1,
  senderId: 'a.testnet',
  recipientLabel: 'x',
  metaAddress: null,
  stealthAccount: HEX,
  amountYocto: '1',
  feeYocto: '0',
  receipt: null,
  announcementIndex: 3,
  memo: '',
  batch: null,
  ...extra,
});

describe('persistence', () => {
  it('round-trips through one versioned key', () => {
    const s = memoryStorage();
    const state: PersistedState = { ...initialState(), wallet: { accountId: 'demo.testnet', secretKey: 'ed25519:abc', source: 'import', addedAtMs: 5 } };
    expect(saveState(state, s)).toBe(true);
    expect([...s.data.keys()]).toEqual([STORAGE_KEY]);
    expect(loadState(s)).toEqual(state);
  });

  it('gives a fresh state for missing, corrupt or future-version data', () => {
    const s = memoryStorage();
    expect(loadState(s)).toEqual(initialState());
    s.setItem(STORAGE_KEY, '{not json');
    expect(loadState(s)).toEqual(initialState());
    s.setItem(STORAGE_KEY, JSON.stringify({ v: 99, wallet: { accountId: 'x.testnet', secretKey: 'ed25519:k' } }));
    expect(loadState(s)).toEqual(initialState());
  });

  it('drops malformed records instead of crashing (migration of partially bad data)', () => {
    const raw = {
      v: 1,
      wallet: { accountId: 'BAD ID', secretKey: 'ed25519:k' },
      identity: { mnemonic: MNEMONIC, confirmed: true, createdAtMs: 1 },
      invoices: [{ index: 4, amountYocto: '10', note: 'n', createdAtMs: 2 }, { index: -1 }, 'junk'],
      nextInvoiceIndex: 0,
      sent: [sent('t1'), { id: 'x' }],
      claims: { [HEX]: { stealthAccount: HEX, txHash: 'h', destination: 'me.testnet', amountYocto: '5', mode: 'deleteAccount', atMs: 3 }, junk: 1 },
      scan: { metaAddress: 'perde:x', nextIndex: 7, payments: [{ index: 1 }] },
      demo: { dismissed: true },
    };
    const m = migrate(raw);
    expect(m.wallet).toBeNull();
    expect(m.identity?.confirmed).toBe(true);
    expect(m.invoices.map((i) => i.index)).toEqual([4]);
    expect(m.nextInvoiceIndex).toBe(5); // never reuse an index that already exists
    expect(m.sent).toHaveLength(1);
    expect(Object.keys(m.claims)).toEqual([HEX]);
    expect(m.scan).toEqual({ metaAddress: 'perde:x', nextIndex: 7, payments: [], scannedAtMs: 0 });
    expect(m.demo).toEqual({ dismissed: true, chainViewSeen: false, quoteSeen: false, daoPaid: false });
  });

  it('clearState removes the key', () => {
    const s = memoryStorage();
    saveState(initialState(), s);
    clearState(s);
    expect(s.data.size).toBe(0);
  });
});

describe('reducer', () => {
  it('numbers invoices sequentially and keeps the newest first', () => {
    let s = reducer(initialState(), { type: 'invoice/add', invoice: { amountYocto: null, note: 'a', createdAtMs: 1 } });
    s = reducer(s, { type: 'invoice/add', invoice: { amountYocto: '5', note: 'b', createdAtMs: 2 } });
    expect(s.invoices.map((i) => [i.index, i.note])).toEqual([
      [1, 'b'],
      [0, 'a'],
    ]);
    expect(s.nextInvoiceIndex).toBe(2);
  });

  it('forgetting the identity also forgets what was derived from it, but not the wallet or sent history', () => {
    let s: PersistedState = {
      ...initialState(),
      wallet: { accountId: 'w.testnet', secretKey: 'ed25519:k', source: 'faucet', addedAtMs: 0 },
      identity: { mnemonic: MNEMONIC, confirmed: true, createdAtMs: 0 },
      sent: [sent('t1')],
    };
    s = reducer(s, { type: 'invoice/add', invoice: { amountYocto: null, note: '', createdAtMs: 0 } });
    s = reducer(s, { type: 'claim/add', claim: { stealthAccount: HEX, txHash: 'h', destination: 'w.testnet', amountYocto: '1', mode: 'transfer', atMs: 0 } });
    s = reducer(s, { type: 'identity/clear' });
    expect(s.identity).toBeNull();
    expect(s.invoices).toEqual([]);
    expect(s.claims).toEqual({});
    expect(s.wallet?.accountId).toBe('w.testnet');
    expect(s.sent).toHaveLength(1);
  });

  it('de-duplicates sent records by id and resets everything on reset', () => {
    let s = reducer(initialState(), { type: 'sent/add', records: [sent('t1')] });
    s = reducer(s, { type: 'sent/add', records: [sent('t1', { amountYocto: '2' }), sent('t2')] });
    expect(s.sent.map((r) => [r.id, r.amountYocto])).toEqual([
      ['t1', '2'],
      ['t2', '1'],
    ]);
    expect(reducer(s, { type: 'reset' })).toEqual(initialState());
  });
});

describe('scan cache', () => {
  const ann = (index: number, stealth = HEX) => ({ index, stealthAccountId: stealth, ephemeralPk: HEX2, viewTag: 1, amount: 10n, timestampMs: index });

  it('merges passes, newest first, and restarts for another identity', () => {
    const a = mergeScan(null, 'perde:me', [ann(2)], 5, 100);
    const b = mergeScan(a, 'perde:me', [ann(7, HEX2), ann(2)], 9, 200);
    expect(b.payments.map((p) => p.index)).toEqual([7, 2]);
    expect(scanStart(b, 'perde:me')).toBe(9);
    expect(scanStart(b, 'perde:other')).toBe(0);
    expect(mergeScan(b, 'perde:other', [], 3, 300).payments).toEqual([]);
  });
});

describe('config', () => {
  it('matches deployments/testnet.json', () => {
    expect(APP_CONFIG.contractId).toBe(deployments.contractId);
    expect(APP_CONFIG.daoId).toBe(deployments.dao.daoId);
  });
});
