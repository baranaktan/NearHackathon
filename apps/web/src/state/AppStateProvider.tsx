import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { pollUntil } from '@perde/core';
import { deriveIdentity, fetchSpendable, signerFor } from '../lib/perde';
import { errorText } from '../lib/errors';
import { AppStateContext, type AppStateValue, type BalanceState } from './context';
import { reducer } from './reducer';
import { STORAGE_KEY } from './schema';
import { loadState, parseStored, saveState, serialize } from './storage';

const BALANCE_POLL_MS = 30_000;

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadState());
  const lastWritten = useRef<string>(serialize(state));
  const [persisted, setPersisted] = useState(true);

  // Persist every change. A write that only echoes what another tab stored is skipped.
  useEffect(() => {
    const text = serialize(state);
    if (text === lastWritten.current) return;
    lastWritten.current = text;
    setPersisted(saveState(state));
  }, [state]);

  // Cross-tab: another tab changed (or cleared) our key → adopt its state.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY && e.key !== null) return;
      const next = parseStored(e.key === null ? null : e.newValue);
      lastWritten.current = e.newValue ?? serialize(next);
      dispatch({ type: 'hydrate', state: next });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const mnemonic = state.identity?.mnemonic ?? null;
  const { identity, identityError } = useMemo(() => {
    if (!mnemonic) return { identity: null, identityError: null };
    try {
      return { identity: deriveIdentity(mnemonic), identityError: null };
    } catch (e) {
      return { identity: null, identityError: errorText(e) };
    }
  }, [mnemonic]);

  const wallet = state.wallet;
  const signer = useMemo(() => {
    if (!wallet) return null;
    try {
      return signerFor(wallet.secretKey);
    } catch {
      return null;
    }
  }, [wallet]);

  const [balance, setBalance] = useState<BalanceState>({ status: 'none' });
  const accountId = wallet?.accountId ?? null;
  const requestId = useRef(0);

  const load = useCallback(
    async (quiet: boolean) => {
      if (!accountId) {
        setBalance({ status: 'none' });
        return;
      }
      const id = ++requestId.current;
      if (!quiet) setBalance((b) => (b.status === 'ready' ? b : { status: 'loading' }));
      try {
        const r = await fetchSpendable(accountId);
        if (id !== requestId.current) return;
        setBalance(
          r
            ? { status: 'ready', totalYocto: r.totalYocto.toString(), spendableYocto: r.spendableYocto.toString(), updatedAtMs: Date.now() }
            : { status: 'missing' },
        );
      } catch (e) {
        if (id !== requestId.current) return;
        // Keep showing the last good balance on a transient failure during polling.
        setBalance((b) => (quiet && b.status === 'ready' ? b : { status: 'error', message: errorText(e) }));
      }
    },
    [accountId],
  );

  useEffect(() => {
    void load(false);
    if (!accountId) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, BALANCE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [accountId, load]);

  const balanceRef = useRef(balance);
  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  const refreshBalance = useCallback(() => {
    if (!accountId) return;
    // After a write the serving RPC node may lag a block: poll (bounded) until the
    // balance moves, then read once more for gas refunds that land a block later.
    const before = balanceRef.current.status === 'ready' ? balanceRef.current.totalYocto : null;
    void pollUntil(
      () => fetchSpendable(accountId),
      (r) => r !== null && r.totalYocto.toString() !== before,
      { timeoutMs: 12_000, intervalMs: 1000, what: 'the new balance' },
    )
      .catch(() => undefined)
      .then(() => load(true))
      .then(() => window.setTimeout(() => void load(true), 3000));
  }, [accountId, load]);

  const value = useMemo<AppStateValue>(
    () => ({ state, dispatch, persisted, identity, identityError, wallet, signer, balance, refreshBalance }),
    [state, persisted, identity, identityError, wallet, signer, balance, refreshBalance],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}
