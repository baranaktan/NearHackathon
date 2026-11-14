import { describe, expect, it } from 'vitest';
import { OneClickError, PerdeError, RpcError } from '@perde/core';
import { describeError, UserFacingError } from './errors';

describe('describeError', () => {
  it('explains a faucet rate limit and points to the import option', () => {
    const e = new PerdeError('FAUCET_ERROR', 'faucet rate limit reached', { status: 429, rateLimit: { resetAt: 1_800_000_000 } });
    const f = describeError(e, 'faucet');
    expect(f.title).toBe('Couldn’t create a testnet account');
    expect(f.message).toMatch(/rate-limited/);
    expect(f.message).toMatch(/existing testnet account/);
    expect(f.retryable).toBe(false);
  });

  it('maps insufficient balance hidden inside a TX_FAILED outcome', () => {
    const e = new PerdeError('TX_FAILED', 'transaction rejected', { error: { InvalidTxError: { NotEnoughBalance: { balance: '1' } } } });
    expect(describeError(e, 'send').message).toMatch(/Not enough balance/);
  });

  it('extracts a contract panic message', () => {
    const e = new PerdeError('TX_FAILED', 'transaction X failed: {"ActionError":{"kind":{"FunctionCallError":{"ExecutionError":"Smart contract panicked: attached deposit must be at least 12"}}}}');
    expect(describeError(e, 'send').message).toBe('The contract rejected it: attached deposit must be at least 12');
  });

  it('marks nonce races and RPC outages as retryable', () => {
    expect(describeError(new PerdeError('TX_FAILED', 'x', { error: 'InvalidNonce' })).retryable).toBe(true);
    const outage = describeError(new PerdeError('RPC_UNAVAILABLE', 'all RPC endpoints failed'), 'scan');
    expect(outage.retryable).toBe(true);
    expect(outage.title).toBe('Scan interrupted');
  });

  it('turns a 1Click minimum (in yocto) into NEAR', () => {
    const e = new OneClickError(400, '1Click POST /v0/quote → HTTP 400: Amount is too low for bridge, try at least 1261978098083843571005332', {});
    expect(describeError(e, 'quote').message).toBe('This route has a minimum: the invoice must ask for at least 1.2619 NEAR.');
  });

  it('handles unknown accounts and browser network errors', () => {
    expect(describeError(new RpcError('query failed', 'HANDLER_ERROR', 'UNKNOWN_ACCOUNT', {})).message).toMatch(/doesn’t exist/);
    expect(describeError(new TypeError('Failed to fetch')).message).toMatch(/network request failed/);
  });

  it('passes human-written errors through unchanged', () => {
    expect(describeError(new UserFacingError('Top it up first.'), 'send')).toEqual({ title: 'Payment not sent', message: 'Top it up first.', retryable: false });
  });
});
