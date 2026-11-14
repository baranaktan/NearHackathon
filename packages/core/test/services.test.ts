import { describe, expect, it } from 'vitest';
import { createFaucetAccount, isPerdeError, NEAR_ASSET_ID, OneClickClient, OneClickError, quoteToStealth, SeedSigner } from '../src/index.js';
import { jsonResponse, mockFetch } from './helpers.js';

const QUOTE_RESPONSE = {
  quote: {
    amountIn: '3498453',
    amountInFormatted: '3.498453',
    amountInUsd: '3.49',
    minAmountIn: '3463468',
    amountOut: '1000000000000000000000000',
    amountOutFormatted: '1.0',
    amountOutUsd: '3.43',
    minAmountOut: '1000000000000000000000000',
    timeEstimate: 27,
    refundFee: '5300',
    withdrawFee: '0',
  },
  quoteRequest: { dry: true },
  signature: 'ed25519:sig',
  timestamp: '2026-11-14T00:01:20.705Z',
  correlationId: 'c-1',
};

describe('OneClickClient (mocked fetch)', () => {
  it('lists tokens without auth headers by default', async () => {
    const { fetch, calls } = mockFetch(() => jsonResponse([{ assetId: NEAR_ASSET_ID, decimals: 24, blockchain: 'near', symbol: 'wNEAR', price: 3.4, priceUpdatedAt: 'x' }]));
    const tokens = await new OneClickClient({ fetch }).listTokens();
    expect(tokens[0]?.assetId).toBe('nep141:wrap.near');
    expect(calls[0]?.url).toBe('https://1click.chaindefuser.com/v0/tokens');
    expect(calls[0]?.headers['X-API-Key']).toBeUndefined();
  });

  it('quote defaults to dry:true and sends X-API-Key when given', async () => {
    const { fetch, calls } = mockFetch(() => jsonResponse(QUOTE_RESPONSE, 201));
    const client = new OneClickClient({ fetch, apiKey: 'k-123', baseUrl: 'https://example.test/' });
    const res = await client.quote({
      swapType: 'EXACT_INPUT',
      slippageTolerance: 100,
      originAsset: 'nep141:x',
      depositType: 'ORIGIN_CHAIN',
      destinationAsset: NEAR_ASSET_ID,
      amount: '1000',
      refundTo: 'r',
      refundType: 'ORIGIN_CHAIN',
      recipient: 'alice.near',
      recipientType: 'DESTINATION_CHAIN',
      deadline: '2026-11-14T01:00:00Z',
    });
    expect(res.quote.amountOut).toBe('1000000000000000000000000');
    expect(calls[0]?.url).toBe('https://example.test/v0/quote');
    expect(calls[0]?.headers['X-API-Key']).toBe('k-123');
    expect(calls[0]?.body).toMatchObject({ dry: true, amount: '1000' });
  });

  it('quoteToStealth builds an EXACT_OUTPUT NEAR-delivery request to the stealth account', async () => {
    const { fetch, calls } = mockFetch(() => jsonResponse(QUOTE_RESPONSE, 201));
    const stealth = 'ab'.repeat(32);
    await quoteToStealth(new OneClickClient({ fetch }), {
      originAsset: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near',
      amountOutYocto: 10n ** 24n,
      stealthAccountId: stealth,
      refundTo: '0x2527D02599Ba641c19FEa793cD0F167589a0f10D',
      deadline: new Date('2026-11-14T01:00:00Z'),
    });
    expect(calls[0]?.body).toEqual({
      dry: true,
      swapType: 'EXACT_OUTPUT',
      slippageTolerance: 100,
      originAsset: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near',
      depositType: 'ORIGIN_CHAIN',
      destinationAsset: 'nep141:wrap.near',
      amount: '1000000000000000000000000',
      refundTo: '0x2527D02599Ba641c19FEa793cD0F167589a0f10D',
      refundType: 'ORIGIN_CHAIN',
      recipient: stealth,
      recipientType: 'DESTINATION_CHAIN',
      deadline: '2026-11-14T01:00:00.000Z',
    });
    await quoteToStealth(new OneClickClient({ fetch }), { originAsset: 'a', amountIn: '5', stealthAccountId: stealth, refundTo: 'x' });
    expect(calls[1]?.body).toMatchObject({ swapType: 'EXACT_INPUT', amount: '5' });
    expect(() => quoteToStealth(new OneClickClient({ fetch }), { originAsset: 'a', stealthAccountId: stealth, refundTo: 'x' })).toThrow(/exactly one/);
    expect(() => quoteToStealth(new OneClickClient({ fetch }), { originAsset: 'a', amountIn: '5', stealthAccountId: 'Bad Id', refundTo: 'x' })).toThrow(/invalid NEAR/);
  });

  it('surfaces API errors with status and message', async () => {
    const { fetch } = mockFetch(() => jsonResponse({ message: 'Deposit address 0x1 not found', error: 'Not Found', statusCode: 404 }, 404));
    const err = await new OneClickClient({ fetch }).status('0x1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OneClickError);
    expect((err as OneClickError).status).toBe(404);
    expect((err as Error).message).toContain('not found');
    const net = mockFetch(() => {
      throw new TypeError('offline');
    });
    await expect(new OneClickClient({ fetch: net.fetch }).listTokens()).rejects.toMatchObject({ code: 'ONECLICK_ERROR', status: 0 });
  });

  it('status passes depositAddress and memo as query params', async () => {
    const { fetch, calls } = mockFetch(() => jsonResponse({ correlationId: 'c', status: 'PENDING_DEPOSIT', updatedAt: 'x', quoteResponse: QUOTE_RESPONSE, swapDetails: { intentHashes: [], nearTxHashes: [], originChainTxHashes: [], destinationChainTxHashes: [] } }));
    const s = await new OneClickClient({ fetch }).status('0xabc', '12');
    expect(s.status).toBe('PENDING_DEPOSIT');
    expect(calls[0]?.url).toBe('https://1click.chaindefuser.com/v0/status?depositAddress=0xabc&depositMemo=12');
  });
});

describe('createFaucetAccount (mocked fetch)', () => {
  const faucetOk = { status: { SuccessValue: '' }, transaction: { hash: 'FaucetTx' } };

  it('posts the new account + key, waits for RPC visibility, returns a usable secret key', async () => {
    let views = 0;
    const { fetch, calls } = mockFetch((url) => {
      if (url.includes('helper')) return jsonResponse(faucetOk, 200, { 'x-ratelimit-limit': '10', 'x-ratelimit-remaining': '7', 'x-ratelimit-reset': '1794657606' });
      views++;
      if (views < 2) return jsonResponse({ jsonrpc: '2.0', id: 1, error: { name: 'HANDLER_ERROR', cause: { name: 'UNKNOWN_ACCOUNT' } } });
      return jsonResponse({ jsonrpc: '2.0', id: 1, result: { amount: '10000000000000000000000000', locked: '0', code_hash: '1', storage_usage: 182, block_height: 1, block_hash: 'h' } });
    });
    const acc = await createFaucetAccount({ fetch, rpcUrls: ['https://rpc.fake'] });
    expect(acc.accountId).toMatch(/^perde-[0-9a-f]{12}\.testnet$/);
    expect(acc.balance).toBe(10n ** 25n);
    expect(acc.txHash).toBe('FaucetTx');
    expect(acc.rateLimit).toEqual({ limit: 10, remaining: 7, resetAt: 1794657606 });
    expect(SeedSigner.fromSecretKey(acc.secretKey).publicKeyString).toBe(acc.publicKey);
    expect(calls[0]?.body).toEqual({ newAccountId: acc.accountId, newAccountPublicKey: acc.publicKey });
  });

  it('reports rate limiting and rejects invalid ids; retries 5xx', async () => {
    const limited = mockFetch(() => jsonResponse({ error: 'too many' }, 429, { 'x-ratelimit-reset': '123' }));
    const err = await createFaucetAccount({ fetch: limited.fetch }).catch((e: unknown) => e);
    expect(isPerdeError(err, 'FAUCET_ERROR')).toBe(true);
    expect((err as Error).message).toContain('123');
    await expect(createFaucetAccount({ accountId: 'a.b.testnet' })).rejects.toMatchObject({ code: 'INVALID_ACCOUNT_ID' });

    let n = 0;
    const flaky = mockFetch(() => (++n === 1 ? new Response('oops', { status: 503 }) : jsonResponse(faucetOk)));
    const acc = await createFaucetAccount({ fetch: flaky.fetch, waitForAccount: false });
    expect(acc.txHash).toBe('FaucetTx');
    expect(n).toBe(2);
  });
});
