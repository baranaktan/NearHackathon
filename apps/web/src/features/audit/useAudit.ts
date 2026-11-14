/**
 * Audit data. PREVIEW IMPLEMENTATION — fixtures only. Replace with: decode
 * the "perdeview:" key with @perde/core, scan announcements read-only (no
 * spend key), read balances; keep `AuditModel`.
 */
import { useState } from 'react';
import type { AuditModel, AuditState } from './types';
import { fx, fxAuditEntries } from '../../preview-fixtures/data';
import { previewDelay, usePreviewState } from '../../preview-fixtures/preview-state';

const doneState = (empty = false): AuditState => ({
  status: 'done',
  metaAddress: fx.identity.metaAddress,
  entries: empty ? [] : fxAuditEntries,
  totalYocto: empty ? '0' : fxAuditEntries.reduce((s, e) => s + BigInt(e.amountYocto), 0n).toString(),
});

export function useAudit(): AuditModel {
  const preview = usePreviewState('/app/audit');
  const [keyInput, setKeyInput] = useState(preview === 'idle' ? '' : fx.identity.viewingKey);
  const [state, setState] = useState<AuditState>(() =>
    preview === 'scanning'
      ? { status: 'scanning', scanned: 210, total: 342 }
      : preview === 'done'
        ? doneState()
        : preview === 'empty'
          ? doneState(true)
          : preview === 'error'
            ? { status: 'error', message: 'RPC request failed while reading announcements 200–399.' }
            : { status: 'idle' },
  );
  const trimmed = keyInput.trim();
  const keyError = trimmed && !trimmed.startsWith('perdeview:') ? 'A viewing key starts with “perdeview:”.' : null;

  return {
    keyInput,
    setKeyInput,
    keyError,
    state,
    run() {
      if (!trimmed || keyError) return;
      setState({ status: 'scanning', scanned: 0, total: 342 });
      void previewDelay(1300).then(() => setState(doneState()));
    },
    clear() {
      setKeyInput('');
      setState({ status: 'idle' });
    },
  };
}
