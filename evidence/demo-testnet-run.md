# `npm run demo:testnet` — real run

One command at the repository root, no secrets and no wallet. Script: [`scripts/demo/demo-testnet.mjs`](../scripts/demo/demo-testnet.mjs) (plain Node ESM on top of the built `@perde/core`; it installs/builds `packages/core` first if `dist` is missing or older than `src`).

This run (2026-11-14, Windows 11, Node 24) had no `.cache/` and no `DEMO_*` variables, so step 0 created a fresh account through the public testnet faucet and cached it in the gitignored `.cache/demo-account.json`. A second run (`npm run -s demo:testnet -- --json`) reused that cached account (source `cache (.cache/demo-account.json)`), passed all steps in 23.7 s and printed the machine-readable result on stdout with the narration on stderr.

If the faucet refuses (rate limit: 10 accounts / ~12 h per IP), the demo stops at step 0 with exit code 2 and explains how to pass any funded testnet account via `DEMO_ACCOUNT_ID` / `DEMO_PRIVATE_KEY`.

Transcript (the npm banner removed; nothing else edited; no keys appear — the 12-word phrase, spending keys and the account key are never printed):

```text
Perde — private payments on NEAR (testnet demo)
contract perde-pay.testnet · https://testnet.nearblocks.io/address/perde-pay.testnet

━━ 0. Get a funded testnet account (no wallet, no secrets)
   asking the testnet faucet for perde-demo-3e72beda7e6e.testnet …
   account perde-demo-3e72beda7e6e.testnet — testnet faucet (4 creations left in this IP's window)
   balance 10 NEAR · https://testnet.nearblocks.io/address/perde-demo-3e72beda7e6e.testnet
   tx faucet account creation: https://testnet.nearblocks.io/txns/CPNFV4wUe8owML4RHdLgt2AANb1uK8RUGHcy9ZrMnrn6
   ✓ 3.4 s

━━ 1. Bob creates keys and a meta-address
   Bob generates a 12-word recovery phrase (kept in memory only; not printed).
   meta-address (public, shareable): perde:DWLvNtyj7QrV…8dVwZtS1eVaTdkiuVe
   viewing key (read-only, for Bob or his auditor): perdeview:DWLv…WnefLRiP1pqBa1
   Bob posts the meta-address once. Every payment to it lands in a different, fresh account.
   ✓ 0.0 s

━━ 2. Alice sends 0.1 NEAR privately through the Perde contract
   tx perde-demo-3e72beda7e6e.testnet → perde-pay.testnet.send (deposit 0.102 NEAR incl. 0.002 NEAR fee): https://testnet.nearblocks.io/txns/CjMXrLebqhfrkBDBTLHoTQnnro76FRUbBPydYvR7Xvhm
   one-time stealth account: 9d8d574ba88791cedd95d1bac63e73da1b6c67880d5e57db0a2f5aab76c573c1
   announcement #14; Alice keeps a private payment receipt
   ✓ 2.7 s

━━ 3. What the chain shows vs. what Bob sees
   Public observer:
     announcement row: {index: 14, stealth_account: 9d8d574ba8…ab76c573c1, ephemeral_pk: 0675f09858…2079f1a4d3, view_tag: 211, amount: 0.1 NEAR}
     9d8d574ba8…ab76c573c1 is a brand-new implicit account with 0.1 NEAR and no history: https://testnet.nearblocks.io/address/9d8d574ba88791cedd95d1bac63e73da1b6c67880d5e57db0a2f5aab76c573c1
     Nothing in the row or the account mentions Bob or his meta-address.
   Bob (viewing key):
     scanned 1 announcement(s): found 1 payment(s) for him → 9d8d574ba8…ab76c573c1 holding 0.1 NEAR
     Eve scanning the same announcements with her own key finds 0.
   ✓ 2.5 s

━━ 4. Bob claims the payment to a destination
   Destination: perde-demo-3e72beda7e6e.testnet (in this demo the funded account, so testnet NEAR is recycled; Bob would use his own account).
   tx stealth account → perde-demo-3e72beda7e6e.testnet (DeleteAccount, signed with the derived stealth key): https://testnet.nearblocks.io/txns/E4xTWnbZCBeG8vjMgFdb8eKkJx5nDpSFcJHzxnqdvNcv
   moved 0.1 NEAR minus 0.00005 NEAR gas; the stealth account is deleted, no dust left
   ✓ 1.8 s

━━ 5. Invoice mode: one-time address, paid with a plain transfer of 0.05 NEAR
   invoice #0 address (derived from Bob's keys, no contract, no announcement): af38fa96f9dcebdb6abd020b4964aea0d6e27b32c4f9e120a49d74a2ed77d5f6
   tx perde-demo-3e72beda7e6e.testnet → invoice address (ordinary NEAR Transfer — any wallet or exchange can pay it): https://testnet.nearblocks.io/txns/36g8WF9VxvW97aPQMFPNZPkncK3sY1AMpEPPFjWD3DWn
   Bob's scanInvoices(viewing key) found invoice #0 with 0.05 NEAR
   tx Bob sweeps invoice #0 (DeleteAccount): https://testnet.nearblocks.io/txns/76SuR9bM1aJ4W1qW5UDt15URzxNf2BMG69T1uDkJXUXj
   ✓ 4.3 s

━━ 6. Preview: "pay this invoice with USDC from Arbitrum" (NEAR Intents 1Click, DRY RUN)
   DRY-RUN PREVIEW — mainnet pricing from the real 1Click API; no deposit address, nothing executed.
   to deliver exactly 1 NEAR to Bob's invoice #1 (5d2e808fb4…e74eef22ea): pay ≈ 3.499467 USDC on Arbitrum (≈ $3.50), ~27 s
   ✓ 0.6 s

━━ 7. Receipt: Alice proves she paid Bob's meta-address
   receipt perdereceipt:eyJ…lkWXZSN1h2aG0ifQ → valid true, matches on-chain announcement #14: true
   same receipt claiming a different meta-address → valid false
   A receipt links one stealth account to the meta-address; it grants no spending power.
   ✓ 0.2 s

━━ 8. A DAO treasury pays a contributor privately (SputnikDAO proposal → perde.send)
   DAO perde-demo.sputnikv2.testnet (open demo policy), treasury available 2.91576 NEAR · https://testnet.nearblocks.io/address/perde-demo.sputnikv2.testnet
   tx add_proposal #2: FunctionCall perde-pay.testnet.send, bond 0.01 NEAR: https://testnet.nearblocks.io/txns/6RdpEYjzNnFcCej9mLHVKQFbZBGF2yxyetvPzerMJRYA
   public proposal text: "Contributor payout (demo)"; decoded: pays 0.02 NEAR to e0c84cf5df…cd5ef95b85 — no recipient name anywhere
   tx act_proposal VoteApprove → status Approved; the DAO calls perde.send in the same transaction: https://testnet.nearblocks.io/txns/6u3KtvmcSH4VJvAtwgKeTTQR6iVdVqxMGQh8QUsvJ1iW
   Bob's scan finds the DAO payment: 0.02 NEAR at e0c84cf5df…cd5ef95b85
   tx Bob claims the DAO payment: https://testnet.nearblocks.io/txns/BS743wHtszvaMjgVukJyo3YR2AHNsNMrPkB4dhS8Ggjb
   ✓ 11.5 s

Summary
#  step                                                            result  required  time    first tx     
0  Get a funded testnet account (no wallet, no secrets)            pass    yes       3.4 s   CPNFV4…rMnrn6
1  Bob creates keys and a meta-address                             pass    yes       0.0 s                
2  Alice sends 0.1 NEAR privately through the Perde contract       pass    yes       2.7 s   CjMXrL…R7Xvhm
3  What the chain shows vs. what Bob sees                          pass    yes       2.5 s                
4  Bob claims the payment to a destination                         pass    yes       1.8 s   E4xTWn…qdvNcv
5  Invoice mode: one-time address, paid with a plain transfer of…  pass    yes       4.3 s   36g8WF…WD3DWn
6  Preview: "pay this invoice with USDC from Arbitrum" (NEAR Int…  pass    no        0.6 s                
7  Receipt: Alice proves she paid Bob's meta-address               pass    yes       0.2 s                
8  A DAO treasury pays a contributor privately (SputnikDAO propo…  pass    yes       11.5 s  6RdpEY…rMJRYA

account perde-demo-3e72beda7e6e.testnet: 10 NEAR → 9.97488 NEAR (cost of the whole demo ≈ 0.02511 NEAR)
total runtime 27.0 s — all required steps passed
```
