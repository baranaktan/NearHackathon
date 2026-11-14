/**
 * Verify-receipt data. PREVIEW IMPLEMENTATION — fixtures only. Replace with:
 * parse "perdereceipt:", recompute R = r·G and P from the meta-address, find
 * the announcement and tx status over RPC; keep `VerifyModel`.
 */
import { useState } from 'react';
import type { VerifyModel, VerifyState } from './types';
import { fxChecks, fxReceipt, fxReceiptSummary } from '../../preview-fixtures/data';
import { previewDelay, usePreviewState } from '../../preview-fixtures/preview-state';

export function useVerify(): VerifyModel {
  const preview = usePreviewState('/app/verify');
  const [input, setInput] = useState(preview === 'idle' ? '' : preview === 'invalid' ? 'perdereceipt:not-a-receipt' : fxReceipt);
  const [state, setState] = useState<VerifyState>(() =>
    preview === 'verifying'
      ? { status: 'verifying' }
      : preview === 'verified'
        ? { status: 'verified', summary: fxReceiptSummary, checks: fxChecks() }
        : preview === 'failed'
          ? {
              status: 'failed',
              summary: fxReceiptSummary,
              reason: 'The stealth account in this receipt does not derive from the stated meta-address.',
              checks: fxChecks(true),
            }
          : preview === 'invalid'
            ? { status: 'invalid', message: 'This is not a Perde receipt: the payload is not valid base64url JSON.' }
            : { status: 'idle' },
  );

  return {
    input,
    setInput,
    state,
    verify() {
      const v = input.trim();
      if (!v.startsWith('perdereceipt:')) {
        setState({ status: 'invalid', message: 'A receipt starts with “perdereceipt:”.' });
        return;
      }
      setState({ status: 'verifying' });
      void previewDelay(1200).then(() => setState({ status: 'verified', summary: fxReceiptSummary, checks: fxChecks() }));
    },
    clear() {
      setInput('');
      setState({ status: 'idle' });
    },
  };
}
