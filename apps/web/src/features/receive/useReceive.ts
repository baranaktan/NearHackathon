/**
 * Receive page data. PREVIEW IMPLEMENTATION — returns fixtures from
 * src/preview-fixtures. Replace the body with @perde/core key management +
 * contract `register`; keep the returned `ReceiveModel` shape.
 */
import { useState } from 'react';
import type { IdentityState, ReceiveModel, RegistrationState } from './types';
import { fx } from '../../preview-fixtures/data';
import { previewDelay, usePreviewState } from '../../preview-fixtures/preview-state';

function initialIdentity(state: string): IdentityState {
  switch (state) {
    case 'loading':
      return { status: 'loading' };
    case 'created':
      return { status: 'created', identity: fx.identity, words: fx.words };
    case 'ready':
      return { status: 'ready', identity: fx.identity };
    case 'registered':
      return { status: 'ready', identity: { ...fx.identity, registeredName: fx.recipientAccount } };
    case 'error':
      return { status: 'error', message: 'Stored keys could not be decrypted in this browser.' };
    default:
      return { status: 'none' };
  }
}

export function useReceive(): ReceiveModel {
  const preview = usePreviewState('/app/receive');
  const [identity, setIdentity] = useState<IdentityState>(() => initialIdentity(preview));
  const [registration, setRegistration] = useState<RegistrationState>(() =>
    preview === 'registered' ? { status: 'done', accountId: fx.recipientAccount, txHash: fx.txHashes[1] } : { status: 'idle' },
  );

  return {
    identity,
    signerAccountId: fx.recipientAccount,
    registration,
    createIdentity() {
      setIdentity({ status: 'created', identity: fx.identity, words: fx.words });
    },
    async restoreIdentity(phrase) {
      const words = phrase.trim().split(/\s+/).filter(Boolean);
      await previewDelay(500);
      if (words.length !== 12) return `Expected 12 words, got ${words.length}.`;
      setIdentity({ status: 'ready', identity: fx.identity });
      return null;
    },
    confirmSaved() {
      if (identity.status === 'created') setIdentity({ status: 'ready', identity: identity.identity });
    },
    async revealPhrase() {
      return fx.words;
    },
    registerName() {
      setRegistration({ status: 'pending' });
      void previewDelay(1400).then(() => {
        setRegistration({ status: 'done', accountId: fx.recipientAccount, txHash: fx.txHashes[1] });
        setIdentity((s) => (s.status === 'ready' ? { ...s, identity: { ...s.identity, registeredName: fx.recipientAccount } } : s));
      });
    },
    forgetIdentity() {
      setIdentity({ status: 'none' });
      setRegistration({ status: 'idle' });
    },
  };
}
