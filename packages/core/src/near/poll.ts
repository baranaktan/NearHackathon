import { PerdeError } from '../errors.js';
import { RpcError } from './rpc.js';

export interface PollOptions {
  /** Give up after this long. Default 20 s. */
  readonly timeoutMs?: number;
  /** Delay between attempts. Default 750 ms. */
  readonly intervalMs?: number;
  /** Which errors mean "not visible yet, try again". Default: `isReadLagError`. */
  readonly retryOn?: (error: unknown) => boolean;
  /** Used in the timeout message. */
  readonly what?: string;
}

/**
 * Errors a read can hit right after a write when the RPC node serving it has
 * not applied the block yet (RPC endpoints are load-balanced and may lag each
 * other by a block or two): a contract view that panics because the record
 * does not exist yet, an unknown account, or a transient RPC failure.
 */
export function isReadLagError(error: unknown): boolean {
  if (error instanceof RpcError) {
    return error.causeName === 'CONTRACT_EXECUTION_ERROR' || error.causeName === 'UNKNOWN_ACCOUNT' || error.causeName === 'UNKNOWN_BLOCK';
  }
  return error instanceof PerdeError && (error.code === 'RPC_UNAVAILABLE' || error.code === 'RPC_ERROR');
}

/**
 * Bounded read-after-write polling: calls `fn` until `ok(value)` holds,
 * retrying lag-type errors. Throws `PerdeError("RPC_ERROR")` on timeout
 * (details: the last value or error), or the first non-retryable error.
 */
export async function pollUntil<T>(fn: () => Promise<T>, ok: (value: T) => boolean, options: PollOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const intervalMs = options.intervalMs ?? 750;
  const retryOn = options.retryOn ?? isReadLagError;
  const start = Date.now();
  let last: { value: T } | { error: unknown } | undefined;
  for (;;) {
    try {
      const value = await fn();
      if (ok(value)) return value;
      last = { value };
    } catch (e) {
      if (!retryOn(e)) throw e;
      last = { error: e };
    }
    if (Date.now() - start + intervalMs > timeoutMs) {
      const reason = 'error' in last ? `: ${last.error instanceof Error ? last.error.message : String(last.error)}` : '';
      throw new PerdeError('RPC_ERROR', `timed out after ${timeoutMs} ms waiting for ${options.what ?? 'chain state'}${reason}`, last);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
