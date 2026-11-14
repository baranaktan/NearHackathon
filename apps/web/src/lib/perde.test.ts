import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_CONFIG } from '../config';
import { resilientFetch } from './perde';

afterEach(() => vi.unstubAllGlobals());

describe('resilientFetch', () => {
  it('cools an endpoint down after a failure so failover skips it without a request', async () => {
    const [first, second] = APP_CONFIG.rpcUrls as [string, string];
    const fetchMock = vi.fn(async (url: string) => {
      if (url === first) throw new TypeError('Failed to fetch');
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(resilientFetch(first, { method: 'POST' })).rejects.toThrow('Failed to fetch');
    await expect(resilientFetch(first, { method: 'POST' })).rejects.toThrow(/cooling down/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await resilientFetch(second, { method: 'POST' })).status).toBe(200);
  });

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
    const url = APP_CONFIG.rpcUrls[1] as string;
    await Promise.all(Array.from({ length: 12 }, () => resilientFetch(url, { method: 'POST' })));
    expect(peak).toBe(4);
  });
});
