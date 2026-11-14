/**
 * Receive: identity lifecycle (create / restore / confirm / forget) and the
 * optional name registration on the Perde contract, read back from chain.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { generateMnemonic, normalizeMnemonic, validateMnemonic } from '@perde/core';
import { useAppState } from '../../state/context';
import { perde, REGISTER_DEPOSIT } from '../../lib/perde';
import { errorText } from '../../lib/errors';
import { useToast } from '../../ui/toast-context';
import { buildPayLink } from '../pay/params';
import type { Identity, IdentityState, ReceiveModel, RegistrationState } from './types';

export function useReceive(): ReceiveModel {
  const { state, dispatch, identity: derived, identityError, wallet, signer, refreshBalance } = useAppState();
  const toast = useToast();
  const record = state.identity;
  const accountId = wallet?.accountId ?? null;
  const metaAddress = derived?.metaAddress ?? null;

  const [reg, setReg] = useState<RegistrationState>({ status: 'checking' });
  const [lastTx, setLastTx] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (!accountId) return;
    setReg({ status: 'checking' });
    try {
      const onChain = await perde.getMetaAddress(accountId);
      if (onChain === null) setReg({ status: 'unregistered' });
      else if (onChain === metaAddress) setReg({ status: 'registered', accountId, txHash: null });
      else setReg({ status: 'other', accountId, metaAddress: onChain });
    } catch (e) {
      setReg({ status: 'error', message: errorText(e, 'register'), retry: 'check' });
    }
  }, [accountId, metaAddress]);

  useEffect(() => {
    if (!accountId || !metaAddress) return;
    let live = true;
    perde
      .getMetaAddress(accountId)
      .then((onChain) => {
        if (!live) return;
        if (onChain === null) setReg({ status: 'unregistered' });
        else if (onChain === metaAddress) setReg({ status: 'registered', accountId, txHash: null });
        else setReg({ status: 'other', accountId, metaAddress: onChain });
      })
      .catch((e: unknown) => {
        if (live) setReg({ status: 'error', message: errorText(e, 'register'), retry: 'check' });
      });
    return () => {
      live = false;
    };
  }, [accountId, metaAddress]);

  const register = useCallback(async () => {
    if (!signer || !accountId || !metaAddress) return;
    setReg({ status: 'pending', action: 'register' });
    try {
      const outcome = await perde.register(signer, accountId, metaAddress, REGISTER_DEPOSIT);
      setLastTx(outcome.hash);
      setReg({ status: 'registered', accountId, txHash: outcome.hash });
      refreshBalance();
      toast.show({ tone: 'success', title: 'Name registered', description: `People can now pay ${accountId}; each payment still lands in a fresh account.` });
    } catch (e) {
      setReg({ status: 'error', message: errorText(e, 'register'), retry: 'register' });
    }
  }, [signer, accountId, metaAddress, refreshBalance, toast]);

  const unregister = useCallback(async () => {
    if (!signer || !accountId) return;
    setReg({ status: 'pending', action: 'unregister' });
    try {
      const outcome = await perde.unregister(signer, accountId);
      setLastTx(outcome.hash);
      setReg({ status: 'unregistered' });
      refreshBalance();
      toast.show({ tone: 'success', title: 'Name unregistered', description: 'The storage deposit was refunded to the demo wallet.' });
    } catch (e) {
      setReg({ status: 'error', message: errorText(e, 'register'), retry: 'unregister' });
    }
  }, [signer, accountId, refreshBalance, toast]);

  const registration: RegistrationState = useMemo(
    () => (!accountId ? { status: 'no-wallet' } : reg.status === 'registered' && lastTx && !reg.txHash ? { ...reg, txHash: lastTx } : reg),
    [accountId, reg, lastTx],
  );

  const identity: IdentityState = useMemo(() => {
    if (identityError) return { status: 'error', message: `The recovery phrase stored in this browser can’t be used: ${identityError}` };
    if (!record) return { status: 'none' };
    if (!derived) return { status: 'loading' };
    const id: Identity = {
      metaAddress: derived.metaAddress,
      viewingKey: derived.viewingKey,
      registeredName: registration.status === 'registered' ? registration.accountId : null,
    };
    return record.confirmed ? { status: 'ready', identity: id } : { status: 'created', identity: id, words: record.mnemonic.split(' ') };
  }, [identityError, record, derived, registration]);

  const payLink = useMemo(() => (metaAddress ? buildPayLink(metaAddress) : null), [metaAddress]);

  return {
    identity,
    signerAccountId: accountId,
    registration,
    registerDepositYocto: REGISTER_DEPOSIT.toString(),
    payLink,
    createIdentity() {
      dispatch({ type: 'identity/set', identity: { mnemonic: generateMnemonic(), confirmed: false, createdAtMs: Date.now() } });
    },
    async restoreIdentity(phrase) {
      const words = phrase.trim().split(/\s+/).filter(Boolean);
      if (words.length !== 12) return `Expected 12 words, got ${words.length}.`;
      const normal = normalizeMnemonic(phrase);
      if (!validateMnemonic(normal)) return 'These words don’t form a valid recovery phrase (a word is misspelled or out of order).';
      dispatch({ type: 'identity/set', identity: { mnemonic: normal, confirmed: true, createdAtMs: Date.now() } });
      toast.show({ tone: 'success', title: 'Identity restored', description: 'Open the Inbox to scan for payments.' });
      return null;
    },
    confirmSaved() {
      dispatch({ type: 'identity/confirm' });
    },
    async revealPhrase() {
      return record ? record.mnemonic.split(' ') : [];
    },
    registerName() {
      void register();
    },
    unregisterName() {
      void unregister();
    },
    retryRegistration() {
      if (reg.status !== 'error') return;
      if (reg.retry === 'register') void register();
      else if (reg.retry === 'unregister') void unregister();
      else void check();
    },
    forgetIdentity() {
      dispatch({ type: 'identity/clear' });
    },
  };
}
