# Demo script (about 2 minutes 30 seconds)

The automated recording [`demo/demo.webm`](demo/demo.webm) (also `demo/demo.mp4`) follows this script step by step against NEAR testnet. Regenerate it with `npm run demo:video`. To present it live, run `npm run dev` and follow the same steps.

Preparation for a live run: open **Settings & demo** once and create a demo wallet, so the faucet is not part of the timed demo.

| # | Time | Show | Say |
| --- | --- | --- | --- |
| 1 | 0:00 | Landing page. Toggle **Without Perde → With Perde** on the explorer illustration. | "On NEAR, every payment names its recipient. When a DAO pays Alice, everyone sees Alice got paid, how much, and what else she holds. With Perde the same payment goes to a fresh account nobody can link to her." |
| 2 | 0:15 | Scroll to **Why NEAR**. | "A NEAR implicit account is just an ed25519 public key in hex. So a stealth key is already a NEAR account. No pool holding funds, no relayer, no indexer, no backend. This is a static site talking to RPC." |
| 3 | 0:30 | Click **Try the live demo**. Open **Receive**: the 12-word phrase behind the curtain, then the meta-address and QR. Click **Register** under the wallet's name. | "Alice creates an identity once and gets one meta-address. She can register it under her NEAR name, so people can simply pay alice.testnet." |
| 4 | 0:50 | **Send**: type the registered name, 0.05 NEAR, **Review**. Point at the fresh stealth account. **Send**. Open the transaction link. | "The sender's browser derives a one-time account for Alice. One contract call records an announcement and moves the funds, atomically. On the explorer you see a payment to an address that has never existed before." |
| 5 | 1:10 | **Inbox**: the payment appears. Open **Chain view**. | "Alice's browser scans the public announcements with her view key. Only she can recognise this one. Left: what any observer can read. Right: what she knows." |
| 6 | 1:25 | **Claim to…** → confirm. Open the claim transaction. | "She claims it. The stealth account signs for itself with a key derived in her browser, and pays its own gas." |
| 7 | 1:40 | **DAO payout**: **Propose payout**, show the proposal card, **Approve & execute**, then **Open my Inbox**. | "Now the real use: a DAO treasury. This is a normal SputnikDAO proposal. The DAO votes in public, the amount is public, but the proposal contains no recipient. The contributor finds it in their inbox." |
| 8 | 2:00 | **Invoice**: create 0.5 NEAR, show the pay link and QR. **Pay from any chain** → USDC on Ethereum → **Get quote**. | "An invoice is a one-time account with no announcement at all, so an exchange or another chain can pay it. This is a live NEAR Intents quote: pay in USDC on Ethereum, the invoice receives NEAR. It is a dry-run preview; we have not executed cross-chain payments." |
| 9 | 2:15 | **Payroll**: **Load sample**, send. Then **Audit** with the viewing key. | "Payroll is one transaction with several private payments. And an accountant gets a viewing key: they can see every incoming payment, and cannot spend any of it." |
| 10 | 2:25 | Landing section **What the curtain hides — and what it doesn't**. | "Perde hides who was paid. Amounts, senders and timing stay public, and this is an unaudited testnet prototype. Everything you saw was real testnet transactions; `npm run demo:testnet` reproduces it in 25 seconds." |

## One-line versions

- Problem: "Every payment on NEAR names its recipient."
- Product: "One meta-address; every payment lands in a fresh account only you can find."
- NEAR's role: "An implicit account is an ed25519 key, so stealth addresses need no pool, no relayer and no indexer."
