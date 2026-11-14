import type { FeeTriple, ProtocolFeeConfig } from '../near/rpc.js';

export type ClaimMode = 'transfer' | 'deleteAccount';

export interface ClaimFeeInput {
  readonly config: ProtocolFeeConfig;
  /** Current gas price (yocto per gas) from the `gas_price` RPC. */
  readonly gasPrice: bigint;
  readonly mode: ClaimMode;
  /** True when sweeping (transfer mode) to an implicit account that does not exist yet. */
  readonly createsDestination: boolean;
  /** Multiplier applied to the computed prepaid cost, as a fraction. Default 3/2. */
  readonly safety?: readonly [bigint, bigint];
}

export interface ClaimFeeEstimate {
  /** Gas units the claim transaction and its receipt consume. */
  readonly gas: bigint;
  /** Price used for the reserve: max(gasPrice, minGasPurchasePrice) inflated by the pessimistic ratio. */
  readonly reservePrice: bigint;
  /** Upper bound of the tokens the claim burns at the current gas price. */
  readonly expectedFee: bigint;
  /** Amount left behind in the stealth account to pay for the claim (transfer mode). */
  readonly reserve: bigint;
}

/** Fallback fees (nearcore runtime config, protocol 88 on testnet, 2026-11-14). */
export const FALLBACK_FEE_CONFIG: ProtocolFeeConfig = {
  protocolVersion: 88,
  actionReceiptCreation: { sendNotSir: 108_059_500_000n, sendSir: 108_059_500_000n, execution: 108_059_500_000n },
  transfer: { sendNotSir: 115_123_062_500n, sendSir: 115_123_062_500n, execution: 115_123_062_500n },
  createAccount: { sendNotSir: 500_000_000_000n, sendSir: 500_000_000_000n, execution: 7_200_000_000_000n },
  addFullAccessKey: { sendNotSir: 101_765_125_000n, sendSir: 101_765_125_000n, execution: 101_765_125_000n },
  deleteAccount: { sendNotSir: 147_489_000_000n, sendSir: 147_489_000_000n, execution: 147_489_000_000n },
  minGasPurchasePrice: 1_000_000_000n,
  accountCreationCharge: 7_000_000_000_000_000_000_000n,
  pessimisticInflation: [1, 1],
};

function cost(f: FeeTriple, sir: boolean): bigint {
  return (sir ? f.sendSir : f.sendNotSir) + f.execution;
}

/**
 * Gas math for a claim.
 *
 * Measured on testnet (protocol 88, gas price 1e8): a Transfer is rejected
 * with NotEnoughBalance unless balance ≥ amount + sendGas·gasPrice +
 * execGas·1e9, i.e. the receipt's execution gas is prepaid at
 * `min_gas_purchase_price`; the unused part is refunded to the signer.
 *
 * Transfer mode: the stealth account keeps `reserve` behind; what is not burnt
 * comes back to it as a refund (dust). DeleteAccount mode: the protocol hands
 * the whole remaining balance to the beneficiary after fees, so nothing is
 * reserved and no dust remains.
 */
export function estimateClaimFee(input: ClaimFeeInput): ClaimFeeEstimate {
  const { config: c, gasPrice, mode, createsDestination } = input;
  const [sNum, sDen] = input.safety ?? [3n, 2n];
  let gas: bigint;
  if (mode === 'deleteAccount') {
    gas = cost(c.actionReceiptCreation, true) + cost(c.deleteAccount, true);
  } else {
    gas = cost(c.actionReceiptCreation, false) + cost(c.transfer, false);
    if (createsDestination) gas += cost(c.createAccount, false) + cost(c.addFullAccessKey, false);
  }
  const floor = c.minGasPurchasePrice ?? 0n;
  const base = gasPrice > floor ? gasPrice : floor;
  const [iNum, iDen] = c.pessimisticInflation;
  const reservePrice = (base * BigInt(iNum) + BigInt(iDen) - 1n) / BigInt(iDen);
  const creationCharge = mode === 'transfer' && createsDestination ? (c.accountCreationCharge ?? 0n) : 0n;
  const expectedFee = gas * gasPrice + creationCharge;
  const reserve = mode === 'deleteAccount' ? 0n : (gas * reservePrice * sNum + sDen - 1n) / sDen + creationCharge;
  return { gas, reservePrice, expectedFee, reserve };
}
