# Demo video

[`demo.mp4`](demo.mp4) (H.264, for X and most players) and [`demo.webm`](demo.webm) (VP9) are the same 2:54 recording of the Perde web app on NEAR testnet. It follows [DEMO.md](../DEMO.md) step by step. [`poster.png`](poster.png) is a frame for the thumbnail.

## What it shows

The production build of `apps/web`, driven by Playwright in Chromium at 1920×1080. Every transaction on screen is real and was signed in the browser on NEAR testnet: registering a name, a private payment by NEAR name, the inbox scan, a claim signed by the stealth account itself, a SputnikDAO proposal and its execution, a payroll batch and an audit with a viewing key. The NEAR Intents quote is a real 1Click **dry** quote (nothing executed). Nothing is mocked or edited in; long chain waits are shown as they happened.

The recorder adds only a presentation layer drawn over the page: a cursor (Playwright's video does not show the OS cursor), captions, the title card and the end card. The 12-word recovery phrase stays behind the app's curtain and the wallet key is never shown.

## Timestamps

| Time | Step |
| --- | --- |
| 0:00 | Title card |
| 0:03 | 1 · The problem |
| 0:13 | 2 · Why NEAR |
| 0:22 | 3 · Receive |
| 0:44 | 4 · Send by name |
| 1:11 | 5 · Inbox |
| 1:17 | 6 · Claim |
| 1:38 | 7 · DAO payout |
| 2:01 | 8 · Invoice, any chain |
| 2:20 | 9 · Payroll & audit |
| 2:41 | 10 · Honest limits |
| 2:50 | End card |

## How it was recorded

```bash
npm run demo:video          # build, record, convert, sweep leftovers back to the demo wallet
npm run demo:video -- --dry # only checks selectors and navigation, no transactions
```

The script is [`scripts/video/record-demo.mjs`](../scripts/video/record-demo.mjs). It builds the app into `scripts/video/.build/`, serves it locally, injects a funded throwaway testnet account (`.cache/demo-account.json`, not committed) into the app's storage, records with Playwright's `recordVideo`, trims the page-load frames and converts with the project-local `ffmpeg-static` binary. After the take it claims every payment it created back to the demo wallet and unregisters the name, so a take costs only gas and fees.

Recorded 2026-11-14 10:42 UTC. Take: take-2026-11-14T10-39-08-542Z. Explorer: testnet.nearblocks.io answered headless Chromium with a Cloudflare check, so the video uses the in-app Chain view, which reads the same transaction and announcement from RPC.
