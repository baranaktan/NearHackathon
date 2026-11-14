export { PerdeError, isPerdeError, type PerdeErrorCode } from './errors.js';

export {
  L,
  H512s,
  randomScalar,
  scalarToBytes,
  scalarFromBytes,
  pointFromBytes,
  pointFromHex,
  bytesToHex,
  hexToBytes,
} from './crypto/primitives.js';
export {
  generateMnemonic,
  validateMnemonic,
  normalizeMnemonic,
  keysFromMnemonic,
  keysFromSeed,
  toViewKeys,
  toMetaAddress,
  type MetaAddress,
  type ViewKeys,
  type SpendKeys,
} from './crypto/keys.js';
export {
  META_PREFIX,
  VIEWING_KEY_PREFIX,
  encodeMetaAddress,
  decodeMetaAddress,
  isMetaAddress,
  encodeViewingKey,
  decodeViewingKey,
  isViewingKey,
} from './crypto/encoding.js';
export {
  deriveStealth,
  scanAnnouncement,
  recoverSpendScalar,
  publicKeyFromScalar,
  invoiceScalar,
  deriveInvoice,
  invoiceMatch,
  recoverInvoiceScalar,
  signWithScalar,
  scalarToHex,
  hexToScalar,
  type StealthDerivation,
  type AnnouncementLike,
  type StealthMatch,
  type InvoiceDerivation,
} from './crypto/stealth.js';
export {
  RECEIPT_PREFIX,
  createReceipt,
  decodeReceipt,
  verifyReceipt,
  type ReceiptData,
  type ReceiptVerification,
} from './crypto/receipt.js';

export { parseNear, formatNear, toYocto, tgas, NEAR_DECIMALS, YOCTO_PER_NEAR, GAS_PER_TGAS, type FormatNearOptions } from './near/units.js';
export { isValidAccountId, isImplicitAccountId, isEthImplicitAccountId, assertAccountId } from './near/accountId.js';
export { NETWORKS, explorerTxUrl, explorerAccountUrl, type NetworkId, type NetworkConfig } from './near/network.js';
export {
  ScalarSigner,
  SeedSigner,
  encodePublicKey,
  decodePublicKey,
  implicitAccountId,
  type Signer,
} from './near/signer.js';
export {
  transfer,
  functionCall,
  deleteAccount,
  serializeTransaction,
  serializeSignedTransaction,
  transactionHash,
  signTransaction,
  signedTransactionBase64,
  type Action,
  type TransferAction,
  type FunctionCallAction,
  type DeleteAccountAction,
  type Transaction,
  type SignedTransaction,
} from './near/transaction.js';
export {
  NearRpc,
  RpcError,
  parseOutcome,
  parseProtocolFeeConfig,
  type FetchFn,
  type Finality,
  type WaitUntil,
  type NearRpcOptions,
  type AccountView,
  type AccessKeyView,
  type BlockInfo,
  type ExecutionStatus,
  type ExecutionOutcomeRaw,
  type FinalExecutionOutcomeRaw,
  type TxOutcome,
  type FeeTriple,
  type FeeTripleRaw,
  type ProtocolFeeConfig,
  type ProtocolConfigRaw,
} from './near/rpc.js';
export { sendActions, buildSignedTransaction, type SendActionsParams } from './near/send.js';

export { estimateClaimFee, FALLBACK_FEE_CONFIG, type ClaimMode, type ClaimFeeInput, type ClaimFeeEstimate } from './perde/fees.js';
export {
  PerdeClient,
  type PerdeClientOptions,
  type PerdeConfig,
  type Announcement,
  type AnnouncementPage,
  type ScannedPayment,
  type ScanResult,
  type InvoicePayment,
  type SendResult,
  type BatchItem,
  type BatchItemResult,
  type BatchResult,
  type Claimable,
  type ClaimOptions,
  type ClaimResult,
} from './perde/client.js';

export {
  createFaucetAccount,
  randomTestnetAccountId,
  FAUCET_URL,
  type FaucetOptions,
  type FaucetAccount,
  type FaucetRateLimit,
} from './faucet.js';
export {
  OneClickClient,
  OneClickError,
  quoteToStealth,
  ONECLICK_BASE_URL,
  NEAR_ASSET_ID,
  type OneClickOptions,
  type OneClickToken,
  type QuoteRequest,
  type QuoteParams,
  type Quote,
  type QuoteResponse,
  type StatusResponse,
  type SwapDetails,
  type SwapStatus,
  type SwapType,
  type DepositType,
  type RecipientType,
  type RefundType,
  type AppFee,
  type TransactionDetails,
  type QuoteToStealthParams,
} from './oneclick.js';
