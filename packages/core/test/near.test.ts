import { ed25519 } from '@noble/curves/ed25519.js';
import { base58, base64 } from '@scure/base';
import {
  actions as napiActions,
  createTransaction,
  decodeSignedTransaction,
  encodeTransaction,
  KeyPairSigner,
  PublicKey,
} from 'near-api-js';
import { describe, expect, it } from 'vitest';
import {
  deleteAccount,
  deriveStealth,
  explorerAccountUrl,
  explorerTxUrl,
  formatNear,
  functionCall,
  generateMnemonic,
  isImplicitAccountId,
  isPerdeError,
  isValidAccountId,
  keysFromMnemonic,
  NearRpc,
  parseNear,
  recoverSpendScalar,
  RpcError,
  ScalarSigner,
  SeedSigner,
  serializeTransaction,
  signTransaction,
  tgas,
  transactionHash,
  transfer,
  type Transaction,
} from '../src/index.js';
import { jsonResponse, mockFetch } from './helpers.js';

const BLOCK_HASH = base58.decode('5UjcpD56pkiYoChcw2WcFvsy1mj5LFnkYnTLbnzPfWdD');

describe('transaction serialization matches near-api-js', () => {
  const seedSigner = SeedSigner.fromSeed(new Uint8Array(32).fill(7));

  const ourTx = (pub: Uint8Array): Transaction => ({
    signerId: 'alice.testnet',
    publicKey: pub,
    nonce: 51918910664709n,
    receiverId: 'perde.testnet',
    blockHash: BLOCK_HASH,
    actions: [
      transfer(1_500_000_000_000_000_000_000_000n),
      functionCall('send', { stealth_account: 'ab'.repeat(32), ephemeral_pk: 'cd'.repeat(32), view_tag: 7 }, tgas(15), 12_000_000_000_000_000_000_000n),
      functionCall('send', { stealth_account: 'ef'.repeat(32), ephemeral_pk: '01'.repeat(32), view_tag: 255 }, tgas(15), 1n),
      deleteAccount('bob.testnet'),
    ],
  });

  const theirTx = (pub: Uint8Array) =>
    createTransaction(
      'alice.testnet',
      PublicKey.fromString(`ed25519:${base58.encode(pub)}`),
      'perde.testnet',
      51918910664709n,
      [
        napiActions.transfer(1_500_000_000_000_000_000_000_000n),
        napiActions.functionCall('send', { stealth_account: 'ab'.repeat(32), ephemeral_pk: 'cd'.repeat(32), view_tag: 7 }, 15_000_000_000_000n, 12_000_000_000_000_000_000_000n),
        napiActions.functionCall('send', { stealth_account: 'ef'.repeat(32), ephemeral_pk: '01'.repeat(32), view_tag: 255 }, 15_000_000_000_000n, 1n),
        napiActions.deleteAccount('bob.testnet'),
      ],
      BLOCK_HASH,
    );

  it('borsh bytes and hash are identical', () => {
    const ours = serializeTransaction(ourTx(seedSigner.publicKey));
    const theirs = encodeTransaction(theirTx(seedSigner.publicKey));
    expect(Buffer.from(ours).toString('hex')).toBe(Buffer.from(theirs).toString('hex'));
  });

  it('signed transaction (seed key) is byte-identical to near-api-js KeyPairSigner output', async () => {
    const ours = await signTransaction(ourTx(seedSigner.publicKey), seedSigner);
    const napiSigner = KeyPairSigner.fromSecretKey(seedSigner.secretKey as `ed25519:${string}`);
    const { signedTransaction, txHash } = await napiSigner.signTransaction(theirTx(seedSigner.publicKey));
    expect(Buffer.from(ours.bytes).toString('hex')).toBe(Buffer.from(encodeTransaction(signedTransaction)).toString('hex'));
    expect(ours.hash).toBe(base58.encode(txHash));
  });

  it('a scalar-signed transaction verifies under the stealth public key and decodes with near-api-js', async () => {
    const keys = keysFromMnemonic(generateMnemonic());
    const d = deriveStealth(keys);
    const signer = new ScalarSigner(recoverSpendScalar(keys, d));
    expect(signer.accountId).toBe(d.stealthAccountId);
    const tx: Transaction = { ...ourTx(signer.publicKey), signerId: d.stealthAccountId, actions: [transfer(10n)] };
    const stx = await signTransaction(tx, signer);
    expect(ed25519.verify(stx.signature, transactionHash(tx), signer.publicKey)).toBe(true);
    const decoded = decodeSignedTransaction(stx.bytes);
    expect(decoded.transaction.signerId).toBe(d.stealthAccountId);
    expect(decoded.transaction.publicKey.toString()).toBe(`ed25519:${base58.encode(signer.publicKey)}`);
    expect(decoded.signature.ed25519Signature?.data).toEqual(stx.signature);
  });

  it('refuses to sign with a key that is not the transaction key', async () => {
    const other = SeedSigner.generate();
    await expect(signTransaction(ourTx(seedSigner.publicKey), other)).rejects.toMatchObject({ code: 'KEY_MISMATCH' });
  });

  it('SeedSigner round-trips NEAR secret keys', () => {
    const s = SeedSigner.generate();
    const back = SeedSigner.fromSecretKey(s.secretKey);
    expect(back.publicKeyString).toBe(s.publicKeyString);
    const raw = base58.decode(s.secretKey.slice(8));
    raw[40] = (raw[40] as number) ^ 1;
    expect(() => SeedSigner.fromSecretKey(`ed25519:${base58.encode(raw)}`)).toThrow(/does not match/);
  });
});

describe('units & ids', () => {
  it('parses and formats NEAR with bigint precision', () => {
    expect(parseNear('1')).toBe(10n ** 24n);
    expect(parseNear('1.5')).toBe(15n * 10n ** 23n);
    expect(parseNear('.000000000000000000000001')).toBe(1n);
    expect(parseNear('0.01')).toBe(10n ** 22n);
    expect(parseNear('123456789.123456789123456789123456')).toBe(123456789123456789123456789123456n);
    expect(() => parseNear('1.0000000000000000000000001')).toThrow();
    expect(() => parseNear('-1')).toThrow();
    expect(() => parseNear('1e3')).toThrow();
    expect(() => parseNear('')).toThrow();
    expect(formatNear(10n ** 24n)).toBe('1');
    expect(formatNear(15n * 10n ** 23n)).toBe('1.5');
    expect(formatNear(1n)).toBe('0.000000000000000000000001');
    expect(formatNear(1n, { maxDecimals: 5 })).toBe('0');
    expect(formatNear(123456789123456789123456789123456n, { maxDecimals: 4 })).toBe('123456789.1234');
    expect(formatNear(-15n * 10n ** 23n)).toBe('-1.5');
    expect(formatNear(0n)).toBe('0');
    for (const s of ['0', '1', '0.1', '9999.000000000000000000000001', '42.42']) expect(formatNear(parseNear(s))).toBe(s);
  });

  it('validates account ids', () => {
    expect(isValidAccountId('alice.testnet')).toBe(true);
    expect(isValidAccountId('a-b_c.d')).toBe(true);
    expect(isValidAccountId('ab'.repeat(32))).toBe(true);
    expect(isImplicitAccountId('ab'.repeat(32))).toBe(true);
    expect(isImplicitAccountId('AB'.repeat(32))).toBe(false);
    expect(isValidAccountId('Alice.testnet')).toBe(false);
    expect(isValidAccountId('a')).toBe(false);
    expect(isValidAccountId('a..b')).toBe(false);
    expect(isValidAccountId('-a.testnet')).toBe(false);
    expect(isValidAccountId('a'.repeat(65))).toBe(false);
  });

  it('builds explorer links', () => {
    expect(explorerTxUrl('testnet', 'Abc')).toBe('https://testnet.nearblocks.io/txns/Abc');
    expect(explorerAccountUrl('testnet', 'alice.testnet')).toBe('https://testnet.nearblocks.io/address/alice.testnet');
    expect(explorerTxUrl('mainnet', 'X')).toBe('https://nearblocks.io/txns/X');
  });
});

describe('NearRpc (mocked fetch)', () => {
  const okAccount = { amount: '5000', locked: '0', code_hash: '11111111111111111111111111111111', storage_usage: 182, block_height: 10, block_hash: 'h' };

  it('fails over on HTTP 5xx / network errors and reports all failures', async () => {
    const { fetch, calls } = mockFetch((url) => {
      if (url === 'https://a') return new Response('bad gateway', { status: 502 });
      if (url === 'https://b') throw new TypeError('network down');
      return jsonResponse({ jsonrpc: '2.0', id: 1, result: okAccount });
    });
    const rpc = new NearRpc({ urls: ['https://a', 'https://b', 'https://c'], fetch });
    const v = await rpc.viewAccount('alice.testnet');
    expect(v.amount).toBe(5000n);
    expect(calls.map((c) => c.url)).toEqual(['https://a', 'https://b', 'https://c']);
    expect(calls[2]?.body).toMatchObject({ method: 'query', params: { request_type: 'view_account', account_id: 'alice.testnet', finality: 'optimistic' } });

    const dead = new NearRpc({ urls: ['https://a'], fetch });
    await expect(dead.viewAccount('x.testnet')).rejects.toMatchObject({ code: 'RPC_UNAVAILABLE' });
  });

  it('does not fail over on handler errors; UNKNOWN_ACCOUNT maps to null / 0n', async () => {
    const { fetch, calls } = mockFetch(() =>
      jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        error: { name: 'HANDLER_ERROR', cause: { name: 'UNKNOWN_ACCOUNT', info: {} }, code: -32000, message: 'Server error', data: 'account x does not exist' },
      }),
    );
    const rpc = new NearRpc({ urls: ['https://a', 'https://b'], fetch });
    expect(await rpc.viewAccountOrNull('x.testnet')).toBeNull();
    expect(await rpc.getBalance('x.testnet')).toBe(0n);
    expect(await rpc.accountExists('x.testnet')).toBe(false);
    await expect(rpc.viewAccount('x.testnet')).rejects.toBeInstanceOf(RpcError);
    expect(calls.every((c) => c.url === 'https://a')).toBe(true);
  });

  it('fails over on node sync errors', async () => {
    const { fetch } = mockFetch((url) =>
      url === 'https://a'
        ? jsonResponse({ jsonrpc: '2.0', id: 1, error: { name: 'HANDLER_ERROR', cause: { name: 'NO_SYNCED_BLOCKS' } } })
        : jsonResponse({ jsonrpc: '2.0', id: 1, result: { gas_price: '100000000' } }),
    );
    expect(await new NearRpc({ urls: ['https://a', 'https://b'], fetch }).gasPrice()).toBe(100000000n);
  });

  it('decodes view function results and access keys', async () => {
    const { fetch, calls } = mockFetch((_url, body) => {
      const params = (body as { params: { request_type: string } }).params;
      if (params.request_type === 'call_function') {
        return jsonResponse({ jsonrpc: '2.0', id: 1, result: { result: [...new TextEncoder().encode('{"x":1}')], logs: [] } });
      }
      return jsonResponse({ jsonrpc: '2.0', id: 1, result: { nonce: 77, permission: 'FullAccess', block_hash: 'h', block_height: 3 } });
    });
    const rpc = new NearRpc({ urls: ['https://a'], fetch });
    expect(await rpc.viewFunction<{ x: number }>('c.testnet', 'm', { a: 1 })).toEqual({ x: 1 });
    const sent = calls[0]?.body as { params: { args_base64: string } };
    expect(new TextDecoder().decode(base64.decode(sent.params.args_base64))).toBe('{"a":1}');
    const ak = await rpc.getAccessKey('alice.testnet', new Uint8Array(32).fill(1));
    expect(ak.nonce).toBe(77n);
  });

  const outcome = (status: object) => ({
    final_execution_status: 'EXECUTED_OPTIMISTIC',
    status,
    transaction: { hash: 'TxHash', signer_id: 'alice.testnet', receiver_id: 'bob.testnet' },
    transaction_outcome: { id: 'TxHash', block_hash: 'b', outcome: { executor_id: 'alice.testnet', gas_burnt: 100, tokens_burnt: '1000', logs: [], receipt_ids: ['r'], status: { SuccessReceiptId: 'r' } } },
    receipts_outcome: [{ id: 'r', block_hash: 'b', outcome: { executor_id: 'bob.testnet', gas_burnt: 50, tokens_burnt: '500', logs: ['hi'], receipt_ids: [], status } }],
  });

  async function signed() {
    const s = SeedSigner.generate();
    return signTransaction({ signerId: 'alice.testnet', publicKey: s.publicKey, nonce: 1n, receiverId: 'bob.testnet', blockHash: BLOCK_HASH, actions: [transfer(1n)] }, s);
  }

  it('sendTransaction parses success, sums burnt gas/tokens and decodes SuccessValue', async () => {
    const { fetch, calls } = mockFetch(() => jsonResponse({ jsonrpc: '2.0', id: 1, result: outcome({ SuccessValue: base64.encode(new TextEncoder().encode('5')) }) }));
    const stx = await signed();
    const res = await new NearRpc({ urls: ['https://a'], fetch }).sendTransaction(stx);
    expect(res.success).toBe(true);
    expect(res.gasBurnt).toBe(150n);
    expect(res.tokensBurnt).toBe(1500n);
    expect(res.logs).toEqual(['hi']);
    expect(new TextDecoder().decode(res.successValue)).toBe('5');
    expect(calls[0]?.body).toMatchObject({ method: 'send_tx', params: { wait_until: 'EXECUTED_OPTIMISTIC', signed_tx_base64: base64.encode(stx.bytes) } });
  });

  it('sendTransaction throws TX_FAILED with the hash on execution failure or invalid tx', async () => {
    const stx = await signed();
    const failing = mockFetch(() => jsonResponse({ jsonrpc: '2.0', id: 1, result: outcome({ Failure: { ActionError: { kind: 'AccountDoesNotExist' } } }) }));
    const err = await new NearRpc({ urls: ['https://a'], fetch: failing.fetch }).sendTransaction(stx).catch((e: unknown) => e);
    expect(isPerdeError(err, 'TX_FAILED')).toBe(true);
    expect((err as { details: { hash: string } }).details.hash).toBe('TxHash');

    const invalid = mockFetch(() =>
      jsonResponse({ jsonrpc: '2.0', id: 1, error: { name: 'HANDLER_ERROR', cause: { name: 'INVALID_TRANSACTION', info: {} }, data: { TxExecutionError: { InvalidTxError: { InvalidNonce: { tx_nonce: 1, ak_nonce: 5 } } } } } }),
    );
    const err2 = await new NearRpc({ urls: ['https://a'], fetch: invalid.fetch }).sendTransaction(stx).catch((e: unknown) => e);
    expect(isPerdeError(err2, 'TX_FAILED')).toBe(true);
    expect((err2 as Error).message).toContain('InvalidNonce');
  });

  it('polls tx status after a send_tx timeout', async () => {
    const stx = await signed();
    const { fetch, calls } = mockFetch((_url, body) => {
      const method = (body as { method: string }).method;
      if (method === 'send_tx') return jsonResponse({ jsonrpc: '2.0', id: 1, error: { name: 'HANDLER_ERROR', cause: { name: 'TIMEOUT_ERROR' } } });
      return jsonResponse({ jsonrpc: '2.0', id: 1, result: outcome({ SuccessValue: '' }) });
    });
    const res = await new NearRpc({ urls: ['https://a'], fetch }).sendTransaction(stx);
    expect(res.success).toBe(true);
    expect(calls.map((c) => (c.body as { method: string }).method)).toEqual(['send_tx', 'tx']);
    expect(calls[1]?.body).toMatchObject({ params: { tx_hash: stx.hash, sender_account_id: 'alice.testnet' } });
  });
});
