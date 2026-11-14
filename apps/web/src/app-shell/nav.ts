import { ArrowDownToLine, BadgeCheck, FileText, FlaskConical, Inbox, Landmark, ListChecks, ScanEye, Send, Users, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  short?: string;
  icon: LucideIcon;
  description: string;
}

/*
 * Groups render in order in the sidebar and in the mobile "More" sheet; the
 * layouts handle any number of items.
 */
export const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: 'Start',
    items: [{ to: '/app/start', label: 'Guided demo', short: 'Demo', icon: ListChecks, description: 'See it work in a minute' }],
  },
  {
    label: 'Payments',
    items: [
      { to: '/app/receive', label: 'Receive', icon: ArrowDownToLine, description: 'Your private address' },
      { to: '/app/send', label: 'Send', icon: Send, description: 'Pay a meta-address or name' },
      { to: '/app/inbox', label: 'Inbox', icon: Inbox, description: 'Find and claim payments' },
    ],
  },
  {
    label: 'Business',
    items: [
      { to: '/app/invoice', label: 'Invoice', icon: FileText, description: 'One-time address, any chain' },
      { to: '/app/payroll', label: 'Payroll', icon: Users, description: 'Many payments, one transaction' },
      { to: '/app/dao', label: 'DAO payout', short: 'DAO', icon: Landmark, description: 'Treasury pays without naming anyone' },
    ],
  },
  {
    label: 'Verify',
    items: [
      { to: '/app/audit', label: 'Audit', icon: ScanEye, description: 'Read-only with a viewing key' },
      { to: '/app/verify', label: 'Verify receipt', short: 'Verify', icon: BadgeCheck, description: 'Check a payment proof' },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = {
  to: '/app/settings',
  label: 'Settings & demo',
  short: 'Settings',
  icon: FlaskConical,
  description: 'Demo wallet, network, reset',
};

/** Shown in the mobile tab bar; everything else lives under "More". */
export const PRIMARY_MOBILE = ['/app/receive', '/app/send', '/app/inbox'];

export const ALL_ITEMS: NavItem[] = [...NAV_GROUPS.flatMap((g) => g.items), SETTINGS_ITEM];
