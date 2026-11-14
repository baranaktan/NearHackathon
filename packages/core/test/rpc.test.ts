import { describe, expect, it } from 'vitest';
import {
  deriveStealth,
  encodeMetaAddress,
  generateMnemonic,
  hasReached,
  isPerdeError,
  keysFromMnemonic,
  NearRpc,
  PerdeClient,
  RpcError,
  SeedSigner,
  signTransaction,
  transfer,
} from '../src/index.js';
import { fakeChain } from './fakeChain.js';
import { jsonResponse, mockFetch } from './helpers.js';

const BLOCK_HASH = new Uint8Array(32).fill(7);
const okAccount = { amount: '5000', locked: '0', code_hash: '11111111111111111111111111111111', storage_usage: 182, block_height: 10, block_hash: 'h' };
const ok = (result: unknown) => jsonResponse({ jsonrpc: '2.0', id: 1, result });
const method = (body: unknown) => (body as { method: string }).method;

const outcome = (status: object, final = 'EXECUTED_OPTIMISTIC') => ({
  final_execution_status: final,
  status,
  transaction: { hash: 'TxHash', signer_id: 'alice.testnet', receiver_id: 'bob.testnet' },
  transaction_outcome: { id: 'TxHash', block_hash: 'b', outcome: { executor_id: 'alice.testnet', gas_burnt: 100, tokens_burnt: '1000', logs: [], receipt_ids: ['r'], status: { SuccessReceiptId: 'r' } } },
  receipts_outcome: [{ id: 'r', block_hash: 'b', outcome: { executor_id: 'bob.testnet', gas_burnt: 50, tokens_burnt: '500', logs: [], receipt_ids: [], status } }],
});

async function signed() {
  const s = SeedSigner.generate();
  return signTransaction({ signerId: 'alice.testnet', publicKey: s.publicKey, nonce: 1n, receiverId: 'bob.testnet', blockHash: BLOCK_HASH, actions: [transfer(1n)] }, s);
}

describe('NearRpc failover', () => {
  it('fails over on any non-JSON-RPC HTTP failure: 429, 422, a free-tier 408, garbage bodies', async () => {
    const { fetch, calls } = mockFetch((url) => {
      switch (url) {
        case 'https://a':
          return jsonResponse({ jsonrpc: '2.0', error: { code: -429, message: 'Rate limits exceeded' } }, 429);
        case 'https://b':
          return new Response('unprocessable', { status: 422 });
        case 'https://c':
          return jsonResponse({ id: 1, jsonrpc: '2.0', error: { message: 'Request timeout on the free plan', code: 30 } }, 408);
        case 'https://d':
          return new Response('<html>oops</html>', { status: 200 });
        default:
          return ok(okAccount);
      }
    });
    const rpc = new NearRpc({ urls: ['https://a', 'https://b', 'https://c', 'https://d', 'https://e'], fetch });
    expect((await rpc.viewAccount('alice.testnet')).amount).toBe(5000n);
    expect(calls.map((c) => c.url)).toEqual(['https://a', 'https://b', 'https://c', 'https://d', 'https://e']);
  });

  it('fails over when a gateway pinned a block its upstream does not have (422 UNKNOWN_BLOCK)', async () => {
    const { fetch, calls } = mockFetch((url) =>
      url === 'https://a'
        ? jsonResponse({ jsonrpc: '2.0', id: 1, error: { name: 'HANDLER_ERROR', cause: { name: 'UNKNOWN_BLOCK', info: {} }, data: 'DB Not Found Error: BLOCK HEIGHT: 1' } }, 422)
        : ok({ gas_price: '100000000' }),
    );
    expect(await new NearRpc({ urls: ['https://a', 'https://b'], fetch }).gasPrice()).toBe(100000000n);
    expect(calls.map((c) => c.url)).toEqual(['https://a', 'https://b']);
  });

  it('treats a node error on a non-2xx status as an answer (no failover)', async () => {
    const { fetch, calls } = mockFetch(() => jsonResponse({ jsonrpc: '2.0', id: 1, error: { name: 'REQUEST_VALIDATION_ERROR', cause: { name: 'PARSE_ERROR' }, code: -32700 } }, 400));
    const err: unknown = await new NearRpc({ urls: ['https://a', 'https://b'], fetch }).gasPrice().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RpcError);
    expect((err as RpcError).causeName).toBe('PARSE_ERROR');
    expect(calls).toHaveLength(1);
  });

  it('puts a failing endpoint at the back for the cooldown, then returns to the configured order', async () => {
    let aDown = true;
    const { fetch, calls } = mockFetch((url) => (url === 'https://a' && aDown ? new Response('busy', { status: 503 }) : ok({ gas_price: '1' })));
    const rpc = new NearRpc({ urls: ['https://a', 'https://b'], fetch, cooldownMs: 60_000 });
    await rpc.gasPrice();
    expect(calls.map((c) => c.url)).toEqual(['https://a', 'https://b']);
    expect(rpc.endpointOrder('gas_price')).toEqual(['https://b', 'https://a']);
    await rpc.gasPrice();
    expect(calls.map((c) => c.url)).toEqual(['https://a', 'https://b', 'https://b']); // sticks to the healthy endpoint

    const strict = new NearRpc({ urls: ['https://a', 'https://b'], fetch, cooldownMs: 0 });
    await strict.gasPrice();
    expect(strict.endpointOrder('gas_price')).toEqual(['https://a', 'https://b']);
    aDown = false;
    calls.length = 0;
    await strict.gasPrice();
    expect(calls.map((c) => c.url)).toEqual(['https://a']);
  });

  it('routes methods to their own endpoint order', async () => {
    const { fetch, calls } = mockFetch((_url, body) => (method(body) === 'send_tx' ? ok(outcome({ SuccessValue: '' })) : ok({ gas_price: '1' })));
    const rpc = new NearRpc({ urls: ['https://reads'], methodUrls: { send_tx: ['https://writes'] }, fetch });
    await rpc.gasPrice();
    await rpc.sendTransaction(await signed());
    expect(calls.map((c) => [c.url, method(c.body)])).toEqual([
      ['https://reads', 'gas_price'],
      ['https://writes', 'send_tx'],
    ]);
  });
});

describe('NearRpc cache', () => {
  it('shares identical concurrent reads, reuses fresh ones, and never caches access keys', async () => {
    const { fetch, calls } = mockFetch((_url, body) => {
      const params = (body as { params: { request_type?: string } }).params;
      if (params.request_type === 'view_access_key') return ok({ nonce: 1, permission: 'FullAccess', block_hash: 'h', block_height: 1 });
      return ok(okAccount);
    });
    const rpc = new NearRpc({ urls: ['https://a'], fetch, cache: true });
    await Promise.all([rpc.viewAccount('x.testnet'), rpc.viewAccount('x.testnet'), rpc.viewAccount('x.testnet')]);
    expect(calls).toHaveLength(1);
    await rpc.viewAccount('x.testnet');
    expect(calls).toHaveLength(1); // within the TTL
    await rpc.viewAccount('y.testnet');
    expect(calls).toHaveLength(2);
    await rpc.getAccessKey('x.testnet', 'ed25519:abc');
    await rpc.getAccessKey('x.testnet', 'ed25519:abc');
    expect(calls).toHaveLength(4);
    rpc.clearCache();
    await rpc.viewAccount('x.testnet');
    expect(calls).toHaveLength(5);
  });

  it('expires entries after the TTL and is off by default', async () => {
    const { fetch, calls } = mockFetch(() => ok({ gas_price: '7' }));
    const rpc = new NearRpc({ urls: ['https://a'], fetch, cache: { gasPriceTtlMs: 1 } });
    await rpc.gasPrice();
    await new Promise((r) => setTimeout(r, 5));
    await rpc.gasPrice();
    expect(calls).toHaveLength(2);
    const plain = new NearRpc({ urls: ['https://a'], fetch });
    await Promise.all([plain.gasPrice(), plain.gasPrice()]);
    expect(calls).toHaveLength(4);
  });

  it('sendTransaction clears cached reads so read-after-write goes to the network', async () => {
    let amount = '5000';
    const { fetch, calls } = mockFetch((_url, body) => (method(body) === 'send_tx' ? ok(outcome({ SuccessValue: '' })) : ok({ ...okAccount, amount })));
    const rpc = new NearRpc({ urls: ['https://a'], fetch, cache: true });
    expect((await rpc.viewAccount('x.testnet')).amount).toBe(5000n);
    amount = '9000';
    await rpc.sendTransaction(await signed());
    expect((await rpc.viewAccount('x.testnet')).amount).toBe(9000n);
    expect(calls.map((c) => method(c.body))).toEqual(['query', 'send_tx', 'query']);
  });
});

describe('transaction recovery by hash', () => {
  it('hasReached compares final_execution_status with the requested level', () => {
    expect(hasReached(outcome({ SuccessValue: '' }, 'EXECUTED_OPTIMISTIC'))).toBe(true);
    expect(hasReached(outcome({ SuccessValue: '' }, 'INCLUDED_FINAL'))).toBe(false);
    expect(hasReached(outcome({ SuccessValue: '' }, 'EXECUTED_OPTIMISTIC'), 'FINAL')).toBe(false);
    expect(hasReached({ final_execution_status: 'NONE' })).toBe(false);
  });

  it('looks the transaction up when every endpoint failed after the broadcast', async () => {
    const stx = await signed();
    let lookups = 0;
    const { fetch, calls } = mockFetch((_url, body) => {
      if (method(body) === 'send_tx') throw new TypeError('Failed to fetch');
      lookups++;
      if (lookups === 1) return jsonResponse({ jsonrpc: '2.0', id: 1, error: { name: 'HANDLER_ERROR', cause: { name: 'UNKNOWN_TRANSACTION' } } });
      if (lookups === 2) return ok({ final_execution_status: 'INCLUDED' });
      return ok(outcome({ SuccessValue: '' }));
    });
    const rpc = new NearRpc({ urls: ['https://a'], fetch, cooldownMs: 0, confirmIntervalMs: 1 });
    const res = await rpc.sendTransaction(stx);
    expect(res.success).toBe(true);
    const txCalls = calls.filter((c) => method(c.body) === 'tx');
    expect(txCalls).toHaveLength(3);
    expect(txCalls[0]?.body).toMatchObject({ params: { tx_hash: stx.hash, sender_account_id: 'alice.testnet', wait_until: 'NONE' } });
  });

  it('reports the hash when the outcome cannot be confirmed', async () => {
    const stx = await signed();
    const { fetch } = mockFetch(() => new Response('down', { status: 502 }));
    const rpc = new NearRpc({ urls: ['https://a'], fetch, confirmTimeoutMs: 20, confirmIntervalMs: 5 });
    const err: unknown = await rpc.sendTransaction(stx).catch((e: unknown) => e);
    expect(isPerdeError(err, 'RPC_UNAVAILABLE')).toBe(true);
    expect((err as { details: { hash: string } }).details.hash).toBe(stx.hash);
  });

  it('waitForTransaction returns failed outcomes instead of throwing', async () => {
    const { fetch } = mockFetch(() => ok(outcome({ Failure: { ActionError: { kind: 'LackBalanceForState' } } }, 'FINAL')));
    const o = await new NearRpc({ urls: ['https://a'], fetch }).waitForTransaction('TxHash', 'alice.testnet');
    expect(o.success).toBe(false);
    expect(o.failure).toMatchObject({ ActionError: { kind: 'LackBalanceForState' } });
  });
});

describe('PerdeClient: pre-derived stealth, tx hashes, claim recovery', () => {
  const NEAR = 10n ** 24n;
  function setup() {
    const chain = fakeChain('perde.testnet');
    const client = new PerdeClient({ network: 'testnet', contractId: 'perde.testnet', rpcUrls: ['https://rpc.fake'], fetch: chain.fetch });
    const sender = SeedSigner.generate();
    chain.addAccount('sender.testnet', sender.publicKeyString, 100n * NEAR);
    chain.addAccount('dest.testnet', SeedSigner.generate().publicKeyString, NEAR);
    return { chain, client, sender };
  }

  it('send pays exactly the stealth account shown before signing and reports the hash first', async () => {
    const { chain, client, sender } = setup();
    const meta = encodeMetaAddress(keysFromMnemonic(generateMnemonic()));
    const shown = deriveStealth(meta);
    const hashes: string[] = [];
    const sent = await client.send(sender, 'sender.testnet', meta, NEAR, { stealth: shown, onTxHash: (h) => hashes.push(h) });
    expect(sent.stealthAccountId).toBe(shown.stealthAccountId);
    expect(chain.submitted.at(-1)?.actions[0]).toMatchObject({ args: { stealth_account: shown.stealthAccountId, ephemeral_pk: shown.ephemeralPk, view_tag: shown.viewTag } });
    expect(hashes).toEqual([sent.txHash]);

    const other = deriveStealth(encodeMetaAddress(keysFromMnemonic(generateMnemonic())));
    await expect(client.send(sender, 'sender.testnet', meta, NEAR, { stealth: other })).rejects.toMatchObject({ code: 'KEY_MISMATCH' });
  });

  it('sendBatch accepts pre-derived stealth accounts per item and rejects duplicates', async () => {
    const { client, sender } = setup();
    const meta = encodeMetaAddress(keysFromMnemonic(generateMnemonic()));
    const a = deriveStealth(meta);
    const res = await client.sendBatch(sender, 'sender.testnet', [
      { to: meta, amountYocto: NEAR, stealth: a },
      { to: meta, amountYocto: NEAR },
    ]);
    expect(res.items[0]?.stealthAccountId).toBe(a.stealthAccountId);
    expect(res.items[1]?.stealthAccountId).not.toBe(a.stealthAccountId);
    await expect(
      client.sendBatch(sender, 'sender.testnet', [
        { to: meta, amountYocto: NEAR, stealth: a },
        { to: meta, amountYocto: NEAR, stealth: a },
      ]),
    ).rejects.toMatchObject({ code: 'INVALID_AMOUNT' });
  });

  it('a stealth account can pay onward with its own scalar signer, and claims report and recover their hash', async () => {
    const { chain, client, sender } = setup();
    const alice = keysFromMnemonic(generateMnemonic());
    const meta = encodeMetaAddress(alice);
    const first = await client.send(sender, 'sender.testnet', meta, NEAR);
    const { ScalarSigner, recoverSpendScalar } = await import('../src/index.js');
    const stealthSigner = new ScalarSigner(recoverSpendScalar(alice, first));
    const onward = await client.send(stealthSigner, first.stealthAccountId, meta, NEAR / 2n);
    expect(chain.submitted.at(-1)).toMatchObject({ signerId: first.stealthAccountId, signatureValid: true });
    expect((await client.scan(alice)).payments.map((p) => p.stealthAccountId)).toEqual([first.stealthAccountId, onward.stealthAccountId]);

    let hash = '';
    const claim = await client.claim(alice, onward, 'dest.testnet', { onTxHash: (h) => (hash = h) });
    expect(hash).toBe(claim.txHash);
    const status = await client.claimStatus(claim.txHash, onward.stealthAccountId);
    expect(status).toMatchObject({ txHash: claim.txHash, stealthAccountId: onward.stealthAccountId, success: true });
  });

  it('scanInvoices reads only the indices the gap limit still needs', async () => {
    const { chain, client } = setup();
    const alice = keysFromMnemonic(generateMnemonic());
    const { deriveInvoice } = await import('../src/index.js');
    chain.fund(deriveInvoice(alice, 0).stealthAccountId, NEAR);
    const before = chain.calls.length;
    expect((await client.scanInvoices(alice, { gapLimit: 5 })).map((i) => i.index)).toEqual([0]);
    expect(chain.calls.length - before).toBe(6); // indices 0..5, not two full windows of 5
  });
});
