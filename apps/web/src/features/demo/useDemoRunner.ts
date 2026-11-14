/**
 * "Run the demo for me": steps 1–4 through the same real flows the pages use
 * (faucet or existing wallet → identity → stealth send to yourself → scan).
 * No shortcuts: every step is a real testnet call.
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { generateMnemonic } from '@perde/core';
import { useAppState } from '../../state/context';
import { deriveIdentity, fetchSpendable, getContractConfig, sendGasReserve, signerFor } from '../../lib/perde';
import { describeError, UserFacingError, type FriendlyError } from '../../lib/errors';
import { formatYocto, parseNearToYocto } from '../../lib/near-format';
import { createFaucetWallet } from '../../flows/wallet';
import { deriveStealth, executeSend } from '../../flows/send';
import { scanAnnouncementsFrom } from '../../flows/scan';
import { txHashOf } from '../../flows/tx';
import { mergeScan, scanStart } from '../../state/scan-cache';
import { DEMO_SEND_AMOUNT } from './steps';

export type RunPhase = 'wallet' | 'identity' | 'send' | 'scan';
export const RUN_PHASES: RunPhase[] = ['wallet', 'identity', 'send', 'scan'];

export interface RunnerState {
  status: 'idle' | 'running' | 'done' | 'error';
  current: RunPhase | null;
  completed: RunPhase[];
  detail: Partial<Record<RunPhase, string>>;
  error: FriendlyError | null;
  errorTxHash: string | null;
  result: { txHash: string; stealthAccount: string; announcementIndex: number | null; found: boolean } | null;
}

const IDLE: RunnerState = { status: 'idle', current: null, completed: [], detail: {}, error: null, errorTxHash: null, result: null };

export function useDemoRunner() {
  const app = useAppState();
  const latest = useRef(app);
  useLayoutEffect(() => {
    latest.current = app;
  });
  const [run, setRun] = useState<RunnerState>(IDLE);
  const busy = useRef(false);

  const start = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const { dispatch } = latest.current;
    let phase: RunPhase = 'wallet';
    const step = (p: RunPhase, detail?: string) => {
      phase = p;
      setRun((r) => ({ ...r, current: p, detail: detail ? { ...r.detail, [p]: detail } : r.detail }));
    };
    const done = (p: RunPhase, detail: string) => setRun((r) => ({ ...r, completed: [...r.completed, p], detail: { ...r.detail, [p]: detail } }));
    setRun({ ...IDLE, status: 'running', current: 'wallet' });
    try {
      // 1. Wallet
      step('wallet', 'Checking for a demo wallet…');
      let wallet = latest.current.state.wallet;
      if (!wallet) {
        step('wallet', 'Asking the public testnet faucet for a 10 NEAR account…');
        wallet = await createFaucetWallet();
        dispatch({ type: 'wallet/set', wallet });
        done('wallet', `Created ${wallet.accountId}`);
      } else {
        done('wallet', `Using ${wallet.accountId}`);
      }

      // 2. Identity
      step('identity', 'Deriving keys…');
      let mnemonic = latest.current.state.identity?.mnemonic ?? null;
      if (!mnemonic) {
        mnemonic = generateMnemonic();
        dispatch({ type: 'identity/set', identity: { mnemonic, confirmed: true, createdAtMs: Date.now() } });
        done('identity', 'New identity created. Its recovery phrase is under Receive → Show recovery phrase.');
      } else {
        if (!latest.current.state.identity?.confirmed) dispatch({ type: 'identity/confirm' });
        done('identity', 'Using the identity already in this browser.');
      }
      const id = deriveIdentity(mnemonic);

      // 3. Send to yourself
      step('send', `Paying ${DEMO_SEND_AMOUNT} NEAR to your own meta-address…`);
      const amount = parseNearToYocto(DEMO_SEND_AMOUNT);
      if (!amount.ok) throw new Error(amount.error);
      const amountYocto = BigInt(amount.yocto);
      const [config, reserve, funds] = await Promise.all([getContractConfig(), sendGasReserve(1), fetchSpendable(wallet.accountId)]);
      const needed = amountYocto + config.announceFee + reserve;
      if (!funds || funds.spendableYocto < needed) {
        throw new UserFacingError(
          `The demo wallet needs ${formatYocto(needed)} NEAR for this step (amount, announcement fee and gas headroom) but has ${formatYocto(funds?.spendableYocto ?? 0n)} NEAR available. Top it up or use another testnet account in Settings.`,
        );
      }
      const stealth = deriveStealth(id.metaAddress);
      const sent = await executeSend({
        signer: signerFor(wallet.secretKey),
        senderId: wallet.accountId,
        metaAddress: id.metaAddress,
        stealth,
        amountYocto,
        announceFeeYocto: config.announceFee,
        onStep: (s) => step('send', s === 'sign' ? 'Signing in your browser…' : s === 'broadcast' ? 'Broadcasting to NEAR testnet…' : 'Reading the announcement back from chain…'),
      });
      dispatch({
        type: 'sent/add',
        records: [
          {
            id: sent.txHash,
            kind: 'send',
            txHash: sent.txHash,
            atMs: Date.now(),
            senderId: wallet.accountId,
            recipientLabel: 'Yourself (guided demo)',
            metaAddress: id.metaAddress,
            stealthAccount: stealth.stealthAccountId,
            amountYocto: amountYocto.toString(),
            feeYocto: config.announceFee.toString(),
            receipt: sent.receipt,
            announcementIndex: sent.announcementIndex,
            memo: '',
            batch: null,
          },
        ],
      });
      latest.current.refreshBalance();
      done('send', sent.announcementIndex !== null ? `Announcement #${sent.announcementIndex} recorded.` : 'Payment confirmed.');

      // 4. Scan
      step('scan', 'Scanning announcements with your view key…');
      const cache = latest.current.state.scan;
      const from = scanStart(cache, id.metaAddress);
      const res = await scanAnnouncementsFrom(id.viewKeys, from, (p) =>
        step('scan', `Scanning announcements: ${p.scanned}${p.total !== null ? ` of ${p.total}` : ''}…`),
      );
      dispatch({ type: 'scan/set', scan: mergeScan(latest.current.state.scan, id.metaAddress, res.matches, res.nextIndex, Date.now()) });
      const found = res.matches.some((a) => a.stealthAccountId === stealth.stealthAccountId);
      done('scan', found ? 'Found it: the payment is in your Inbox.' : `Scanned ${res.scanned} announcements.`);
      setRun((r) => ({
        ...r,
        status: 'done',
        current: null,
        result: { txHash: sent.txHash, stealthAccount: stealth.stealthAccountId, announcementIndex: sent.announcementIndex, found },
      }));
    } catch (e) {
      const ctx = phase === 'wallet' ? 'faucet' : phase === 'send' ? 'send' : phase === 'scan' ? 'scan' : 'generic';
      setRun((r) => ({ ...r, status: 'error', current: phase, error: describeError(e, ctx), errorTxHash: txHashOf(e) }));
    } finally {
      busy.current = false;
    }
  }, []);

  const reset = useCallback(() => setRun(IDLE), []);
  return { run, start, reset };
}
