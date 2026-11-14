/**
 * Turns anything thrown by @perde/core, NEAR RPC, the faucet or 1Click into
 * one short, human sentence. Raw details stay available for a "details" line.
 */
import { formatYocto } from './near-format';

export type ErrorContext = 'send' | 'claim' | 'faucet' | 'import' | 'quote' | 'scan' | 'register' | 'verify' | 'pay' | 'generic';

export interface FriendlyError {
  title: string;
  message: string;
  /** Worth offering a "Try again" button. */
  retryable: boolean;
  /** Technical text for the curious (never contains secrets). */
  detail?: string;
}

interface ErrorLike {
  name?: unknown;
  code?: unknown;
  message?: unknown;
  details?: unknown;
  causeName?: unknown;
  status?: unknown;
}

function asErrorLike(e: unknown): ErrorLike {
  return typeof e === 'object' && e !== null ? (e as ErrorLike) : {};
}

function stringify(x: unknown): string {
  if (typeof x === 'string') return x;
  try {
    return JSON.stringify(x, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)) ?? '';
  } catch {
    return String(x);
  }
}

const TITLES: Record<ErrorContext, string> = {
  send: 'Payment not sent',
  claim: 'Claim failed',
  faucet: 'Couldn’t create a testnet account',
  import: 'Couldn’t use that account',
  quote: 'No quote for this route',
  scan: 'Scan interrupted',
  register: 'Registration failed',
  verify: 'Couldn’t verify',
  pay: 'Payment not sent',
  generic: 'Something went wrong',
};

function panicMessage(text: string): string | null {
  const m = /Smart contract panicked: ([^"\\]+)/.exec(text) ?? /"ExecutionError":"([^"]+)"/.exec(text);
  return m?.[1]?.trim() ?? null;
}

/** "Amount is too low for bridge, try at least 1261978098083843571005332" (yocto of NEAR) → NEAR. */
function oneClickMessage(raw: string): string {
  const low = /Amount is too low[^,]*, try at least (\d+)/i.exec(raw);
  if (low?.[1]) return `This route has a minimum: the invoice must ask for at least ${formatYocto(low[1], { maxFractionDigits: 4 })} NEAR.`;
  return raw.replace(/^1Click (GET|POST) \S+ → /u, '');
}

/** An error whose message is already written for people; shown as is. */
export class UserFacingError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.name = 'UserFacingError';
    this.retryable = retryable;
  }
}

export function describeError(e: unknown, context: ErrorContext = 'generic'): FriendlyError {
  if (e instanceof UserFacingError) return { title: TITLES[context], message: e.message, retryable: e.retryable };
  const err = asErrorLike(e);
  const code = typeof err.code === 'string' ? err.code : undefined;
  const message = typeof err.message === 'string' ? err.message : typeof e === 'string' ? e : 'Unknown error';
  const detailsText = err.details === undefined ? '' : stringify(err.details);
  const all = `${message} ${detailsText}`;
  const title = TITLES[context];
  const make = (msg: string, retryable: boolean, detail: string | undefined = message): FriendlyError => ({
    title,
    message: msg,
    retryable,
    ...(detail && detail !== msg ? { detail } : {}),
  });

  // Browser network failures (offline, DNS, CORS) surface as TypeError from fetch.
  if (e instanceof TypeError && /fetch|network/i.test(message)) {
    return make('The network request failed. Check your connection and try again.', true);
  }

  switch (code) {
    case 'FAUCET_ERROR': {
      const details = (typeof err.details === 'object' && err.details !== null ? err.details : {}) as { status?: number; rateLimit?: { resetAt?: number } };
      if (details.status === 429) {
        const reset = details.rateLimit?.resetAt;
        const when = reset ? ` It resets around ${new Date(reset * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : '';
        return make(
          `The public testnet faucet is rate-limited (about 10 new accounts per 12 hours per network).${when} Use an existing testnet account instead: paste its account id and secret key below.`,
          false,
        );
      }
      return make(`The testnet faucet didn’t create the account. Try again, or use an existing testnet account instead.`, true);
    }
    case 'RPC_UNAVAILABLE':
      return make('NEAR testnet didn’t respond (every RPC endpoint failed or timed out). Check your connection and try again.', true);
    case 'INSUFFICIENT_BALANCE':
      if (context === 'claim') return make('This account holds too little to pay for its own claim, or it was already emptied.', false);
      return make('Not enough balance for this amount plus fees and gas.', false);
    case 'DESTINATION_NOT_FOUND':
      return make(
        'That destination account doesn’t exist on testnet. A full sweep needs an existing account; a transfer claim can create a new 64-hex implicit account.',
        false,
      );
    case 'RECIPIENT_NOT_REGISTERED':
      return make('That name has no Perde meta-address registered. Ask the recipient for their perde: address instead.', false);
    case 'INVALID_KEY':
      return make('That secret key isn’t a valid NEAR ed25519 key. It should look like ed25519:… (base58).', false);
    case 'INVALID_ACCOUNT_ID':
      return make('That isn’t a valid NEAR account id.', false);
    case 'INVALID_AMOUNT':
      return make(message.replace(/(\d{19,})/g, (y) => `${formatYocto(y, { maxFractionDigits: 6 })} NEAR`).replace(/ yocto/g, ''), false);
    case 'INVALID_PREFIX':
    case 'INVALID_ENCODING':
    case 'INVALID_LENGTH':
    case 'INVALID_POINT':
    case 'INVALID_SCALAR':
    case 'INVALID_RECEIPT':
      return make(`${message.charAt(0).toUpperCase()}${message.slice(1)}.`, false);
    case 'BAD_CHECKSUM':
      return make('The checksum doesn’t match — a character is missing or mistyped.', false);
    case 'ONECLICK_ERROR': {
      if (err.status === 0) return make('1Click (NEAR Intents) didn’t respond. Check your connection and try again.', true);
      return make(oneClickMessage(message), typeof err.status === 'number' && err.status >= 500);
    }
    case 'RPC_ERROR': {
      if (err.causeName === 'UNKNOWN_ACCOUNT') return make('That account doesn’t exist on NEAR testnet.', false);
      if (err.causeName === 'UNKNOWN_ACCESS_KEY') return make('This key is not an access key of that account.', false);
      if (/timed out after/.test(message)) return make('NEAR testnet didn’t show the result in time. Refresh in a moment — it has probably landed.', true);
      return make(`NEAR testnet returned an error for this request (${typeof err.causeName === 'string' ? err.causeName : 'no details'}). Try again.`, true);
    }
    case 'TX_FAILED': {
      if (/NotEnoughBalance|LackBalanceForState|BalanceMismatch/.test(all)) {
        return make('Not enough balance: the account can’t cover the amount plus gas. Top it up or send less.', false);
      }
      if (/InvalidNonce/.test(all)) return make('Another transaction from this account was in flight at the same moment. Try again.', true);
      if (/Expired/.test(all)) return make('The transaction expired before it was included. Try again.', true);
      if (/AccessKeyNotFound|InvalidAccessKeyError|InvalidSignature/.test(all)) {
        return make('This key can’t sign for the account any more (access key missing or not full access).', false);
      }
      const panic = panicMessage(all);
      if (panic) return make(`The contract rejected it: ${panic}`, false);
      return make('The network rejected the transaction.', true);
    }
    default:
      return make(message, true);
  }
}

export function errorText(e: unknown, context: ErrorContext = 'generic'): string {
  return describeError(e, context).message;
}
