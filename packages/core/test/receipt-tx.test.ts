/**
 * The receipt's `tx` field checked against the chain (offline).
 *
 *  - `matchReceiptTransaction` runs on RECORDED testnet answers
 *    (fixtures/testnet-tx-status.json: a direct Perde send, a DAO payout through
 *    perde.send, a plain transfer to an invoice account) and on SYNTHETIC edits
 *    of them (failed status, other hash), labelled as such.
 *  - `PerdeClient.verifyReceipt` runs against the in-memory fake chain, whose
 *    `EXPERIMENTAL_tx_status` answers have the same shape.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createReceipt,
  decodeReceipt,
  deriveStealth,
  encodeMetaAddress,
  generateMnemonic,
  isTxHash,
  keysFromMnemonic,
  matchReceiptTransaction,
  PerdeClient,
  RECEIPT_PREFIX,
  SeedSigner,
  transfer,
  sendActions,
  type FetchFn,
} from '../src/index.js';
import { fakeChain } from './fakeChain.js';
import { jsonResponse } from './helpers.js';

const NEAR = 10n ** 24n;
const CONTRACT = 'perde-pay.testnet';
const RECORDED = JSON.parse(readFileSync(new URL('./fixtures/testnet-tx-status.json', import.meta.url), 'utf8')) as {
  transactions: Record<'send' | 'daoPayout' | 'plainTransfer', Record<string, unknown> & { transaction: { hash: string; signer_id: string } }>;
};
const { send: SEND, daoPayout: DAO, plainTransfer: TRANSFER } = RECORDED.transactions;

/** What the recorded announce event of a transaction says (stealth, ephemeral_pk, view_tag, index). */
function announced(raw: Record<string, unknown>): { stealth_account: string; ephemeral_pk: string; view_tag: number; index: number } {
  for (const o of raw.receipts_outcome as Array<{ outcome: { logs: string[] } }>) {
    for (const l of o.outcome.logs) if (l.startsWith('EVENT_JSON:')) return (JSON.parse(l.slice(11)) as { data: [never] }).data[0];
  }
  throw new Error('no announce event in fixture');
}
const SEND_EV = announced(SEND);
const DAO_EV = announced(DAO);
const INVOICE_ACCOUNT = 'af38fa96f9dcebdb6abd020b4964aea0d6e27b32c4f9e120a49d74a2ed77d5f6';

const expectSend = { txHash: SEND.transaction.hash, stealthAccountId: SEND_EV.stealth_account, ephemeralPk: SEND_EV.ephemeral_pk, viewTag: SEND_EV.view_tag, contractId: CONTRACT };

describe('matchReceiptTransaction (RECORDED testnet answers)', () => {
  it('a Perde send matches its stealth account, ephemeral key and view tag', () => {
    expect(matchReceiptTransaction(SEND, { ...expectSend, signerId: SEND.transaction.signer_id })).toEqual({
      status: 'match',
      txHash: SEND.transaction.hash,
      signerId: 'perde-demo-3e72beda7e6e.testnet',
      via: 'perde',
      amountYocto: NEAR / 10n,
      announcementIndex: 14,
    });
  });

  it('a DAO payout (act_proposal → perde.send) matches through the contract', () => {
    const r = matchReceiptTransaction(DAO, { txHash: DAO.transaction.hash, stealthAccountId: DAO_EV.stealth_account, ephemeralPk: DAO_EV.ephemeral_pk, viewTag: DAO_EV.view_tag, contractId: CONTRACT });
    expect(r).toMatchObject({ status: 'match', via: 'perde', announcementIndex: 15, amountYocto: 2n * 10n ** 22n });
  });

  it('a plain transfer straight to the account matches', () => {
    const r = matchReceiptTransaction(TRANSFER, { txHash: TRANSFER.transaction.hash, stealthAccountId: INVOICE_ACCOUNT, ephemeralPk: 'x', viewTag: 0, contractId: CONTRACT });
    expect(r).toMatchObject({ status: 'match', via: 'transfer', amountYocto: 5n * 10n ** 22n });
  });

  it('the wrong transaction: a real Perde payment to a different stealth account', () => {
    const r = matchReceiptTransaction(DAO, { ...expectSend, txHash: DAO.transaction.hash });
    expect(r.status).toBe('mismatch');
    if (r.status === 'mismatch') expect(r.reason).toMatch(/paid nothing into 9d8d574b/);
  });

  it('a transaction to another account (plain transfer elsewhere) does not match', () => {
    const r = matchReceiptTransaction(TRANSFER, { ...expectSend, txHash: TRANSFER.transaction.hash });
    expect(r.status).toBe('mismatch');
  });

  it('SYNTHETIC: the same send marked failed does not match', () => {
    const failed = { ...SEND, status: { Failure: { ActionError: { index: 0, kind: { FunctionCallError: { ExecutionError: 'Smart contract panicked' } } } } } };
    const r = matchReceiptTransaction(failed, expectSend);
    expect(r.status).toBe('mismatch');
    if (r.status === 'mismatch') expect(r.reason).toMatch(/failed/);
  });

  it('a different ephemeral key / view tag than the receipt’s r gives does not match', () => {
    expect(matchReceiptTransaction(SEND, { ...expectSend, viewTag: (SEND_EV.view_tag + 1) % 256 }).status).toBe('mismatch');
    expect(matchReceiptTransaction(SEND, { ...expectSend, ephemeralPk: DAO_EV.ephemeral_pk }).status).toBe('mismatch');
  });

  it('a signer other than the receipt’s `from` does not match', () => {
    const r = matchReceiptTransaction(SEND, { ...expectSend, signerId: 'someone-else.testnet' });
    expect(r).toMatchObject({ status: 'mismatch', reason: expect.stringMatching(/signed by perde-demo-3e72beda7e6e\.testnet/) as unknown });
  });

  it('SYNTHETIC: an answer for another hash, or without execution results, is never a match', () => {
    expect(matchReceiptTransaction(SEND, { ...expectSend, txHash: DAO.transaction.hash }).status).toBe('mismatch');
    const pending = { transaction: SEND.transaction, final_execution_status: 'INCLUDED' };
    expect(matchReceiptTransaction(pending, expectSend).status).toBe('unchecked');
    expect(matchReceiptTransaction(null, expectSend).status).toBe('unchecked');
    expect(matchReceiptTransaction({ ...SEND, receipts: undefined }, expectSend).status).toBe('unchecked');
  });

  it('gas refunds (from `system`) never count as funding', () => {
    // The send's signer received two refunds in this transaction; it was not "paid" by it.
    const r = matchReceiptTransaction(SEND, { ...expectSend, stealthAccountId: SEND.transaction.signer_id });
    expect(r.status).toBe('mismatch');
  });

  it('isTxHash accepts base58 of 32 bytes only', () => {
    expect(isTxHash(SEND.transaction.hash)).toBe(true);
    expect(isTxHash('TxHash')).toBe(false);
    expect(isTxHash('0OIl' + SEND.transaction.hash.slice(4))).toBe(false);
    expect(isTxHash('1111111111111111111111111111111111111111111111')).toBe(false);
  });
});

function setup(wrap?: (inner: FetchFn) => FetchFn) {
  const chain = fakeChain(CONTRACT);
  const fetch = wrap ? wrap(chain.fetch) : chain.fetch;
  const client = new PerdeClient({ network: 'testnet', contractId: CONTRACT, rpcUrls: ['https://rpc.fake'], fetch });
  const sender = SeedSigner.generate();
  chain.addAccount('sender.testnet', sender.publicKeyString, 100n * NEAR);
  return { chain, client, sender };
}

const meta = () => encodeMetaAddress(keysFromMnemonic(generateMnemonic()));
/** Re-encode a receipt with some fields replaced (undefined = removed: JSON.stringify drops it). */
const withField = (receipt: string, patch: Record<string, unknown>) => RECEIPT_PREFIX + Buffer.from(JSON.stringify({ ...decodeReceipt(receipt), ...patch })).toString('base64url');

describe('PerdeClient.verifyReceipt checks the receipt’s transaction', () => {
  it('matching tx: new receipts carry the signer and verify', async () => {
    const { client, sender } = setup();
    const sent = await client.send(sender, 'sender.testnet', meta(), NEAR);
    expect(decodeReceipt(sent.receipt)).toMatchObject({ tx: sent.txHash, from: 'sender.testnet' });
    const v = await client.verifyReceipt(sent.receipt);
    expect(v.valid).toBe(true);
    expect(v.transaction).toMatchObject({ status: 'match', via: 'perde', signerId: 'sender.testnet', amountYocto: NEAR, announcementIndex: 0 });
  });

  it('old receipts without `from` still verify (backward compatible)', async () => {
    const { client, sender } = setup();
    const sent = await client.send(sender, 'sender.testnet', meta(), NEAR);
    const v = await client.verifyReceipt(withField(sent.receipt, { from: undefined }));
    expect(v.valid).toBe(true);
    expect(v.transaction.status).toBe('match');
  });

  it('wrong tx: the hash of another real payment fails the receipt', async () => {
    const { client, sender } = setup();
    const a = await client.send(sender, 'sender.testnet', meta(), NEAR);
    const b = await client.send(sender, 'sender.testnet', meta(), 2n * NEAR);
    const v = await client.verifyReceipt(withField(a.receipt, { tx: b.txHash }));
    expect(v.announced).toBe(true);
    expect(v.valid).toBe(false);
    expect(v.transaction.status).toBe('mismatch');
    expect(v.reason).toMatch(/does not match this payment/);
  });

  it('tx to another account: a plain transfer elsewhere fails the receipt', async () => {
    const { chain, client, sender } = setup();
    const sent = await client.send(sender, 'sender.testnet', meta(), NEAR);
    chain.addAccount('bob.testnet', SeedSigner.generate().publicKeyString, NEAR);
    const other = await sendActions({ rpc: client.rpc, signer: sender, signerId: 'sender.testnet', receiverId: 'bob.testnet', actions: [transfer(NEAR)] });
    const v = await client.verifyReceipt(withField(sent.receipt, { tx: other.hash }));
    expect(v.valid).toBe(false);
    expect(v.transaction).toMatchObject({ status: 'mismatch', reason: expect.stringMatching(/paid nothing into/) as unknown });
  });

  it('failed tx: a transaction whose execution failed does not count', async () => {
    const markFailed: (f: FetchFn) => FetchFn = (inner) => async (url, init) => {
      const res = await inner(url, init);
      const body = JSON.parse(init.body as string) as { method: string };
      if (body.method !== 'EXPERIMENTAL_tx_status') return res;
      const j = (await res.json()) as { result: Record<string, unknown> };
      return jsonResponse({ ...j, result: { ...j.result, status: { Failure: { ActionError: { kind: 'SYNTHETIC' } } } } });
    };
    const { client, sender } = setup(markFailed);
    const sent = await client.send(sender, 'sender.testnet', meta(), NEAR);
    const v = await client.verifyReceipt(sent.receipt);
    expect(v.valid).toBe(false);
    expect(v.transaction).toMatchObject({ status: 'mismatch', reason: expect.stringMatching(/failed/) as unknown });
  });

  it('missing tx: a receipt without `tx` is valid, the transaction "not checked"', async () => {
    const { client, sender } = setup();
    const m = meta();
    const sent = await client.send(sender, 'sender.testnet', m, NEAR);
    const v = await client.verifyReceipt(withField(sent.receipt, { tx: undefined, from: undefined }));
    expect(v.valid).toBe(true);
    expect(v.transaction).toEqual({ status: 'unchecked', reason: 'the receipt names no transaction' });
    // createReceipt drops `from` without `tx`.
    const d = deriveStealth(m);
    expect(decodeReceipt(createReceipt({ meta: m, r: d.r, stealthAccountId: d.stealthAccountId, from: 'x.testnet' }))).not.toHaveProperty('from');
  });

  it('RPC unavailable: the transaction is "not checked", never a match', async () => {
    const txDown: (f: FetchFn) => FetchFn = (inner) => async (url, init) => {
      const body = JSON.parse(init.body as string) as { method: string };
      return body.method === 'EXPERIMENTAL_tx_status' ? new Response('Service Unavailable', { status: 503 }) : inner(url, init);
    };
    const { client, sender } = setup(txDown);
    const sent = await client.send(sender, 'sender.testnet', meta(), NEAR);
    const v = await client.verifyReceipt(sent.receipt);
    expect(v.valid).toBe(true);
    expect(v.transaction.status).toBe('unchecked');
  });

  it('unknown tx hash: a mismatch while the node must still have it, "not checked" when too fresh or too old', async () => {
    const { chain, client, sender } = setup();
    const sent = await client.send(sender, 'sender.testnet', meta(), NEAR);
    const ts = chain.announcements[0]?.timestamp_ms ?? 0;
    const forged = withField(sent.receipt, { tx: '9Qg1J7dGLUUxN4uAsSsLtczSWUM1zW2DAoqPLQ29VZ2p' });
    const hourOld = await client.verifyReceipt(forged, { now: ts + 3_600_000 });
    expect(hourOld.valid).toBe(false);
    expect(hourOld.transaction.status).toBe('mismatch');
    expect((await client.verifyReceipt(forged, { now: ts + 30_000 })).transaction.status).toBe('unchecked');
    const old = await client.verifyReceipt(forged, { now: ts + 3 * 86_400_000 });
    expect(old.valid).toBe(true);
    expect(old.transaction).toMatchObject({ status: 'unchecked', reason: expect.stringMatching(/does not have this transaction/) as unknown });
  });

  it('a `tx` that is not a transaction hash fails without a lookup', async () => {
    const { chain, client, sender } = setup();
    const sent = await client.send(sender, 'sender.testnet', meta(), NEAR);
    const before = chain.calls.length;
    const v = await client.verifyReceipt(withField(sent.receipt, { tx: 'not-a-hash' }));
    expect(v.valid).toBe(false);
    expect(v.transaction.status).toBe('mismatch');
    expect(chain.calls.slice(before).some((c) => (c.body as { method?: string }).method === 'EXPERIMENTAL_tx_status')).toBe(false);
  });
});
