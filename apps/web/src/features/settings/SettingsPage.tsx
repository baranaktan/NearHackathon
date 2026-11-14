import { useState } from 'react';
import { ListChecks, RotateCcw, ShieldAlert } from 'lucide-react';
import { PageHeader } from '../../app-shell/PageHeader';
import { Card, CardHeader, DataRow } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { AddressChip } from '../../ui/AddressChip';
import { Callout, Skeleton } from '../../ui/Feedback';
import { Dialog } from '../../ui/Dialog';
import { Amount } from '../../components/Amount';
import { NetworkBadge } from '../../app-shell/NetworkBadge';
import { WalletCard } from '../../components/wallet/WalletCard';
import { WalletSetup } from '../../components/wallet/WalletSetup';
import { useSettings } from './useSettings';

export default function SettingsPage() {
  const m = useSettings();
  const [resetOpen, setResetOpen] = useState(false);
  const n = m.network;
  return (
    <>
      <PageHeader
        eyebrow="Settings & demo"
        title="Backstage"
        description="One throwaway testnet account pays for everything you try here. Recipients need no account at all — that is the point."
      />

      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Demo wallet"
            description="Signs Send, Payroll, invoice payments and name registration. Testnet NEAR has no value."
          />
          {m.hasWallet ? <WalletCard /> : <WalletSetup />}
        </Card>

        <Callout tone="warn" title="Keys are stored unencrypted in this browser. Testnet only.">
          The demo wallet’s secret key and your 12-word recovery phrase sit in this browser’s localStorage, readable by anything that can run code on this page.
          Fine for a testnet prototype; never put a key that guards real funds here.
          {!m.persisted && <span className="mt-2 block text-danger">This browser is refusing to save data (private mode?): everything will be lost when the tab closes.</span>}
        </Callout>

        <Card>
          <CardHeader title="Network" actions={<NetworkBadge />} className="mb-2" />
          <dl className="divide-y divide-line">
            <DataRow label="Network">
              <span className="font-mono">{n.networkId}</span>
            </DataRow>
            <DataRow label="Perde contract">
              <AddressChip value={n.contractId} explorer size="sm" label="Contract" />
            </DataRow>
            <DataRow label="Contract config">
              {n.contractVersion ? (
                <span className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1">
                  <span className="font-mono">v{n.contractVersion}</span>
                  <span className="text-fg-muted">
                    fee <Amount yocto={n.announceFeeYocto ?? '0'} size="sm" />
                  </span>
                  <span className="text-fg-muted">
                    min <Amount yocto={n.minAmountYocto ?? '0'} size="sm" />
                  </span>
                </span>
              ) : n.configError ? (
                <span className="text-danger">{n.configError}</span>
              ) : (
                <Skeleton className="ml-auto h-4 w-40" />
              )}
            </DataRow>
            <DataRow label="RPC (in failover order)">
              <span className="flex flex-col gap-0.5">
                {n.rpcUrls.map((u) => (
                  <span key={u} className="break-hex font-mono text-[13px]">
                    {u}
                  </span>
                ))}
              </span>
            </DataRow>
            <DataRow label="Explorer">
              <a href={n.explorerUrl} target="_blank" rel="noopener noreferrer" className="break-hex font-mono text-[13px] underline decoration-line-strong underline-offset-4 hover:decoration-brass">
                {n.explorerUrl.replace('https://', '')}
              </a>
            </DataRow>
          </dl>
        </Card>

        {m.demoDismissed && (
          <Card tone="outline">
            <CardHeader
              title="Guided demo checklist"
              description="You hid the checklist. Bring it back to the sidebar."
              actions={
                <Button variant="secondary" size="sm" icon={<ListChecks aria-hidden className="size-4" />} onClick={m.showDemo}>
                  Show again
                </Button>
              }
              className="mb-0"
            />
          </Card>
        )}

        <Card tone="outline">
          <CardHeader
            title="Reset this browser"
            description="Forget your identity, demo wallet, invoices and history stored here. On-chain funds stay where they are."
            actions={
              <Button variant="danger" size="sm" icon={<RotateCcw aria-hidden className="size-4" />} onClick={() => setResetOpen(true)}>
                Reset everything
              </Button>
            }
            className="mb-0"
          />
        </Card>
      </div>

      <Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset this browser?"
        description="This can’t be undone. Without your recovery phrase, unclaimed payments become unreachable, and a faucet wallet’s key exists nowhere else."
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                m.resetAll();
                setResetOpen(false);
              }}
            >
              Reset everything
            </Button>
          </>
        }
      >
        <Callout tone="warn">
          <span className="inline-flex items-start gap-2">
            <ShieldAlert aria-hidden className="mt-1 size-3.5 shrink-0" />
            Write down your recovery phrase on the Receive page first.
          </span>
        </Callout>
      </Dialog>
    </>
  );
}
