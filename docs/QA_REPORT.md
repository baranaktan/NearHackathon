# QA report — Perde web app

Independent QA pass on 2026-11-14 (Windows 11, Node 24.11, Playwright 1.65.1, axe-core 4.14 via `@axe-core/playwright` 4.14, Lighthouse 13.6). Everything below was measured on this machine; numbers are copied from the run outputs.

## How to run

```bash
npm run setup                 # once: core + web dependencies (existing script)
npm run setup:e2e             # once: e2e dependencies + Chromium, Firefox, WebKit for Playwright
npm run test:e2e              # offline UI suite: 5 projects, no secrets, no funds, no network needed
npm run test:e2e:testnet      # live suite on NEAR testnet (needs a funded throwaway account, see below)
npm run lighthouse            # Lighthouse for / and #/app/start, mobile + desktop → docs/qa/lighthouse/
npm run audit:secrets         # secret scan: working tree + full git history + built bundles
```

- Both suites build `apps/web` into their own folder (`e2e/.app-dist`, `e2e/.app-dist-testnet`) and serve it with `vite preview` (port `PERDE_E2E_PORT`, default 4317; testnet 4327). `apps/web/dist` is never touched by the tests.
- Reports: `e2e/playwright-report/{offline,testnet}/` (HTML), `e2e/test-results/*-results.json` (JSON), traces/screenshots on failure, axe findings per scan in `e2e/test-results/axe/`. All git-ignored. `node e2e/scripts/summarize.mjs` prints the tables below from the JSON report.
- Live suite account: `PERDE_FUNDER_JSON` (a `{accountId, secretKey}` file), default `packages/core/node_modules/.cache/perde-testnet/funder.json`. Without it every live test skips itself with that message. The faucet is never called; 1Click quotes are `dry: true`.
- Fixtures: `e2e/fixtures/recorded/*.json` are **recorded** answers of the real testnet RPC and 1Click APIs (`npm --prefix e2e run record-fixtures`, read-only, public mnemonic, no keys). Large blocks / protocol config are trimmed to the fields core reads. Tests that need more data (600-announcement scan, a verifiable receipt) build **synthetic** announcements with `@perde/core`'s real stealth derivation; they are labelled SYNTHETIC in the test names. The faucet 429 answer is simulated with the rate-limit headers documented in `packages/core/src/faucet.ts`.

## What is tested

**Offline suite** (`e2e/tests/*.spec.ts`, 63 tests × projects). Every test runs through a shared fixture (`e2e/support/test.ts`) that fails it on any console error or warning, page error, request to an origin outside the allow-list, chain request without a recorded fixture, or horizontal overflow of the final page. Failure-path tests allow only the browser's own message for the request they deliberately break (scoped per test, documented in the spec).

| Area | Tests |
| --- | --- |
| Landing, navigation | hero/CTA/one h1, illustration toggle (click + arrow keys, roving tabindex), "Open app", every nav item (sidebar on desktop; tab bar + More sheet on phones), `/app` redirect, skip link, 404 top-level and in-app |
| Theme | toggle, `theme-color` meta, persistence across reload, `prefers-color-scheme` default |
| Empty states | every route with a fresh browser (no wallet, no identity); with identity + read-only wallet: balance, contract minimum/fee, inbox scan of recorded announcements, audit with own viewing key |
| Identity | create → reveal → confirm → meta-address + QR + pay link, persists on reload, phrase dialog matches; restore of the known mnemonic → deterministic `KNOWN_META` (cross-checked against `@perde/core`); bad word count / checksum errors; forget (dialog focus containment, Esc, confirm); viewing key hidden → revealed → copied (clipboard read verified in Chromium) → hidden |
| Invoice + `#/pay` | deterministic one-time accounts #0/#1, pay link params, QR, note, link opens the pay page; amount/note validation; 14 hostile/invalid `#/pay` links (duplicate params, `javascript:`, uppercase hex, bad meta checksum, negative, scientific, comma, 25 decimals, zero, 10^40, 141-char note…); XSS note rendered inert (no `<img>`/`<script>`, bidi + zero-width stripped); meta-address link locks the recipient; recorded dry quote |
| Failure paths | all RPC endpoints aborted → "NEAR testnet didn’t respond" + retry works (Send limits, Inbox scan); malformed RPC JSON and HTTP 500 → same friendly path; slow network (1.2 s per RPC answer) → progress visible; double-click on Pay → exactly one signed transaction, then a lost broadcast → "check this transaction first" with the hash; offline at submit → clear error, nothing broadcast; 1Click 500 → error + retry; 1Click timeout → "didn’t respond" after the 20 s client timeout; token list down → retry; faucet 429 → explains the limit and points to "use an existing account" (not retried) |
| Edge cases | amount field (whitespace, `-1`, `1e3`, `1,000.5`, `12,5`, 30 decimals, 0, below minimum, above balance, Max); recipient (bad checksum, viewing key, implicit, `.near`, Cyrillic homoglyph, UPPERCASE name, unregistered name, own address); corrupted JSON and other-version state (backup kept); malformed records dropped; two tabs; reset everything; reload mid-scan; payroll CSV (BOM, `;`, quoted fields, bad rows per line, 50-row limit, file upload); receipts (invalid, SYNTHETIC valid deep link, tampered `stealth`/`r` fail); 600-announcement scan |
| Resilience | quote token/chain label wraps only between words (invoice + pay page); guided-demo chunk loads on CTA intent, no skeleton on click; a lazy page chunk that fails to download → "This page couldn’t load" + Reload (shell stays) |
| Accessibility | axe (WCAG 2.0/2.1/2.2 A+AA + best practices) on every route × dark/light × desktop (Chromium 1440×900) and phone (Pixel 7), fresh and with data, plus open dialogs/sheets (recovery phrase, forget identity, chain view, More), form errors, send review, payroll rows, landing both tabs, 404, all pay-page variants; keyboard-only walkthrough (restore → dialog via Enter/Esc with focus return → invoice via Enter) with a visible focus indicator at every Tab stop |

**Live suite** (`e2e/tests/testnet/`, real NEAR testnet, serial): desktop Chromium runs the whole money path in one test — fresh identity → send 0.05 to own meta-address → Inbox finds it → chain view → pay 0.02 onward from the stealth account → register the wallet name → pay by (UPPERCASE) name → invoice 0.1 → pay it from `#/pay` → real dry 1Click quote (number > 0) → Inbox shows the invoice → payroll sample (2 payments, one tx) → DAO propose → approve → Inbox finds the payout → audit with the viewing key → receipt deep link verifies → tampered receipt fails → claim everything back → unregister (refund). A Pixel 7 project runs send → inbox (via tab bar) → claim. Same zero-console-error / no-overflow fixture. If a step fails, an `afterEach` sweeps the run's stealth accounts back to the funder.

## Results

### Offline suite (`npm run test:e2e`, final run, 270 s)

| Project | Passed | Failed | Flaky | Skipped |
| --- | ---: | ---: | ---: | ---: |
| chromium (Desktop Chrome 1440×900) | 79 | 0 | 0 | 0 |
| firefox (Desktop Firefox 1440×900) | 73 | 0 | 0 | 0 |
| webkit (Desktop Safari 1440×900) | 73 | 0 | 0 | 0 |
| mobile-pixel (Pixel 7, Chromium) | 79 | 0 | 0 | 0 |
| mobile-iphone (iPhone 14, WebKit) | 73 | 0 | 0 | 0 |
| **Total** | **377** | **0** | **0** | **0** |

The 6 axe tests run in `chromium` and `mobile-pixel` only (`grepInvert: /@axe/` on the other projects: axe results do not depend on the engine). All three engines installed and launched on this Windows machine. Retries are 0.

### Live testnet suite (`npm run test:e2e:testnet`)

| Project | Test | Result | Time | Funder balance (spendable) |
| --- | --- | --- | --- | --- |
| testnet-chromium (1440×900) | full money path (12 steps, ≈20 transactions) | passed | 1.6 min | 4.6148 → 4.5704 NEAR (−0.0444) |
| testnet-mobile (Pixel 7) | send → inbox → claim | passed | 14 s | 4.5706 → 4.5610 NEAR (−0.0096) |

Final run: `2 passed (1.9m)`, zero console errors/warnings, no overflow, all transactions on testnet (links in the HTML report traces). Earlier runs of this session: one money-path pass (−0.0426 NEAR) and one failure on a test selector (fixed; see notes). Funder balance left: **4.561 NEAR** (account `perde-7b5b3e7865e9.testnet`).

### Accessibility (axe)

| | serious/critical | moderate | minor |
| --- | ---: | ---: | ---: |
| First run (partial*) | 1 rule: `label-content-name-mismatch` (compact wallet link, 4 scans) | `region` 60, `heading-order` 8, `landmark-one-main` 4, `page-has-heading-one` 4 | 0 |
| Final run (130 scans) | **0** | **0** | **0** |

\*The first run stopped two scenario tests early on a test-selector bug, so it covered fewer states than the final run. Fixes: accessible name of the compact wallet link now contains its visible text; 404 page has a `<main>` and an `<h1>`; empty-state titles are `<h2>` (they follow the page `<h1>`); the skip links sit inside a `nav` landmark.

### Lighthouse (`docs/qa/lighthouse/`, median of 3 runs, Playwright Chromium, preview build)

| Page / preset | Perf before → after | A11y | Best practices | SEO before → after |
| --- | --- | --- | --- | --- |
| `/` mobile | 100 → 96 (runs 100/96/87) | 100 → 100 | 100 → 100 | 91 → **100** |
| `/` desktop | 100 → 100 | 100 → 100 | 100 → 100 | 91 → **100** |
| `#/app/start` mobile | 92 → 90 (runs 91/90/90) | 100 → 100 | 100 → 100 | 91 → **100** |
| `#/app/start` desktop | 100 → 100 | 100 → 100 | 100 → 100 | 91 → **100** |

All targets met (Perf ≥ 90 desktop / ≥ 80 mobile, A11y ≥ 95, BP ≥ 95, SEO ≥ 90). The mobile performance spread is machine noise: re-running the **unchanged baseline build** right after gave `/` mobile 100/98/84 (TBT up to 670 ms) — see `summary-before-rerun.json`. Fixed: `robots.txt` (the SPA fallback served HTML for it → SEO 91), `label-content-name-mismatch` (app-start), WebKit double font download (below). Not changed: unused JS 79–88 KiB (react-dom + motion features on first load), render-blocking CSS (~150 ms estimated), `td-has-header` on the landing illustration table (A11y still 100), `#/app/start` mobile LCP 3.3 s (simulated slow 4G; lazy route). Files: `summary-before.json`, `summary-before-rerun.json`, `summary-after.json`, `landing-mobile-after.html`.

### npm audit (2026-11-14)

| Directory | critical | high | moderate | low | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| `/` (root) | – | – | – | – | no dependencies / lockfile |
| `packages/core` | 0 | 0 | 7 | 0 | all `typescript-eslint` → `minimatch` 7–11 (ReDoS, GHSA-g3hv-75wg-m249), **dev-only**; `--omit=dev`: 0. Fix = `npm audit fix --force` → downgrade to typescript-eslint 8.36 (breaking); not applied |
| `apps/web` | 0 | 0 | 7 | 0 | same chain, dev-only; production deps: 0 |
| `scripts/contract` | 0 | 0 | 0 | 0 | |
| `scripts/video` | 0 | 0 | 0 | 0 | (other agent's package, audited read-only) |
| `e2e` | 0 | 0 | 0 | 0 | |
| `.tools/cargo-near-npm` | 0 | 4 | 3 | 0 | git-ignored local copy of the cargo-near npm installer (axios, follow-redirects, form-data, glob, minimatch, rimraf); not part of the repo or the app; not modified |

`cargo audit` (already installed on this machine) on `contracts/perde/Cargo.lock`: 1 vulnerability — `crypto-bigint 0.5.5` RUSTSEC-2026-0387 (timing variability), reached only through `near-sdk` → `near-vm-runner` → `p256` (the unit-test VM), not compiled into the wasm contract; fix needs an upstream near-sdk release. Warnings: `wee_alloc` and `unsafe-libyaml` unmaintained (no fixed version).

### Secret scan (`npm run audit:secrets`)

```
real secrets known on this machine: 3 (values not shown) from .env + 11 key files
scanned: working-tree files (tracked + untracked-not-ignored), full history of 9 commits, built bundles (apps/web/dist, e2e/.app-dist)
tracked secret files: none
git-ignored .env / .cache/demo-account.json / packages/core/node_modules/.cache/perde-testnet/funder.json: yes / yes / yes
findings: 3 × "ed25519 signature (public, not a key)" (1Click quote signatures in a fixture and in evidence/)
RESULT: clean (no real secret in tree, history or bundle; secret files untracked)
```

The scan compares against the real values in `.env`, `.cache/*.json`, the core funder cache, the video agent's take states and `~/.near-credentials/testnet` (in memory only) and also looks for secret-shaped strings (NEAR ed25519 secret keys, BIP-39 phrases other than the public `abandon … about` test vector, GitHub/AWS/Slack/`sk-` tokens, PEM keys). The e2e suite never contains a key: the offline "wallet" key is generated per run (`throwawayNearKey()`), the live key is read from the ignored funder file.

### External origins (built bundle + observed traffic)

| Origin | When | Why |
| --- | --- | --- |
| `https://near-testnet.drpc.org` | every chain read; broadcast fallback | NEAR testnet JSON-RPC (first for reads) |
| `https://test.rpc.fastnear.com` | `send_tx`, `gas_price`; read fallback | NEAR testnet JSON-RPC (first for broadcasts) |
| `https://1click.chaindefuser.com` | Invoice / pay page "Pay from any chain" | 1Click token list and **dry** quotes |
| `https://helper.nearprotocol.com` | only on "Create & fund" | testnet faucet |
| `https://testnet.nearblocks.io`, `https://github.com` | user clicks a link (new tab, `rel="noopener noreferrer"`) | explorer / source; never fetched |

Strings present in the bundle but never contacted: `rpc.mainnet.near.org`, `free.rpc.fastnear.com`, `nearblocks.io` (core's mainnet constants), `react.dev` / `reactrouter.com` (error-message URLs), `www.w3.org` (SVG namespaces). Both suites fail on any request to an origin outside the first four + the preview host, so this list is enforced, not just observed.

**Content-Security-Policy** (added, production build only, `apps/web/vite.config.ts`): `default-src 'self'; script-src 'self' 'sha256-…' (the inline theme script); style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'` + the four origins above`; object-src 'none'; base-uri 'self'; form-action 'self'`. Both full suites ran against builds with it (a violation would be a console error and fail the test).

**XSS review.** No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function` or `document.write` in `apps/web/src` or `packages/core/src`. URL/chain/user strings (pay-link note, recipient, memo, receipt, account ids, quote fields) are rendered as React text; `#/pay` params are strictly parsed (`features/pay/params.ts`), notes stripped of control/bidi characters and capped at 140; explorer links use `encodeURIComponent`; every `target="_blank"` link (6) has `rel="noopener noreferrer"`; payroll CSV export neutralises spreadsheet formulas. Verified by the hostile-param tests above.

## Bugs

### Found and fixed (with tests)

| # | Bug | Fix | Test |
| --- | --- | --- | --- |
| 1 | Amount fields silently rewrote pasted input: `1e-3` → **13**, `-5` → 5, `1,000.50` → **1.00050** (Send, pay page, invoice, DAO, pay onward) | `acceptAmountInput()` refuses input whose meaning would change (field keeps its value); a lone decimal comma still works | unit (`near-format.test.ts`), e2e amount test |
| 2 | Unreadable or other-version stored state was replaced on the next save, silently destroying the wallet secret key and recovery phrase it held | copy kept under `perde:state:unreadable-backup` before starting over; Reset removes it | unit (`state.test.ts`), 2 e2e tests |
| 3 | Payroll CSV: a UTF-8 BOM turned the header into an error row; `;`-separated exports (EU spreadsheets) rejected entirely; quoted fields with commas split; `Alice.testnet` rejected although Send accepts it | BOM stripped, `;` detected (with decimal comma), quoted fields, names lowercased | unit (`csv.test.ts`), 3 e2e tests |
| 4 | Phones: the top bar overflowed by 11 px (Pixel) / 33 px (iPhone) when the wallet balance could not load ("balance unavailable") | compact wallet chip may shrink/ellipsis, shorter status | failure-path tests (overflow check) |
| 5 | Phones: long tx hashes / URLs in error callouts widened the page (37 px on `#/pay`) | callout text wraps anywhere | failure-path tests |
| 6 | No error boundary: a lazy page chunk that failed to download (flaky network, tab open across a redeploy) blanked the whole app | `RouteErrorBoundary` with a Reload button around app pages, pay page and kit | `resilience.spec.ts` |
| 7 | Compact wallet link: accessible name did not contain its visible text (axe serious, Lighthouse) | sr-only prefix instead of `aria-label` | axe scans |
| 8 | WebKit/Safari downloaded both preloaded fonts twice and warned "preloaded but not used" (it fetches same-origin fonts in no-cors mode; Chromium needs `crossorigin`) | font preload plugin removed from `vite.config.ts` | zero-console fixture on WebKit |
| 9 | 404 without `<main>`/`<h1>`, empty-state `h3` right after `h1`, skip links outside landmarks (axe moderate) | see Accessibility | axe scans |
| 10 | `/robots.txt` served the SPA HTML (Lighthouse SEO 91) | `apps/web/public/robots.txt` | Lighthouse |
| 11 | Quote result broke the chain name mid-word at 1440 px ("USDC · Ethe / reum"), seen on the demo video | only the amount may break anywhere; token · chain wraps between words | `resilience.spec.ts` (per-character line-break check) |
| 12 | ~0.3 s skeleton flash when opening the guided demo | chunk starts loading when the CTA is hovered/focused/touched; the route skeleton appears only after 350 ms | `resilience.spec.ts` |

### Checked, no bug

Hostile `#/pay` params (14 variants) and XSS note; homoglyph and `.near` names; uppercase names on Send; unregistered name; own meta-address; more than balance; below minimum; double-click submit (one signed tx); offline at submit; lost broadcast → hash shown, no auto-retry; RPC down / malformed / 500 / slow; 1Click 500 / timeout / down; faucet 429; two tabs; reload mid-scan; very long invoice notes (capped at 140, link validates); 50-row payroll limit (row 51 flagged) and chunking info; 600-announcement scan: 1.3 s (Chromium), 4.0 s (Firefox), 2.4 s (WebKit), 1.3 s (Pixel), 2.2 s (iPhone), 3 payments found, 4 page reads.

### Open (not fixed)

| Issue | Why not fixed / suggestion |
| --- | --- |
| A receipt's `tx` field is not authenticated: the Verify page checks meta/r/stealth against the announcement but still shows the receipt's transaction link, so an edited `tx` keeps "Verified payment" | needs a core change (check that the tx outcome contains the announcement) or a UI label "transaction (as claimed by the receipt)"; product decision |
| Verify page: following a second `?r=` deep link verifies the new receipt but leaves the previous text in the field | cosmetic; state is initialised once |
| `LazyMotion` feature loader has no `.catch`: if `motion-features` fails to download the rejection is unhandled (seen only while reloading in Firefox) | animations simply stay off; low impact |
| Clipboard API unavailable, navigating away mid-transaction | not covered by a test (`copyText` has an `execCommand` fallback by code review) |
| npm moderate (dev-only), `cargo audit` crypto-bigint, `.tools` installer | see audit tables |
| Lighthouse: unused JS, render-blocking CSS, `td-has-header`, app-start mobile LCP 3.3 s | targets met; larger refactors (code-split react-dom/motion, table header semantics in the illustration) |
| `apps/web/README.md` still says the two fonts are preloaded | not my file; the preload was removed (bug 8) |

### Notes on the tooling

- Playwright's `allTextContents()` on elements inside an open modal `<dialog>` crashes Firefox's content process (Playwright 1.65, Firefox build 1572, Windows); plain DOM reads work, so the test reads the words with `page.evaluate`.
- `context.setOffline(true)` does not stop requests that a Playwright route handler intercepts; the offline test therefore takes the RPC mock down at the same moment.
- During `page.reload()` Firefox and WebKit report the old document's cancelled requests (font downloads, fetches "due to access control checks", unreadable console arguments); only that reload test allows those messages.
- The first live run failed on a test selector after the first payments; that run's random identity was discarded with ≈0.05 NEAR in its stealth accounts (lost). The suite now sweeps on failure.

## Files

- `e2e/` — Playwright package: `playwright.config.ts` (offline), `playwright.testnet.config.ts` (live), `support/` (route mock, fixtures), `tests/`, `fixtures/recorded/`, `scripts/` (`serve.mjs`, `record-fixtures.mjs`, `lighthouse.mjs`, `secret-scan.mjs`, `summarize.mjs`).
- `docs/qa/lighthouse/` — Lighthouse summaries and the landing-page HTML report.
- App changes: `apps/web/src/{App.tsx, NotFound.tsx, route-loaders.ts, app-shell/AppLayout.tsx, landing/Landing.tsx, components/wallet/WalletWidget.tsx, features/anychain/AnyChainPanel.tsx, features/payroll/csv.ts, lib/near-format.ts, state/storage.ts, ui/AmountInput.tsx, ui/Feedback.tsx, ui/RouteErrorBoundary.tsx}` (+ unit tests), `apps/web/vite.config.ts` (font preload removed, CSP added), `apps/web/public/robots.txt`.
