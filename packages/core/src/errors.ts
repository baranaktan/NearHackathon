export type PerdeErrorCode =
  | 'INVALID_MNEMONIC'
  | 'INVALID_PREFIX'
  | 'INVALID_ENCODING'
  | 'INVALID_LENGTH'
  | 'BAD_CHECKSUM'
  | 'INVALID_POINT'
  | 'INVALID_SCALAR'
  | 'INVALID_RECEIPT'
  | 'INVALID_ACCOUNT_ID'
  | 'INVALID_AMOUNT'
  | 'INVALID_KEY'
  | 'KEY_MISMATCH'
  | 'RPC_ERROR'
  | 'RPC_UNAVAILABLE'
  | 'TX_FAILED'
  | 'INSUFFICIENT_BALANCE'
  | 'DESTINATION_NOT_FOUND'
  | 'RECIPIENT_NOT_REGISTERED'
  | 'FAUCET_ERROR'
  | 'ONECLICK_ERROR'
  | 'DAO_ERROR';

export class PerdeError extends Error {
  readonly code: PerdeErrorCode;
  readonly details: unknown;

  constructor(code: PerdeErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'PerdeError';
    this.code = code;
    this.details = details;
  }
}

export function isPerdeError(e: unknown, code?: PerdeErrorCode): e is PerdeError {
  return e instanceof PerdeError && (code === undefined || e.code === code);
}
