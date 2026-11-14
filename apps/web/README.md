# @perde/web

Static SPA for **Perde — private payments on NEAR**. Vite + React 19 + TypeScript (strict), Tailwind CSS v4, `react-router` (HashRouter, so any static host works), `motion`, `lucide-react`, self-hosted fonts. No backend, no runtime requests to third-party CDNs.

```bash
npm install
npm run dev          # local dev server
npm run lint         # ESLint (typescript-eslint strict + react-hooks), zero warnings
npm run typecheck    # tsc -b
npm test             # Vitest + Testing Library (jsdom)
npm run build        # dist/ (relative base, deployable anywhere)
npm run screenshots  # build, serve on a free port, capture every route × viewport × theme into screenshots/
node scripts/render-og.mjs   # regenerate public/og.svg + public/og.png
```

`npx playwright install chromium` is needed once for the screenshot and OG scripts. `screenshots/` is git-ignored; regenerate it when you need it.

## Layout

```
src/
  brand/            Logo (mark / wordmark / lockup), Drape (hero curtain SVG), drape geometry
  styles/index.css  design tokens (CSS variables, dark + light), velvet / grain / dialog styles
  ui/               component kit (see /kit route)
  components/       app-level pieces: Ledger (explorer rows), ChainView sheet, Amount, ThemeToggle
  landing/          landing page (hero + LedgerExhibit + sections)
  app-shell/        AppLayout (sidebar / mobile tab bar), nav, PageHeader, NetworkBadge
  features/<name>/  types.ts (view model) · use<Name>.ts (data hook) · <Name>Page.tsx (pure UI)
  preview-fixtures/ PREVIEW ONLY: sample data, ?state= switcher, "Preview data" banner
  lib/              near-format (bigint-safe amounts, ids), theme, clipboard, dates
```

Routes (hash-based): `#/` landing, `#/app/receive|send|inbox|invoice|payroll|audit|verify|settings`, `#/kit` component showcase. `#/app` redirects to Receive.

## Wiring the real logic (for the next agent)

Pages never compute anything chain-related themselves. Each page calls exactly one hook and renders the returned **view model**. To wire a feature:

1. Rewrite the body of `src/features/<name>/use<Name>.ts` using `@perde/core` / RPC. Keep the return type (`<Name>Model` from `types.ts`). Adding fields is fine; the page uses only what is listed below.
2. Drop its imports from `../../preview-fixtures/*`.
3. When no hook imports from `src/preview-fixtures/` any more, delete that folder and remove `<PreviewBanner />` (and its import) from `src/app-shell/AppLayout.tsx`. `AppLayout` keys the outlet by `pathname + search`; you can key by `pathname` only once fixtures are gone.

All amounts are **yoctoNEAR decimal strings**. Use `parseNearToYocto` / `formatYocto` from `src/lib/near-format.ts` (BigInt, never floats). Explorer URLs come from `src/config.ts` (`explorerTxUrl`, `explorerAccountUrl`).

Preview states: append `?state=<name>` to any app route (e.g. `#/app/inbox?state=empty`); the dashed banner at the top of the app lists them. The first one listed is the default.

| Route | Hook → model | UI states the page renders | Preview `?state=` |
| --- | --- | --- | --- |
| Receive | `useReceive()` → `ReceiveModel` | `identity.status`: `loading` (skeleton) · `none` (create / restore form; restore shows the error string `restoreIdentity` resolves with) · `created` (12 words behind the curtain + "I stored them" checkbox → `confirmSaved`) · `ready` (meta-address + copy + QR, registration card, viewing key behind a curtain, recovery / forget dialogs) · `error` (callout + start over). `registration.status`: `idle` · `pending` (button spinner) · `done` (badge + tx link) · `error` (callout). `signerAccountId: null` shows "No account to sign with". | none, created, ready, registered, loading, error |
| Send | `useSend()` → `SendModel` | `phase`: `edit` (recipient field with `recipient.status` `empty`/`resolving`/`resolved`/`invalid`, amount with `amountError`, Max button from `sender.balanceYocto`, Review disabled until `canReview`) · `review` (quote rows: recipient, fresh stealth account, amount, fee, total) · `submitting` (timeline driven by `step`: `sign` → `broadcast` → `confirm`) · `success` (tx link, copyable receipt, Chain view) · `error` (callout, back / retry). `sender: null` shows "Set up demo accounts". | edit, review, submitting, success, error, no-sender |
| Inbox | `useInbox()` → `InboxModel` | `hasIdentity: false` → empty state linking to Receive. `scan.status`: `scanning` (progress bar, skeleton rows, `total` may be null) · `done` (count + time) · `error` (callout + retry). Per payment `claim.status`: `unclaimed` (Claim to… → dialog with destination field, `destinationSuggestions`, `claimFeeYocto`, warning when claiming to a named account) · `claiming` · `claimed` (badge + tx link) · `error` (message + retry). Empty list after `done` → empty state. Chain view sheet uses the first claimed (else first) payment. | found, scanning, empty, error, no-identity |
| Invoice | `useInvoice()` → `InvoiceModel` | `hasIdentity: false` → empty state. Create form (`creating` spinner). Invoice list (`select`). `current`: QR of `payLink`, one-time account, status `open`/`paid`. Any-chain panel: asset combobox (`assets`, `selectedAssetId`), `quote.status` `idle` · `loading` · `ready` (`amountInFormatted` → `amountOutFormatted`, ETA, quotedAt; always badged "Preview — dry quote") · `error`. | open, paid, quote-loading, quote-error, empty, no-identity |
| Payroll | `usePayroll()` → `PayrollModel` | CSV textarea + file upload (`loadFile`). Rows come from `parsePayrollCsv` in `features/payroll/csv.ts` (pure, tested, keep it). `phase`: `input` (row list with per-row errors; Review blocked while `invalidCount > 0`) · `review` (totals, fees) · `submitting` · `done` (`results` per row: stealth account / failure, one tx link) · `error`. | input, review, submitting, done, error, empty |
| Audit | `useAudit()` → `AuditModel` | Viewing-key field with `keyError`. `state.status`: `idle` · `scanning` (progress text + skeleton) · `done` (meta-address, total, table of entries with Held / Moved out; empty list → empty state) · `error`. | idle, scanning, done, empty, error |
| Verify receipt | `useVerify()` → `VerifyModel` | Receipt field. `state.status`: `idle` · `verifying` (skeleton) · `verified` (summary + every check with its mono `detail`) · `failed` (`reason`, checks with pass/fail/skipped) · `invalid` (field error). | idle, verifying, verified, failed, invalid |
| Settings & demo | `useSettings()` → `SettingsModel` | Per demo account `status`: `missing` (Create & fund) · `funding` (spinner, balance skeleton) · `ready` (account chip, balance, top up) · `error` (callout + retry). Network table from `network` (`contractId: null` → "Not deployed"). Reset dialog → `resetAll`. | ready, missing, funding, error |

Interfaces live in `src/features/*/types.ts`; read them for field-level docs.

## Design system

- **Concept:** the curtain. Private things sit behind velvet folds; the reveal motion is two panels gathering to the sides (`ui/CurtainReveal`). Fresh stealth accounts carry a small velvet tab (`VeilMark`) everywhere they appear.
- **Palette** (tokens in `styles/index.css`, exposed to Tailwind as `bg-bg`, `text-fg-muted`, `text-accent-text`, …):

  | Token | Dark | Light |
  | --- | --- | --- |
  | `bg` | `#0e0b0a` | `#f4eee3` |
  | `surface` / `surface-2` | `#161210` / `#1e1916` | `#fbf8f2` / `#efe7da` |
  | `fg` / `fg-muted` / `fg-faint` | `#f3ede2` / `#bdb2a3` / `#958a7b` | `#1b1512` / `#51463e` / `#6a5e53` |
  | `accent` (fills) | `#b3122d` | `#a50d28` |
  | `accent-text` (crimson text) | `#ef5a6c` | `#a50d28` |
  | `brass` (hairlines, focus ring) | `#c4a46a` | `#8a6a33` |
  | `success` / `warn` / `danger` | `#8cc59f` / `#e2b04a` / `#f2785c` | `#2d6a45` / `#855700` / `#a5331a` |

  Text tokens meet WCAG AA on `bg`, `surface` and `surface-2` in both themes.
- **Type:** Instrument Serif (display, incl. italic) · Geist Variable (UI) · Geist Mono Variable (addresses, hashes, amounts; tabular numerals via `.num`). Self-hosted via Fontsource, `font-display: swap`; the two above-the-fold faces are preloaded by a small Vite plugin in `vite.config.ts`.
- **Theme:** dark by default, light via the toggle or `prefers-color-scheme`; an inline script in `index.html` sets `data-theme` before first paint.
- **Motion:** `LazyMotion` loads animation features after first paint; `MotionConfig reducedMotion="user"` plus CSS media queries honour `prefers-reduced-motion`.
- **Accessibility:** native `<dialog>` for Dialog / Sheet (inert background, Esc, focus return), roving-tabindex Tabs, ARIA 1.2 Combobox, labelled fields with described-by hints and errors, 44px touch targets, visible brass focus rings, skip links.
