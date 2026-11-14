/** Demo wallet: one throwaway testnet account that signs every payment in this browser. */
import { createFaucetAccount, isValidAccountId, RpcError, SeedSigner } from '@perde/core';
import { rpc } from '../lib/perde';
import type { WalletRecord } from '../state/schema';

/** 10 NEAR from the public testnet faucet (helper.nearprotocol.com). */
export async function createFaucetWallet(): Promise<WalletRecord> {
  const acc = await createFaucetAccount();
  return { accountId: acc.accountId, secretKey: acc.secretKey, source: 'faucet', addedAtMs: Date.now() };
}

export type ImportCheck = { ok: true; wallet: WalletRecord } | { ok: false; field: 'accountId' | 'secretKey'; message: string };

/** Validate an existing testnet account + key by reading the key's permission on-chain. */
export async function importWallet(accountIdInput: string, secretKeyInput: string): Promise<ImportCheck> {
  const accountId = accountIdInput.trim().toLowerCase();
  const secretKey = secretKeyInput.trim();
  if (!isValidAccountId(accountId)) return { ok: false, field: 'accountId', message: 'Enter a NEAR account id such as name.testnet or a 64-hex implicit account.' };
  if (accountId.endsWith('.near')) return { ok: false, field: 'accountId', message: 'That is a mainnet account. This build runs on testnet only.' };
  let signer: SeedSigner;
  try {
    signer = SeedSigner.fromSecretKey(secretKey);
  } catch {
    return { ok: false, field: 'secretKey', message: 'Paste the full secret key: ed25519: followed by base58 characters.' };
  }
  const exists = await rpc.accountExists(accountId);
  if (!exists) return { ok: false, field: 'accountId', message: `${accountId} doesn’t exist on NEAR testnet.` };
  try {
    const key = await rpc.getAccessKey(accountId, signer.publicKey);
    if (key.permission !== 'FullAccess') {
      return { ok: false, field: 'secretKey', message: 'This is a function-call key. Payments need a full-access key of the account.' };
    }
  } catch (e) {
    if (e instanceof RpcError && e.causeName === 'UNKNOWN_ACCESS_KEY') {
      return { ok: false, field: 'secretKey', message: `This key is not an access key of ${accountId}.` };
    }
    throw e;
  }
  return { ok: true, wallet: { accountId, secretKey: signer.secretKey, source: 'import', addedAtMs: Date.now() } };
}
