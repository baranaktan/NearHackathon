# @perde/web

Static SPA for **Perde — private payments on NEAR**. Vite + React 19 + TypeScript (strict), Tailwind CSS v4, `react-router` (HashRouter, so any static host works), `motion`, `lucide-react`, self-hosted fonts. No backend: the browser talks directly to NEAR testnet RPC, the testnet faucet helper and NEAR Intents 1Click (all CORS-enabled). Every key is generated and used in the browser.

```bash
# from the repo root (installs and builds packages/core, then this app)
npm run setup
npm run dev          # local dev server
npm run build        # core + web

# inside apps/web
npm run lint         # ESLint (typescript-eslint strict + react-hooks), zero warnings
npm run typecheck    # tsc -b (also type-checks the core sources it imports)
npm test             # Vitest + Testing Library (jsdom), offline
npm run build        # dist/ (relative base, deployable anywhere)
npm run screenshots  # build, serve, capture every route × viewport × theme (fresh state) into screenshots/
node scripts/e2e-smoke.mjs   # real testnet end-to-end run in Chromium (see below)
node scripts/render-og.mjs   # regenerate public/og.svg + public/og.png
```

`npx playwright install chromium` is needed once for the screenshot, e2e and OG scripts. `screenshots/` is git-ignored.

## How core is consumed

`@perde/core` is imported from source: a Vite alias and a TS `paths` entry point at `../../packages/core/src/index.ts`. Its own dependencies (`@noble/*`, `@scure/*`) resolve from `packages/core/node_modules`, which `npm run setup` installs. Core has no Node built-ins, so it bundles as-is (the `crypto` chunk is noble/scure).

## Layout

```
src/
  config.ts         network, contract id, DAO id, RPC list (failover order), explorer links
  lib/perde.ts      the shared PerdeClient / SputnikDao / 1Click client, retrying fetch, key derivation cache, gas bounds
  lib/errors.ts     describeError(): any core/RPC/faucet/1Click error → one human sentence (+ retryable flag)
  state/            persisted app state (see below) + React provider (wallet balance polling, derived identity)
  flows/            plain async functions used by pages and the guided-demo runner: tx (sign → broadcast → confirm),
                    send (single, batch, invoice transfer), scan (announcements, invoices, balances), wallet (faucet / import)
  features/<name>/  types.ts (view model) · use<Name>.ts (hook) · <Name>Page.tsx (UI) · pure logic + tests
  components/       ChainView sheet (real tx + announcement data), Ledger, wallet setup/card/widget, Amount
  app-shell/        AppLayout (sidebar / mobile tab bar), nav, PageHeader, NetworkBadge
  landing/          landing page
  ui/               component kit (see #/kit)
```

Routes (hash-based): `#/` landing · `#/pay?to=…&amount=…&note=…` public pay page (meta-address or 64-hex invoice account; parameters validated strictly, the note is shown as untrusted plain text) · `#/app/start` guided demo · `#/app/receive|send|inbox|invoice|payroll|dao|audit|verify|settings` · `#/app/send?to=…&amount=…` prefill · `#/app/verify?r=<receipt>` verifies on open · `#/kit` component showcase.

## State and storage

Everything lives in **one versioned localStorage key, `perde:state`** (`src/state/schema.ts`): the demo wallet (account id + secret key), the identity (12-word phrase, confirmed flag), invoices (index, amount, note, created), sent history (tx, stealth account, receipt, announcement index), claims, the scan cursor + matched announcements, and guided-demo flags. Loading is defensive (`migrate`): unknown versions or garbage give a fresh state, malformed records are dropped. Another tab's writes are adopted through the `storage` event. Settings → *Reset everything* wipes it.

**Keys are stored unencrypted in this browser — testnet only.** The Settings page says so.

Not persisted: live balances (re-read from chain), quotes, in-flight transaction states.

## Chain access

- RPC: one shared core `NearRpc` (`lib/perde.ts`). Reads go to `near-testnet.drpc.org` first, then `test.rpc.fastnear.com`; `send_tx` and `gas_price` go to FastNEAR first (dRPC answered `gas_price` with HTTP 422 `UNKNOWN_BLOCK` 9 times in 25 — it pins a block its upstream lacks). Measured 2026-11-14 from a browser origin: dRPC took 400 requests at 10 concurrent without a 429 and sends CORS headers on every answer, errors included; FastNEAR rate-limits after a burst of ~200 requests and its 429 carries no CORS header (the browser then logs an error it cannot suppress); dRPC's free tier ends requests after ~2 s with HTTP 408, which a waiting `send_tx` could hit. An endpoint that fails rests for 30 s (calls stick to the one that answered). At most 4 requests are in flight; identical concurrent reads share a request, idempotent reads are reused for a moment, and every transaction clears that cache.
- RPC budget: an Inbox visit costs one `announcement_count`, one `get_announcements` page per 200 new announcements, one `view_account` per unclaimed payment and one per known invoice (+1). The 20-account invoice discovery runs once per identity (or on "Rescan from the first announcement"). Polls back off and pause while the tab is hidden.
- Read-after-write: RPC nodes are load-balanced and can lag a block, so reads that follow a write poll with core's `pollUntil` (announcement after send, balance after a transaction, stealth account before claim, invoice balance after payment).
- If a transaction was broadcast but not confirmed in time, the UI shows its hash and asks to check the explorer before retrying.

## Pay onward (Inbox)

Each unclaimed payment has **Pay someone from here** next to **Claim to…**: the stealth account itself signs a `perde-pay.testnet.send` call with its derived scalar (`ScalarSigner`), so funds go stealth → fresh stealth with a new announcement and no named account appears. The dialog resolves a meta-address or registered name, caps the amount at balance − announcement fee − one `send`'s gas reserve (20 Tgas at max(gas price, min purchase price) = 0.02 NEAR) − 0.001 NEAR headroom ("Send all" fills that), shows the derived fresh account before signing, then reports exactly what stayed behind from the balances before and after. Measured on testnet (2026-11-14): paying 0.02 onward from 0.05 cost 0.002 announcement fee + 0.0073 network cost (gas, incl. NEAR's account-creation charge); 0.02069 NEAR stayed behind (mostly the refunded gas reserve, below the 0.033 NEAR needed to pay onward again), with a "Sweep the remainder…" claim offered. Rows then read *Partly paid onward* or *Spent onward*; the chain view shows the onward transaction. Math and state transitions: `features/inbox/onward.ts` (+ tests).

## End-to-end run (real testnet)

`scripts/e2e-smoke.mjs` builds, starts `vite preview` on a free port, injects an existing funded testnet account into `perde:state` (no faucet call), and drives: create identity → send 0.05 NEAR to yourself → Inbox finds it → chain view → pay 0.02 NEAR onward from that stealth account to your own meta-address → Inbox finds the new payment → claim both back → create a 0.5 NEAR invoice → pay it from `#/pay` → real 1Click dry quote → Inbox shows the invoice → payroll sample (2 payments, one transaction) → DAO payout (propose + approve) → Inbox finds it → Audit with the viewing key → Verify the receipt deep link → claim the invoice back. It prints every transaction link and the RPC requests per step, fails (non-zero exit) on any console error/warning, page error or horizontal overflow, and saves screenshots (desktop 1440×900 and mobile 390×844, dark, plus light captures) and `e2e-summary.json` into `screenshots/wired/`.

The account comes from `PERDE_FUNDER_JSON` (a JSON file `{accountId, secretKey}`), defaulting to the throwaway key core's testnet tests cache in `packages/core/node_modules/.cache/perde-testnet/funder.json`. The key is never printed.

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
- **Type:** Instrument Serif (display) · Geist Variable (UI) · Geist Mono Variable (addresses, hashes, amounts; tabular numerals via `.num`). Self-hosted via Fontsource with `font-display: swap`.
- **Theme:** dark by default, light via the toggle or `prefers-color-scheme`; an inline script in `index.html` sets `data-theme` before first paint.
- **Motion:** `LazyMotion` loads animation features after first paint; `MotionConfig reducedMotion="user"` plus CSS media queries honour `prefers-reduced-motion`.
- **Accessibility:** native `<dialog>` for Dialog / Sheet (inert background, Esc, focus return), roving-tabindex Tabs, ARIA 1.2 Combobox (with group headings), labelled fields with described-by hints and errors, 44px touch targets, visible brass focus rings, skip links. External links open in a new tab with `rel="noopener noreferrer"`.
