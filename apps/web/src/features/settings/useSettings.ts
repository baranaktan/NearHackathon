/**
 * Settings & demo data. PREVIEW IMPLEMENTATION — fixtures only. Replace with:
 * read deployments/testnet.json + `get_config`, create/fund demo accounts via
 * the testnet faucet helper, persist them locally; keep `SettingsModel`.
 */
import { useState } from 'react';
import type { DemoAccount, DemoRole, SettingsModel } from './types';
import { APP_CONFIG } from '../../config';
import { fx } from '../../preview-fixtures/data';
import { previewDelay, usePreviewState } from '../../preview-fixtures/preview-state';

const ready = (role: DemoRole): DemoAccount => ({
  role,
  accountId: role === 'sender' ? fx.senderAccount : fx.recipientAccount,
  balanceYocto: role === 'sender' ? fx.NEAR('9.87') : fx.NEAR('10'),
  status: 'ready',
});

export function useSettings(): SettingsModel {
  const preview = usePreviewState('/app/settings');
  const [accounts, setAccounts] = useState<DemoAccount[]>(() => {
    switch (preview) {
      case 'missing':
        return [
          { role: 'sender', accountId: null, balanceYocto: null, status: 'missing' },
          { role: 'recipient', accountId: null, balanceYocto: null, status: 'missing' },
        ];
      case 'funding':
        return [{ ...ready('sender'), status: 'funding', balanceYocto: null }, ready('recipient')];
      case 'error':
        return [
          { role: 'sender', accountId: null, balanceYocto: null, status: 'error', error: 'Faucet rate limit reached. Try again in a minute.' },
          ready('recipient'),
        ];
      default:
        return [ready('sender'), ready('recipient')];
    }
  });

  return {
    network: {
      networkId: 'testnet',
      rpcUrl: APP_CONFIG.rpcUrl,
      explorerUrl: APP_CONFIG.explorerUrl,
      contractId: fx.contractId,
      contractVersion: '1.0.0',
    },
    demoAccounts: accounts,
    fund(role) {
      setAccounts((as) => as.map((a) => (a.role === role ? { ...a, status: 'funding', error: undefined } : a)));
      void previewDelay(1500).then(() => setAccounts((as) => as.map((a) => (a.role === role ? ready(role) : a))));
    },
    resetAll() {
      setAccounts([
        { role: 'sender', accountId: null, balanceYocto: null, status: 'missing' },
        { role: 'recipient', accountId: null, balanceYocto: null, status: 'missing' },
      ]);
    },
  };
}
