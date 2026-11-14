import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_CONFIG } from '../config';
import { limitedFetch, MAX_IN_FLIGHT, rpc } from './perde';

afterEach(() => vi.unstubAllGlobals());

describe('RPC setup', () => {
  it('never runs more than four requests at once', async () => {
    let active = 0;
    let peak = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return new Response('{}', { status: 200 });
      }),
    );
    const url = APP_CONFIG.rpcUrls[0] as string;
    await Promise.all(Array.from({ length: 12 }, () => limitedFetch(url, { method: 'POST' })));
    expect(peak).toBe(MAX_IN_FLIGHT);
  });

  it('reads from the burst-tolerant endpoint first and broadcasts through the one without a request-time cap', () => {
    expect(rpc.endpointOrder('query')[0]).toBe('https://near-testnet.drpc.org');
    expect(rpc.endpointOrder('send_tx')[0]).toBe('https://test.rpc.fastnear.com');
    expect(rpc.endpointOrder('gas_price')[0]).toBe('https://test.rpc.fastnear.com');
    expect(new Set(APP_CONFIG.rpcUrls)).toEqual(new Set(APP_CONFIG.broadcastUrls));
  });

  it('shares one request between identical concurrent reads', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { gas_price: '100000000' } }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    rpc.clearCache();
    const [a, b] = await Promise.all([rpc.gasPrice(), rpc.gasPrice()]);
    expect(a).toBe(100000000n);
    expect(b).toBe(100000000n);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    rpc.clearCache();
  });
});
