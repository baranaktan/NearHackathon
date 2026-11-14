import { useState } from 'react';
import { LogOut, RefreshCw } from 'lucide-react';
import { useAppState } from '../../state/context';
import { AddressChip } from '../../ui/AddressChip';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Callout, Skeleton } from '../../ui/Feedback';
import { Dialog } from '../../ui/Dialog';
import { Amount } from '../Amount';
import { formatDateTime } from '../../lib/format-date';

/** The connected demo wallet: id, live balance, refresh, forget. */
export function WalletCard({ allowForget = true }: { allowForget?: boolean }) {
  const { wallet, balance, refreshBalance, dispatch } = useAppState();
  const [forgetOpen, setForgetOpen] = useState(false);
  if (!wallet) return null;
  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-surface-2/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge tone="success" dot>
            Ready
          </Badge>
          <span className="text-[12.5px] text-fg-faint">{wallet.source === 'faucet' ? 'Created by the testnet faucet' : 'Imported account'}</span>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" icon={<RefreshCw aria-hidden className="size-4" />} onClick={refreshBalance}>
            Refresh
          </Button>
          {allowForget && (
            <Button variant="ghost" size="sm" icon={<LogOut aria-hidden className="size-4" />} onClick={() => setForgetOpen(true)}>
              Forget
            </Button>
          )}
        </div>
      </div>
      <AddressChip value={wallet.accountId} explorer label="Demo wallet" className="self-start" />
      <div className="min-h-9">
        {balance.status === 'ready' && (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Amount yocto={balance.spendableYocto} size="lg" />
            <span className="text-[12.5px] text-fg-faint">available · updated {formatDateTime(balance.updatedAtMs)}</span>
          </div>
        )}
        {balance.status === 'loading' && <Skeleton className="h-7 w-36" />}
        {balance.status === 'missing' && (
          <Callout tone="danger" role="alert">
            This account doesn’t exist on testnet any more. Forget it and create or import another one.
          </Callout>
        )}
        {balance.status === 'error' && (
          <Callout tone="warn" role="alert" action={<Button size="sm" variant="secondary" onClick={refreshBalance}>Retry</Button>}>
            {balance.message}
          </Callout>
        )}
      </div>
      <Dialog
        open={forgetOpen}
        onClose={() => setForgetOpen(false)}
        title="Forget this wallet?"
        description="Its secret key is removed from this browser. The account and its testnet NEAR stay on-chain."
        footer={
          <>
            <Button variant="ghost" onClick={() => setForgetOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setForgetOpen(false);
                dispatch({ type: 'wallet/clear' });
              }}
            >
              Forget wallet
            </Button>
          </>
        }
      >
        <Callout tone="warn">
          {wallet.source === 'faucet'
            ? 'This key was generated here and exists nowhere else. Without it, the account’s remaining test NEAR is unreachable.'
            : 'Keep your own copy of the key if you want to use this account again.'}
        </Callout>
      </Dialog>
    </div>
  );
}
