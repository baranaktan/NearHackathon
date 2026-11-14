import { useEffect, useState } from 'react';
import type { PerdeConfig } from '@perde/core';
import { APP_CONFIG } from '../../config';
import { useAppState } from '../../state/context';
import { clearState } from '../../state/storage';
import { getContractConfig } from '../../lib/perde';
import { errorText } from '../../lib/errors';
import type { SettingsModel } from './types';

export function useSettings(): SettingsModel {
  const { state, dispatch, persisted } = useAppState();
  const [config, setConfig] = useState<PerdeConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getContractConfig()
      .then((c) => live && setConfig(c))
      .catch((e: unknown) => live && setConfigError(errorText(e)));
    return () => {
      live = false;
    };
  }, []);

  return {
    network: {
      networkId: APP_CONFIG.networkId,
      rpcUrls: APP_CONFIG.rpcUrls,
      explorerUrl: APP_CONFIG.explorerUrl,
      contractId: APP_CONFIG.contractId,
      contractVersion: config?.version ?? null,
      announceFeeYocto: config?.announceFee.toString() ?? null,
      minAmountYocto: config?.minAmount.toString() ?? null,
      configError,
    },
    hasWallet: state.wallet !== null,
    persisted,
    demoDismissed: state.demo.dismissed,
    showDemo: () => dispatch({ type: 'demo/update', patch: { dismissed: false } }),
    resetAll() {
      dispatch({ type: 'reset' });
      clearState();
    },
  };
}
