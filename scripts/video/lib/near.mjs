/**
 * Minimal read-only NEAR testnet RPC helpers for the recorder (balances, view
 * calls). No keys are involved here.
 */
const RPCS = ['https://test.rpc.fastnear.com', 'https://near-testnet.drpc.org'];

async function rpc(method, params) {
  let last;
  for (const url of RPCS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'perde-video', method, params }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = await res.json();
      if (body.error) throw new Error(JSON.stringify(body.error).slice(0, 300));
      return body.result;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/** Balance in yoctoNEAR (amount + locked is not relevant on testnet). */
export async function balanceYocto(accountId) {
  const r = await rpc('query', { request_type: 'view_account', finality: 'final', account_id: accountId });
  return BigInt(r.amount);
}

export async function viewCall(contractId, method, args = {}) {
  const r = await rpc('query', {
    request_type: 'call_function',
    finality: 'final',
    account_id: contractId,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
  });
  return JSON.parse(Buffer.from(r.result).toString('utf8'));
}

export const fmtNear = (yocto, digits = 4) => {
  const neg = yocto < 0n;
  const v = neg ? -yocto : yocto;
  const whole = v / 10n ** 24n;
  const frac = (v % 10n ** 24n).toString().padStart(24, '0').slice(0, digits);
  return `${neg ? '-' : ''}${whole}.${frac}`;
};
