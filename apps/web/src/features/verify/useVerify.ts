/**
 * Verify a receipt: recompute R and P from the meta-address and r, find the
 * announcement on-chain, compare. Accepts `#/app/verify?r=<receipt>`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { APP_CONFIG } from '../../config';
import { perde } from '../../lib/perde';
import { errorText } from '../../lib/errors';
import { buildVerification, parseReceipt } from './logic';
import type { VerifyModel, VerifyState } from './types';

export function useVerify(): VerifyModel {
  const [params] = useSearchParams();
  const fromLink = params.get('r');
  const [input, setInput] = useState(fromLink ?? '');
  const [state, setState] = useState<VerifyState>({ status: 'idle' });
  const runId = useRef(0);

  // Following another `?r=` link while this page is open: show that receipt in the field (the effect below verifies it).
  const [linked, setLinked] = useState(fromLink);
  if (fromLink !== linked) {
    setLinked(fromLink);
    if (fromLink) setInput(fromLink);
  }

  const verify = useCallback(async (text: string) => {
    const v = text.trim();
    const parsed = parseReceipt(v);
    if (!parsed.ok) {
      setState({ status: 'invalid', message: v.startsWith('perdereceipt:') ? parsed.message : 'A receipt starts with “perdereceipt:”.' });
      return;
    }
    const id = ++runId.current;
    setState({ status: 'verifying' });
    try {
      const [onChain, count] = await Promise.all([perde.verifyReceipt(v), perde.announcementCount()]);
      if (id !== runId.current) return;
      setState(
        buildVerification(v, {
          contractId: APP_CONFIG.contractId,
          announcementCount: count,
          announcement: onChain.announcement,
          balanceYocto: onChain.balance ?? 0n,
          transaction: onChain.transaction,
        }),
      );
    } catch (e) {
      if (id === runId.current) setState({ status: 'error', message: errorText(e, 'verify') });
    }
  }, []);

  // Deep link: verify immediately.
  useEffect(() => {
    if (!fromLink) return;
    const t = window.setTimeout(() => void verify(fromLink), 0);
    return () => window.clearTimeout(t);
  }, [fromLink, verify]);

  return {
    input,
    setInput,
    state,
    verify: () => void verify(input),
    clear() {
      runId.current++;
      setInput('');
      setState({ status: 'idle' });
    },
  };
}
