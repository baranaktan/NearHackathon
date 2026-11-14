import { useCallback, useEffect, useState } from 'react';
import { getContractConfig, sendGasReserve } from './perde';
import { errorText } from './errors';

export interface SendLimits {
  minAmountYocto: bigint;
  announceFeeYocto: bigint;
  /** Gas reserve for ONE send action; multiply for batches. */
  gasPerSendYocto: bigint;
  version: string;
}

/** Contract fee/minimum and the gas headroom one `send` needs, read from chain. */
export function useSendLimits(): { limits: SendLimits | null; error: string | null; retry: () => void } {
  const [limits, setLimits] = useState<SendLimits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([getContractConfig(), sendGasReserve(1)])
      .then(([c, gas]) => {
        if (!live) return;
        setLimits({ minAmountYocto: c.minAmount, announceFeeYocto: c.announceFee, gasPerSendYocto: gas, version: c.version });
        setError(null);
      })
      .catch((e: unknown) => {
        if (live) setError(errorText(e));
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { limits, error, retry };
}
