/**
 * Canonical key of a NEAR JSON-RPC request, shared by the fixture recorder and
 * the route mock: method + params without finality / block references, with
 * `args_base64` decoded so the key is readable in the fixture file.
 *
 * @param {string} method
 * @param {unknown} params
 * @returns {string}
 */
export function rpcKey(method, params) {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) return method;
  /** @type {Record<string, unknown>} */
  const p = { ...params };
  delete p.finality;
  delete p.block_id;
  delete p.wait_until;
  if (typeof p.args_base64 === 'string') {
    try {
      p.args = JSON.parse(Buffer.from(p.args_base64, 'base64').toString('utf8') || 'null');
    } catch {
      p.args = p.args_base64;
    }
    delete p.args_base64;
  }
  const sorted = Object.fromEntries(Object.entries(p).sort(([a], [b]) => a.localeCompare(b)));
  return `${method} ${JSON.stringify(sorted)}`;
}

/** Hosts the app talks to for NEAR JSON-RPC (config.ts + core network.ts). */
export const RPC_HOST_RE = /(^|\.)(drpc\.org|fastnear\.com|near\.org)$/;
export const ONECLICK_HOST = '1click.chaindefuser.com';
export const FAUCET_HOST = 'helper.nearprotocol.com';
