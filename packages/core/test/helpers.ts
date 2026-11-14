import type { FetchFn } from '../src/index.js';

export interface RecordedCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

/** fetch mock: the handler sees the URL and the parsed JSON body (if any). */
export function mockFetch(handler: (url: string, body: unknown, init: RequestInit) => Response | Promise<Response>): {
  fetch: FetchFn;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetch: FetchFn = async (url, init) => {
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    const headers: Record<string, string> = {};
    if (init.headers !== undefined) {
      for (const [k, v] of Object.entries(init.headers as Record<string, string>)) headers[k] = v;
    }
    calls.push({ url, method: init.method ?? 'GET', headers, body });
    return handler(url, body, init);
  };
  return { fetch, calls };
}
