# Demo video

[`demo.mp4`](demo.mp4) (H.264, for X and most players) and [`demo.webm`](demo.webm) (VP9) are the same 1:28 recording of the Perde web app on NEAR testnet. [`poster.png`](poster.png) is a frame for the thumbnail.

## The story

One story, two parties: **a DAO pays Alice, a contributor, without the chain learning it was Alice. Alice then spends the money without ever touching her named account.** One browser and one funded testnet wallet play both sides; a role chip in the top-right corner says who is acting ("DAO member" while the DAO proposes and approves the payout, "Alice · contributor" while she receives, scans and pays onward).

1. Title card, then the problem: on NEAR every payment names its recipient. The landing page toggles **Without Perde / With Perde**.
2. **Receive** (Alice): she creates an identity and gets one meta-address. The recovery phrase stays behind the curtain.
3. **DAO payout** (the DAO member): the meta-address is pasted, 0.1 NEAR, **Propose payout**. The public SputnikDAO proposal shows an amount and a fresh account, no recipient.
4. **Approve & execute**: the DAO votes and the payment executes in the same transaction.
5. **Inbox** (Alice): her browser scans the public announcements with her view key and finds the payout. The **Chain view** shows what anyone can read and what only she knows.
6. **Pay someone from here**: she pays 0.02 NEAR onward to a second, freshly generated meta-address. The stealth account signs for itself and pays its own gas; her named account never appears.
7. **Why NEAR**: an implicit account is an ed25519 key, so a stealth key already is an account. No pool, relayer, indexer or backend.
8. End card.

Every transaction on screen is real and was signed in the browser on NEAR testnet; nothing is mocked or edited in, and chain waits are shown as they happened. The recorder adds only a presentation layer drawn over the page: a cursor (Playwright's video does not show the OS cursor), captions, the role chip, the title card and the end card. The 12-word recovery phrase stays behind the app's curtain and the wallet key is never shown. The second meta-address ("someone Alice pays") is generated off-camera with `@perde/core`; only its public meta-address is used.

The page is laid out at 1024×576 CSS px and rendered at 1.875× (1920×1080 output), so the app's own text is large enough to read on a phone while the desktop sidebar layout still shows.

## Timestamps

| Time | Step |
| --- | --- |
| 0:00 | Title card |
| 0:03 | 1 · The problem |
| 0:12 | 2 · Receive |
| 0:24 | 3 · DAO payout |
| 0:38 | 4 · Approve |
| 0:46 | 5 · Inbox |
| 0:58 | 6 · Pay onward |
| 1:16 | 7 · Why NEAR |
| 1:24 | End card |

## How it was recorded

```bash
npm run demo:video          # build, record, convert, sweep leftovers back to the demo wallet
npm run demo:video -- --dry # only checks selectors and navigation, no transactions
```

The script is [`scripts/video/record-demo.mjs`](../scripts/video/record-demo.mjs). It builds the app into `scripts/video/.build/`, serves it locally, injects a funded throwaway testnet account (`.cache/demo-account.json`, not committed) into the app's storage, records with Playwright's `recordVideo`, trims the page-load frames and converts with the project-local `ffmpeg-static` binary. After the take it claims what is left of the payout back to the demo wallet, so a take costs only gas, fees and the small onward payment.

Recorded 2026-11-14 15:45 UTC. Take: take-2026-11-14T15-43-51-779Z.
