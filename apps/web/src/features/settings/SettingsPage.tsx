import { useState } from 'react';
import { Droplets, RotateCcw, Send, ArrowDownToLine } from 'lucide-react';
import { PageHeader } from '../../app-shell/PageHeader';
import { Card, CardHeader, DataRow } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { AddressChip } from '../../ui/AddressChip';
import { Callout, Skeleton } from '../../ui/Feedback';
import { Dialog } from '../../ui/Dialog';
import { Amount } from '../../components/Amount';
import { NetworkBadge } from '../../app-shell/NetworkBadge';
import { useSettings } from './useSettings';
import type { DemoAccount } from './types';

const ROLE = {
  sender: { title: 'Sender', icon: Send, body: 'Pays from Send and Payroll.' },
  recipient: { title: 'Recipient', icon: ArrowDownToLine, body: 'Registers your name and receives claims.' },
} as const;

export default function SettingsPage() {
  const m = useSettings();
  const [resetOpen, setResetOpen] = useState(false);
  const n = m.network;
  return (
    <>
      <PageHeader
        eyebrow="Settings & demo"
        title="Backstage"
        description="Throwaway testnet accounts so you can try every flow without a wallet. They live in this browser only."
      />

      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Demo accounts"
            description="Created and funded by the public NEAR testnet faucet. Testnet tokens have no value."
          />
          <div className="grid gap-4 md:grid-cols-2">
            {m.demoAccounts.map((a) => (
              <DemoAccountCard key={a.role} a={a} onFund={() => m.fund(a.role)} />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Network" actions={<NetworkBadge />} className="mb-2" />
          <dl className="divide-y divide-line">
            <DataRow label="Network">
              <span className="font-mono">{n.networkId}</span>
            </DataRow>
            <DataRow label="Perde contract">
              {n.contractId ? <AddressChip value={n.contractId} explorer size="sm" label="Contract" /> : <span className="text-fg-faint">Not deployed</span>}
            </DataRow>
            {n.contractVersion && (
              <DataRow label="Protocol">
                <span className="font-mono">perde v{n.contractVersion}</span>
              </DataRow>
            )}
            <DataRow label="RPC">
              <span className="break-hex font-mono text-[13px]">{n.rpcUrl}</span>
            </DataRow>
            <DataRow label="Explorer">
              <a href={n.explorerUrl} target="_blank" rel="noreferrer" className="break-hex font-mono text-[13px] underline decoration-line-strong underline-offset-4 hover:decoration-brass">
                {n.explorerUrl.replace('https://', '')}
              </a>
            </DataRow>
          </dl>
        </Card>

        <Card tone="outline">
          <CardHeader
            title="Reset this browser"
            description="Forget your identity, demo accounts and invoices stored here. On-chain funds stay where they are."
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
        description="This can’t be undone. Without your recovery phrase, unclaimed payments become unreachable."
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
        <Callout tone="warn">Write down your recovery phrase on the Receive page first.</Callout>
      </Dialog>
    </>
  );
}

function DemoAccountCard({ a, onFund }: { a: DemoAccount; onFund: () => void }) {
  const role = ROLE[a.role];
  const Icon = role.icon;
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-line bg-surface-2/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md border border-line bg-surface">
            <Icon aria-hidden className="size-4 text-fg-muted" />
          </span>
          <div>
            <p className="text-[15px] font-medium text-fg">{role.title}</p>
            <p className="text-[12.5px] text-fg-muted">{role.body}</p>
          </div>
        </div>
        {a.status === 'ready' && <Badge tone="success" dot>Ready</Badge>}
        {a.status === 'funding' && <Badge tone="warn" dot pulse>Funding</Badge>}
        {a.status === 'missing' && <Badge>Not created</Badge>}
        {a.status === 'error' && <Badge tone="danger" dot>Failed</Badge>}
      </div>

      <div className="mt-4 min-h-[60px] space-y-2">
        {a.accountId ? (
          <AddressChip value={a.accountId} size="sm" explorer label={`${role.title} account`} className="w-full" />
        ) : (
          <p className="text-[13px] text-fg-faint">No account yet.</p>
        )}
        {a.status === 'funding' ? (
          <Skeleton className="h-5 w-24" />
        ) : a.balanceYocto ? (
          <Amount yocto={a.balanceYocto} size="sm" className="text-fg-muted" />
        ) : null}
      </div>

      {a.status === 'error' && a.error && (
        <Callout tone="danger" className="mt-3" role="alert">
          {a.error}
        </Callout>
      )}

      <Button
        className="mt-4 self-start"
        variant={a.status === 'ready' ? 'secondary' : 'primary'}
        size="sm"
        icon={<Droplets aria-hidden className="size-4" />}
        loading={a.status === 'funding'}
        loadingLabel="Funding from faucet"
        onClick={onFund}
      >
        {a.status === 'missing' ? 'Create & fund' : a.status === 'error' ? 'Try again' : 'Top up from faucet'}
      </Button>
    </div>
  );
}
