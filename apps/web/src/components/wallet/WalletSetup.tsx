import { useState } from 'react';
import { Droplets, KeyRound } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Field, Input } from '../../ui/Field';
import { Callout } from '../../ui/Feedback';
import { useToast } from '../../ui/toast-context';
import { useAppState } from '../../state/context';
import { createFaucetWallet, importWallet } from '../../flows/wallet';
import { describeError, type FriendlyError } from '../../lib/errors';
import { cn } from '../../lib/cn';

/**
 * The two ways to get the one account that pays for everything here:
 * a fresh faucet account, or an existing testnet account + key.
 */
export function WalletSetup({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { dispatch } = useAppState();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [faucetError, setFaucetError] = useState<FriendlyError | null>(null);
  const [accountId, setAccountId] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [importing, setImporting] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: 'accountId' | 'secretKey'; message: string } | null>(null);
  const [importError, setImportError] = useState<FriendlyError | null>(null);

  const create = async () => {
    setCreating(true);
    setFaucetError(null);
    try {
      const wallet = await createFaucetWallet();
      dispatch({ type: 'wallet/set', wallet });
      toast.show({ tone: 'success', title: 'Demo wallet ready', description: `${wallet.accountId} was funded by the testnet faucet.` });
    } catch (e) {
      setFaucetError(describeError(e, 'faucet'));
    } finally {
      setCreating(false);
    }
  };

  const submitImport = async () => {
    setImporting(true);
    setFieldError(null);
    setImportError(null);
    try {
      const r = await importWallet(accountId, secretKey);
      if (!r.ok) {
        setFieldError({ field: r.field, message: r.message });
        return;
      }
      dispatch({ type: 'wallet/set', wallet: r.wallet });
      setSecretKey('');
      toast.show({ tone: 'success', title: 'Wallet connected', description: `${r.wallet.accountId} will sign payments in this browser.` });
    } catch (e) {
      setImportError(describeError(e, 'import'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className={cn('grid gap-4', !compact && 'md:grid-cols-2', className)}>
      <div className="flex min-w-0 flex-col rounded-lg border border-line bg-surface-2/50 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface">
            <Droplets aria-hidden className="size-4 text-accent-text" />
          </span>
          <p className="text-[15px] font-medium text-fg">Create a funded testnet account</p>
        </div>
        <p className="mt-3 flex-1 text-[13.5px] leading-relaxed text-fg-muted">
          The public NEAR faucet creates a new <span className="font-mono text-[12.5px]">perde-….testnet</span> account with 10 test NEAR. Its key is
          generated in this browser.
        </p>
        {faucetError && (
          <Callout tone="danger" role="alert" className="mt-3" title={faucetError.title}>
            {faucetError.message}
          </Callout>
        )}
        <Button className="mt-4 self-start" icon={<Droplets aria-hidden className="size-4" />} onClick={create} loading={creating} loadingLabel="Creating account">
          {faucetError?.retryable ? 'Try again' : 'Create & fund'}
        </Button>
        {creating && (
          <p className="mt-2 text-[12.5px] text-fg-faint" role="status">
            Usually takes about 4 seconds…
          </p>
        )}
      </div>

      <form
        className="flex min-w-0 flex-col gap-3 rounded-lg border border-line p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submitImport();
        }}
      >
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2">
            <KeyRound aria-hidden className="size-4 text-fg-muted" />
          </span>
          <p className="text-[15px] font-medium text-fg">Use an existing testnet account</p>
        </div>
        <Field label="Account id" error={fieldError?.field === 'accountId' ? fieldError.message : undefined}>
          {(p) => (
            <Input
              {...p}
              mono
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="name.testnet"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          )}
        </Field>
        <Field
          label="Full-access secret key"
          hint="Checked on-chain, then stored unencrypted in this browser. Use a throwaway testnet key."
          error={fieldError?.field === 'secretKey' ? fieldError.message : undefined}
        >
          {(p) => (
            <Input
              {...p}
              mono
              type="password"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder="ed25519:…"
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </Field>
        {importError && (
          <Callout tone="danger" role="alert" title={importError.title}>
            {importError.message}
          </Callout>
        )}
        <Button type="submit" variant="secondary" className="self-start" loading={importing} loadingLabel="Checking account" disabled={!accountId.trim() || !secretKey.trim()}>
          Use this account
        </Button>
      </form>
    </div>
  );
}
