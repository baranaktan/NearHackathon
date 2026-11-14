/**
 * Inbox data. PREVIEW IMPLEMENTATION — fixtures only. Replace with: page
 * through `get_announcements`, test each with the view key, check invoice
 * accounts (gap limit 20), and sweep with the scalar-key signer; keep `InboxModel`.
 */
import { useState } from 'react';
import type { FoundPayment, InboxModel, ScanState } from './types';
import { fx, fxPayments } from '../../preview-fixtures/data';
import { previewDelay, usePreviewState } from '../../preview-fixtures/preview-state';

function initialScan(state: string): ScanState {
  switch (state) {
    case 'scanning':
      return { status: 'scanning', scanned: 120, total: 342 };
    case 'error':
      return { status: 'error', message: 'RPC request failed: rpc.testnet.near.org did not respond in time.' };
    case 'no-identity':
      return { status: 'idle' };
    default:
      return { status: 'done', scanned: 342, finishedAtMs: Date.UTC(2026, 10, 14, 9, 30) };
  }
}

export function useInbox(): InboxModel {
  const preview = usePreviewState('/app/inbox');
  const [scan, setScan] = useState<ScanState>(() => initialScan(preview));
  const [payments, setPayments] = useState<FoundPayment[]>(() =>
    preview === 'found' ? fxPayments : preview === 'scanning' ? fxPayments.slice(0, 1) : [],
  );

  const unclaimed = payments
    .filter((p) => p.claim.status !== 'claimed')
    .reduce((sum, p) => sum + BigInt(p.balanceYocto), 0n)
    .toString();

  return {
    hasIdentity: preview !== 'no-identity',
    scan,
    payments,
    unclaimedYocto: unclaimed,
    destinationSuggestions: [fx.recipientAccount],
    claimFeeYocto: fx.NEAR('0.0005'),
    rescan() {
      setScan({ status: 'scanning', scanned: 0, total: 342 });
      void previewDelay(1200).then(() => setScan({ status: 'done', scanned: 342, finishedAtMs: Date.now() }));
    },
    claim(id, destination) {
      const update = (fn: (p: FoundPayment) => FoundPayment) => setPayments((ps) => ps.map((p) => (p.id === id ? fn(p) : p)));
      update((p) => ({ ...p, claim: { status: 'claiming', destination } }));
      void previewDelay(1600).then(() =>
        update((p) => ({
          ...p,
          balanceYocto: '0',
          claim: {
            status: 'claimed',
            destination,
            txHash: fx.txHashes[3],
            claimedYocto: (BigInt(p.balanceYocto) - BigInt(fx.NEAR('0.0005'))).toString(),
          },
        })),
      );
    },
  };
}
